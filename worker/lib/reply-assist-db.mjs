// Database side of the reply assistant. Writes a classification and, when it makes sense, a DRAFT answer.
// It never queues or sends anything: the user opens the draft and clicks Send.
import { sb } from './db.mjs';
import { log } from './log.mjs';
import { nowIso } from './util.mjs';
import { getSetting } from './settings.mjs';
import { runClaude, extractJson, claudeStatus } from './claude.mjs';
import { evaluateOutreach } from './safety.mjs';
import { DEFAULT_SENDING } from './safety-send.mjs';
import { LOCKED_STATUSES } from './draft-core.mjs';
import {
  NO_DRAFT, ASSIST_SYSTEM, classifyAssistRules, proposeNextStep, buildAssistPrompt, parseAssistJson, templateReply, replySubject, nextReplyStep,
} from './reply-assist-core.mjs';

const SKIP = new Set(['bounce', 'out_of_office']);

// Marks the reply as pending and queues one job. Returns false when it was already queued or done.
export async function enqueueAssist(replyId, { force = false, instruction } = {}) {
  const q = sb.from('replies').update({ assist_status: 'pending' }).eq('id', replyId);
  const { data } = await (force ? q : q.is('assist_status', null)).select('id').maybeSingle();
  if (!data) return false;
  await sb.from('jobs').insert({ type: 'reply_assist', payload: { reply_id: replyId, instruction: instruction || null, auto: !force } });
  return true;
}

let claudeOk = { at: 0, available: false };
async function aiAvailable() {
  if (Date.now() - claudeOk.at > 5 * 60 * 1000) claudeOk = { at: Date.now(), available: (await claudeStatus()).available };
  return claudeOk.available;
}

const firstName = (s) => {
  const w = String(s || '').trim().split(/\s+/)[0];
  return /^[A-Za-z][A-Za-z'-]{1,}$/.test(w) ? w : '';
};

async function classifyAndWrite(ctx) {
  const rules = classifyAssistRules(ctx.reply.body, ctx.reply.subject);
  // Stop requests and automatic replies are decided by rules, never by a model: the safe answer is fixed.
  if (SKIP.has(ctx.reply.category) || NO_DRAFT.has(rules.category)) return { category: SKIP.has(ctx.reply.category) ? 'out_of_office' : rules.category, summary: rules.summary, body: '', reason: '', mode: 'rules' };
  if (await aiAvailable()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await runClaude(buildAssistPrompt(ctx), { system: ASSIST_SYSTEM });
        return { ...parseAssistJson(extractJson(text)), mode: 'claude' };
      } catch (e) {
        log('reply-assist', `AI attempt ${attempt} failed: ${e.message}`);
      }
    }
  }
  return { category: rules.category, summary: rules.summary, body: templateReply({ category: rules.category, reply: ctx.reply, profile: ctx.profile }), reason: '', mode: 'template' };
}

export async function assistReply(replyId, { instruction, force = false } = {}) {
  const { data: reply } = await sb.from('replies').select('*').eq('id', replyId).maybeSingle();
  if (!reply) throw new Error('Reply not found');
  if (!force && reply.assist_status === 'done' && reply.assist) return { ok: true, cached: true, category: reply.assist.classification };
  await sb.from('replies').update({ assist_status: 'pending' }).eq('id', replyId);

  try {
    const [{ data: lead }, { data: original }, profile, summary, rulesSetting, sendingRaw] = await Promise.all([
      reply.lead_id ? sb.from('leads').select('*').eq('id', reply.lead_id).maybeSingle() : { data: null },
      reply.outreach_id ? sb.from('outreach').select('subject,body,step').eq('id', reply.outreach_id).maybeSingle() : { data: null },
      getSetting('profile'), getSetting('profile_summary'), getSetting('writing_rules'), getSetting('sending'),
    ]);
    const sending = { ...DEFAULT_SENDING, ...sendingRaw };
    const allowedLinks = [...new Set([...(profile.websites || []), ...(profile.links || [])].filter(Boolean))].slice(0, 4);
    const out = await classifyAndWrite({ reply, lead, profile, summary, rules: rulesSetting.markdown || '', original, allowedLinks, instruction });

    const name = firstName(reply.from_name) || firstName(lead?.owner_name) || 'them';
    const plan = proposeNextStep(out.category, { name });
    let alreadySuppressed = false;
    if (out.category === 'unsubscribe' && reply.from_email) {
      const { data: sup } = await sb.from('suppressions').select('email').eq('email', reply.from_email.toLowerCase()).maybeSingle();
      alreadySuppressed = !!sup;
    }

    let draftId = null;
    const { data: rows } = reply.lead_id ? await sb.from('outreach').select('id,step,status,reply_to_id').eq('lead_id', reply.lead_id) : { data: [] };
    const mine = (rows || []).filter((r) => r.reply_to_id === reply.id);
    if (NO_DRAFT.has(out.category)) {
      // A stop request must not leave a pitch lying around from an earlier guess.
      for (const r of mine.filter((x) => x.status === 'draft')) await sb.from('outreach').delete().eq('id', r.id);
    } else if (reply.lead_id && out.body) {
      const locked = mine.find((r) => LOCKED_STATUSES.includes(r.status));
      if (locked) {
        draftId = locked.id;
      } else {
        const subject = replySubject(reply.subject || original?.subject);
        const fields = {
          lead_id: reply.lead_id, reply_to_id: reply.id, channel: reply.from_email ? 'email' : 'manual', to_email: reply.from_email || null, to_name: reply.from_name || null,
          subject, body: out.body, original_subject: subject, original_body: out.body, status: 'draft', error: null,
          confirmed_suspicious: false, override_warnings: false, updated_at: nowIso(),
        };
        const warnTemplate = out.mode === 'template' ? [{ level: 'warn', code: 'template', message: 'Written from a template because the AI was not available. Read it carefully.' }] : [];
        fields.warnings = await evaluateOutreach({ ...fields, step: 10, warnings: warnTemplate }, { lead, profile, sending });
        const existing = mine.find((r) => ['draft', 'failed', 'cancelled'].includes(r.status));
        if (existing) {
          await sb.from('outreach').update(fields).eq('id', existing.id);
          draftId = existing.id;
        } else {
          for (let attempt = 0; attempt < 3 && !draftId; attempt++) {
            const step = nextReplyStep((rows || []).map((r) => r)) + attempt;
            const { data, error } = await sb.from('outreach').insert({ ...fields, step }).select('id').maybeSingle();
            if (data) draftId = data.id;
            else if (error && error.code !== '23505') throw new Error(error.message);
          }
        }
      }
    }

    const assist = {
      classification: out.category, summary: out.summary || '', next_step: { ...plan.next_step, reason: out.reason || plan.next_step.reason },
      actions: plan.actions, task: plan.task, draft_outreach_id: draftId, mode: out.mode, generated_at: nowIso(),
      suppress_email: out.category === 'unsubscribe' ? (reply.from_email || null) : null, already_suppressed: alreadySuppressed,
    };
    await sb.from('replies').update({ assist, assist_status: 'done' }).eq('id', replyId);
    return { ok: true, category: out.category, draft_id: draftId, mode: out.mode };
  } catch (e) {
    await sb.from('replies').update({ assist_status: 'failed' }).eq('id', replyId);
    throw e;
  }
}

// Replies that arrived without going through the replies handler (or while the worker was off).
export async function assistScan() {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data } = await sb.from('replies').select('id,category').is('assist_status', null).gte('created_at', since).limit(5);
  let n = 0;
  for (const r of data || []) {
    if (SKIP.has(r.category)) {
      await sb.from('replies').update({ assist_status: 'skipped', assist: { classification: r.category === 'bounce' ? 'other' : 'out_of_office', next_step: null, actions: [], task: null, draft_outreach_id: null } }).eq('id', r.id).is('assist_status', null);
      continue;
    }
    if (await enqueueAssist(r.id)) n++;
  }
  return n;
}
