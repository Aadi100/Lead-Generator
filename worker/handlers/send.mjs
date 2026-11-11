import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { sendMail } from '../lib/mailer.mjs';
import { evaluateOutreach, blockers, describeBlockers } from '../lib/safety.mjs';
import {
  DEFAULT_SENDING, readSendingFresh, startOfLocalDay, dueDates, followUpSubject, messageIdFor, composeBody, followupEligibility,
} from '../lib/safety-send.mjs';

let lastSendAt = 0;
let busy = false;
const gapMs = () => Number(process.env.SEND_GAP_MS ?? 20000);
const nowIso = () => new Date().toISOString();

async function setRow(id, fromStatus, patch) {
  const { data } = await sb.from('outreach').update({ ...patch, updated_at: nowIso() }).eq('id', id).eq('status', fromStatus).select().maybeSingle();
  return data;
}

async function sendOne(row, sending, now) {
  if (row.channel !== 'email') {
    if (row.status === 'queued') await setRow(row.id, 'queued', { status: 'draft', error: 'Manual messages are not sent by the worker. Copy it and mark it as sent.' });
    return { sent: false };
  }
  if (sending.provider === 'none') {
    if (row.status === 'queued') await setRow(row.id, 'queued', { status: 'draft', error: 'No email provider is set up (Settings > Email sending).' });
    return { sent: false };
  }

  const [{ data: lead }, { data: rows }] = await Promise.all([
    sb.from('leads').select('*').eq('id', row.lead_id).maybeSingle(),
    sb.from('outreach').select('*').eq('lead_id', row.lead_id).order('step'),
  ]);
  if (!lead) {
    await setRow(row.id, row.status, { status: 'cancelled', error: 'The lead no longer exists.' });
    return { sent: false };
  }

  if (row.step > 1) {
    const prev = (rows || []).find((r) => r.step === row.step - 1);
    const el = followupEligibility({ row, prev, lead, now });
    if (el.action === 'cancel') {
      await setRow(row.id, row.status, { status: 'cancelled', error: `Not sent: ${el.reason}.` });
      return { sent: false };
    }
    if (el.action === 'wait') return { sent: false };
  }

  const original = row.status;
  const claimed = await setRow(row.id, original, { status: 'sending', error: null });
  if (!claimed) return { sent: false };

  const profile = await getSetting('profile');
  const imap = await getSetting('imap');
  const warnings = await evaluateOutreach(claimed, { lead, profile, sending, imapUser: imap.user });
  const block = blockers(warnings, claimed);
  if (block.length) {
    const hard = block.some((w) => w.level === 'hard');
    await setRow(row.id, 'sending', {
      status: row.step > 1 && hard ? 'cancelled' : 'draft', warnings, error: `Held: ${describeBlockers(block)}`,
    });
    log('send', `held ${row.id.slice(0, 8)}: ${describeBlockers(block)}`);
    return { sent: false };
  }

  const fresh = await readSendingFresh();
  const { data: cur } = await sb.from('outreach').select('status').eq('id', row.id).maybeSingle();
  if (fresh.paused || cur?.status !== 'sending') {
    if (cur?.status === 'sending') await setRow(row.id, 'sending', { status: original });
    return { sent: false };
  }

  const step1 = (rows || []).find((r) => r.step === 1);
  const subject = row.step > 1 ? followUpSubject(step1?.subject || row.subject) : claimed.subject;
  const headers = row.step > 1 && step1?.message_id ? { 'In-Reply-To': step1.message_id, References: step1.message_id } : undefined;
  try {
    const res = await sendMail({
      to: claimed.to_email, subject, text: composeBody(claimed.body, fresh.footer), headers,
      messageId: messageIdFor(row.id, fresh.from_email),
    });
    lastSendAt = Date.now();
    const sentAt = nowIso();
    const done = await setRow(row.id, 'sending', { status: 'sent', sent_at: sentAt, message_id: res.messageId, provider: res.provider, error: null, warnings });
    if (!done) log('send', `WARNING: ${row.id} was sent but the row could not be marked sent. Check your Sent folder.`);
    log('send', `sent step ${row.step} to ${claimed.to_email} via ${res.provider}`);

    const leadPatch = { pitched_at: lead.pitched_at || sentAt };
    if (lead.status === 'New') leadPatch.status = 'Pitched';
    await sb.from('leads').update(leadPatch).eq('id', lead.id);

    if (row.step === 1) {
      const dates = dueDates(sentAt, fresh.followup_days);
      for (const r of (rows || []).filter((x) => x.step > 1 && x.status === 'scheduled' && !x.due_at)) {
        const d = dates[r.step - 2];
        if (d) await sb.from('outreach').update({ due_at: d.toISOString(), updated_at: nowIso() }).eq('id', r.id).eq('status', 'scheduled');
      }
      const changed = (claimed.original_body && claimed.original_body.trim() !== claimed.body.trim()) || (claimed.original_subject && claimed.original_subject.trim() !== (claimed.subject || '').trim());
      if (changed) {
        await sb.from('learning_events').insert({
          kind: 'draft_edit', lead_id: lead.id, outreach_id: row.id,
          data: { original_subject: claimed.original_subject, original_body: claimed.original_body, final_subject: claimed.subject, final_body: claimed.body },
        });
      }
    }
    return { sent: true };
  } catch (e) {
    await setRow(row.id, 'sending', { status: 'failed', error: String(e.message || e).slice(0, 400), warnings });
    log('send', `FAILED ${row.id.slice(0, 8)}: ${e.message}`);
    return { sent: false };
  }
}

export async function processSendQueue({ now = new Date() } = {}) {
  const sending = await readSendingFresh();
  if (sending.paused) return { skipped: 'paused' };

  const { data: queued } = await sb.from('outreach').select('*').eq('status', 'queued').order('updated_at').limit(10);
  const { data: due } = await sb.from('outreach').select('*').eq('status', 'scheduled').not('due_at', 'is', null).lte('due_at', now.toISOString()).order('due_at').limit(10);
  const candidates = [...(queued || []), ...(due || [])];
  if (!candidates.length) return { sent: 0 };

  const { data: lastRow } = await sb.from('outreach').select('sent_at').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(1);
  const lastDb = lastRow?.[0]?.sent_at ? new Date(lastRow[0].sent_at).getTime() : 0;
  if (Date.now() - Math.max(lastSendAt, lastDb) < gapMs()) return { skipped: 'gap' };

  const { count } = await sb.from('outreach').select('id', { count: 'exact', head: true })
    .in('status', ['sent', 'replied']).gte('sent_at', startOfLocalDay(now).toISOString());
  if ((count || 0) >= (Number(sending.daily_limit) || DEFAULT_SENDING.daily_limit)) return { skipped: 'daily_limit' };

  for (const row of candidates) {
    const r = await sendOne(row, sending, now);
    if (r.sent) return { sent: 1, id: row.id };
  }
  return { sent: 0 };
}

export const jobs = {
  async test_email(job) {
    const sending = await getSetting('sending');
    const profile = await getSetting('profile');
    const to = job.payload?.to || sending.from_email || profile.email;
    if (!to) return { ok: false, error: 'No address to send the test to. Fill in the "from" email first.' };
    try {
      const res = await sendMail({
        to, subject: 'Lead Radar test email',
        text: 'This is a test message from Lead Radar. If you can read this, email sending works.',
      });
      return { ok: true, provider: res.provider, to };
    } catch (e) {
      return { ok: false, error: String(e.message || e).slice(0, 400) };
    }
  },
};

export const tasks = [
  {
    name: 'send-loop', everyMs: 3000, initialDelayMs: 5000,
    async run() {
      if (busy) return;
      busy = true;
      try { await processSendQueue(); } finally { busy = false; }
    },
  },
];
