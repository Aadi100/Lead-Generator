import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting, setSetting } from '../lib/settings.mjs';
import { runClaude, extractJson, claudeStatus } from '../lib/claude.mjs';
import { notify } from '../lib/notify.mjs';
import {
  REPLY_CATEGORIES, fromAddress, isOwnMessage, isBounce, bouncedRecipient, matchReply, cleanReplyBody,
  classifyReplyRules, buildClassifyPrompt,
} from '../lib/replies-core.mjs';

const nowIso = () => new Date().toISOString();

function client(imap) {
  const c = new ImapFlow({
    host: imap.host, port: Number(imap.port) || 993, secure: imap.secure !== false,
    auth: { user: imap.user, pass: imap.pass }, logger: false,
    connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 60000,
  });
  c.on('error', () => {});
  return c;
}

// Read-only: never marks mail as read and never deletes anything.
async function fetchSources(imap, since, limit = 200) {
  const c = client(imap);
  await c.connect();
  const sources = [];
  try {
    const lock = await c.getMailboxLock(imap.folder || 'INBOX', { readOnly: true });
    try {
      const uids = (await c.search({ since }, { uid: true })) || [];
      const list = uids.slice(-limit);
      for (let i = 0; i < list.length; i += 50) {
        for await (const m of c.fetch(list.slice(i, i + 50).join(','), { source: true, uid: true }, { uid: true })) sources.push(m.source);
      }
    } finally {
      lock.release();
    }
  } finally {
    await c.logout().catch(() => {});
  }
  return sources;
}

async function classify(parsed, budget) {
  const rules = classifyReplyRules(parsed.text, parsed.subject, parsed.headers);
  if (rules.category === 'out_of_office' || budget.ai <= 0 || !(await claudeStatus()).available) return rules;
  budget.ai -= 1;
  try {
    const out = extractJson(await runClaude(buildClassifyPrompt(parsed.subject, parsed.text), { timeoutMs: 90000 }));
    if (REPLY_CATEGORIES.includes(out.category)) return { category: out.category, summary: String(out.summary || rules.summary).slice(0, 200) };
  } catch (e) {
    log('replies', `AI classify failed: ${e.message}`);
  }
  return rules;
}

export async function handleBounce(parsed, rows) {
  const failed = bouncedRecipient(parsed, rows.map((r) => r.to_email));
  if (!failed) return false;
  const hits = rows.filter((r) => String(r.to_email || '').toLowerCase() === failed);
  await sb.from('suppressions').upsert({ email: failed, reason: 'bounced' });
  for (const leadId of new Set(hits.map((h) => h.lead_id))) {
    const { data: lead } = await sb.from('leads').select('emails,best_email').eq('id', leadId).maybeSingle();
    if (!lead) continue;
    const emails = (lead.emails || []).map((e) => (String(e.email).toLowerCase() === failed ? { ...e, status: 'unknown', bounced: true } : e));
    const patch = { emails };
    if (String(lead.best_email || '').toLowerCase() === failed) patch.best_email_status = 'unknown';
    await sb.from('leads').update(patch).eq('id', leadId);
    await sb.from('outreach').update({ status: 'cancelled', error: 'Cancelled: the address bounced', updated_at: nowIso() }).eq('lead_id', leadId).in('status', ['scheduled', 'queued']);
    await sb.from('replies').insert({
      lead_id: leadId, outreach_id: hits.find((h) => h.lead_id === leadId)?.id || null, from_email: fromAddress(parsed).email, subject: parsed.subject || '',
      body: cleanReplyBody(parsed.text).slice(0, 1500), message_id: parsed.messageId || `bounce:${failed}:${parsed.date?.toISOString?.() || nowIso()}`,
      received_at: parsed.date || nowIso(), category: 'bounce', summary: `Email to ${failed} bounced`, handled: false,
    });
  }
  log('replies', `bounce for ${failed}`);
  return true;
}

export async function handleReply(parsed, match, budget, alerts) {
  const { row } = match;
  const from = fromAddress(parsed);
  const { category, summary } = await classify(parsed, budget);
  const receivedAt = parsed.date ? new Date(parsed.date).toISOString() : nowIso();
  const messageId = parsed.messageId || `noid:${from.email}:${receivedAt}:${parsed.subject || ''}`;
  const { error } = await sb.from('replies').insert({
    outreach_id: row.id, lead_id: row.lead_id, from_email: from.email, from_name: from.name, subject: parsed.subject || '',
    body: cleanReplyBody(parsed.text), message_id: messageId, received_at: receivedAt, category, summary, handled: category === 'out_of_office',
  });
  if (error) return error.code === '23505' ? { duplicate: true } : Promise.reject(new Error(error.message));
  if (category === 'out_of_office') return { category };

  await sb.from('outreach').update({ status: 'replied', updated_at: nowIso() }).eq('id', row.id).in('status', ['sent', 'replied']);
  await sb.from('outreach').update({ status: 'cancelled', error: 'Cancelled: they replied', updated_at: nowIso() }).eq('lead_id', row.lead_id).in('status', ['scheduled', 'queued']);
  const { data: lead } = await sb.from('leads').select('status,title').eq('id', row.lead_id).maybeSingle();
  if (lead && !['Won', 'Lost'].includes(lead.status)) await sb.from('leads').update({ status: 'Replied', replied_at: receivedAt }).eq('id', row.lead_id);
  if (category === 'not_interested') await sb.from('suppressions').upsert({ email: from.email, reason: 'asked not to be contacted' });
  await sb.from('learning_events').insert({ kind: 'reply', lead_id: row.lead_id, outreach_id: row.id, data: { category, step: row.step } });

  if (alerts.enabled && alerts.on_reply) {
    try {
      await notify({
        subject: `Reply from ${from.name || from.email}`,
        text: `${category.replace('_', ' ')} reply to "${lead?.title || ''}"\n${summary}\n\nOpen the Outbox in Lead Radar to answer.`,
      });
    } catch (e) {
      log('replies', `alert failed: ${e.message}`);
    }
  }
  return { category };
}

export async function checkReplies() {
  const imap = await getSetting('imap');
  if (!imap.enabled || !imap.host || !imap.user) return { checked: 0, matched: 0, skipped: 'not configured' };
  const [sending, profile, alerts, state] = await Promise.all([getSetting('sending'), getSetting('profile'), getSetting('alerts'), getSetting('imap_state')]);
  const fourteen = Date.now() - 14 * 86400000;
  const last = state.last_checked ? new Date(state.last_checked).getTime() - 86400000 : 0;
  const since = new Date(Math.max(last, fourteen));
  try {
    const sources = await fetchSources(imap, since);
    const { data: rows } = await sb.from('outreach').select('id,lead_id,step,to_email,message_id,status,sent_at').not('sent_at', 'is', null).limit(2000);
    const own = [sending.from_email, profile.email, imap.user];
    const parsedList = [];
    for (const s of sources) {
      try { parsedList.push(await simpleParser(s)); } catch { /* skip unreadable message */ }
    }
    const ids = parsedList.map((p) => p.messageId).filter(Boolean);
    const { data: seen } = ids.length ? await sb.from('replies').select('message_id').in('message_id', ids) : { data: [] };
    const seenSet = new Set((seen || []).map((r) => r.message_id));
    const budget = { ai: 10 };
    let matched = 0;
    for (const p of parsedList) {
      const from = fromAddress(p).email;
      if (!from || isOwnMessage(from, own) || (p.messageId && seenSet.has(p.messageId))) continue;
      try {
        if (isBounce(p)) { if (await handleBounce(p, rows || [])) matched++; continue; }
        const m = matchReply({ parsed: p, rows: rows || [] });
        if (!m) continue;
        const r = await handleReply(p, m, budget, alerts);
        if (!r.duplicate) matched++;
      } catch (e) {
        log('replies', `message skipped: ${e.message}`);
      }
    }
    await setSetting('imap_state', { last_checked: nowIso(), last_error: null });
    return { checked: parsedList.length, matched };
  } catch (e) {
    await setSetting('imap_state', { ...state, last_error: String(e.message || e).slice(0, 300) });
    throw e;
  }
}

export const jobs = {
  async check_replies() {
    try { return await checkReplies(); } catch (e) { return { checked: 0, matched: 0, error: String(e.message || e).slice(0, 300) }; }
  },
  async test_imap() {
    const imap = await getSetting('imap');
    if (!imap.host || !imap.user) return { ok: false, error: 'Fill in the IMAP host and user first.' };
    const c = client(imap);
    try {
      await c.connect();
      const lock = await c.getMailboxLock(imap.folder || 'INBOX', { readOnly: true });
      const messages = c.mailbox?.exists ?? 0;
      lock.release();
      return { ok: true, messages };
    } catch (e) {
      return { ok: false, error: String(e.message || e).slice(0, 300) };
    } finally {
      await c.logout().catch(() => {});
    }
  },
};

export const tasks = [
  {
    name: 'check-replies', everyMs: 120000, initialDelayMs: 20000,
    async run() {
      try {
        const r = await checkReplies();
        if (r.matched) log('replies', `${r.matched} new reply/bounce`);
      } catch (e) {
        log('replies', `inbox check failed: ${e.message}`);
      }
    },
  },
];
