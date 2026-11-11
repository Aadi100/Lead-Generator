import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { runClaude, extractJson, claudeStatus } from '../lib/claude.mjs';
import { evaluateOutreach } from '../lib/safety.mjs';
import { DEFAULT_SENDING } from '../lib/safety-send.mjs';
import { LOCKED_STATUSES, pickRecipient, followupSteps, parseDraftJson, templateDrafts } from '../lib/draft-core.mjs';
import { DRAFT_SYSTEM, buildDraftPrompt } from '../lib/prompts-draft.mjs';

const nowIso = () => new Date().toISOString();
let claudeOk = { at: 0, available: false };

async function aiAvailable() {
  if (Date.now() - claudeOk.at > 5 * 60 * 1000) claudeOk = { at: Date.now(), available: (await claudeStatus()).available };
  return claudeOk.available;
}

async function generate(args) {
  if (await aiAvailable()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await runClaude(buildDraftPrompt(args), { system: DRAFT_SYSTEM });
        return { ...parseDraftJson(extractJson(text), args), mode: 'claude' };
      } catch (e) {
        log('draft', `AI attempt ${attempt} failed: ${e.message}`);
      }
    }
  }
  return { ...templateDrafts(args), mode: 'template' };
}

export async function draftForLead(leadId, { instruction } = {}) {
  const { data: lead } = await sb.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (!lead) throw new Error('Lead not found');
  const [profile, summary, rulesSetting, sendingRaw, targeting] = await Promise.all([
    getSetting('profile'), getSetting('profile_summary'), getSetting('writing_rules'), getSetting('sending'), getSetting('targeting'),
  ]);
  const sending = { ...DEFAULT_SENDING, ...sendingRaw };
  const { data: rows } = await sb.from('outreach').select('*').eq('lead_id', leadId).order('step');
  const existing = rows || [];
  if (existing.some((r) => r.step === 1 && LOCKED_STATUSES.includes(r.status))) {
    return { ok: false, error: 'The first message is already queued or sent, so it cannot be redrafted.' };
  }

  const rec = pickRecipient(lead);
  const channel = rec.channel;
  const steps = [1, ...Array.from({ length: followupSteps(sending) }, (_, i) => i + 2)];
  const writeSteps = steps.filter((s) => !existing.some((r) => r.step === s && LOCKED_STATUSES.includes(r.status)));
  const allowedLinks = [...new Set([...(profile.websites || []), ...(profile.links || [])].filter(Boolean))].slice(0, 4);
  const current = instruction
    ? existing.filter((r) => ['draft', 'failed', 'cancelled'].includes(r.status) && r.body).map((r) => ({ step: r.step, subject: r.subject, body: r.body }))
    : undefined;

  const gen = await generate({
    lead, profile, summary, targeting, rules: rulesSetting.markdown || '', channel, steps: writeSteps, current, instruction, allowedLinks,
  });

  const base = {
    lead_id: leadId, channel, to_email: rec.email, to_name: rec.name, status: 'draft', error: null,
    confirmed_suspicious: false, override_warnings: false,
  };
  const warnTemplate = gen.mode === 'template' ? [{ level: 'warn', code: 'template', message: 'Written from a template because the AI was not available. Read it carefully.' }] : [];
  const written = [];
  for (const m of gen.messages) {
    const subject = channel === 'manual' ? '' : m.step === 1 ? gen.subject : `Re: ${gen.subject}`;
    const fields = { ...base, step: m.step, subject, body: m.body, original_subject: subject, original_body: m.body, updated_at: nowIso() };
    const probe = { ...fields, warnings: warnTemplate };
    fields.warnings = await evaluateOutreach(probe, { lead, profile, sending });
    const old = existing.find((r) => r.step === m.step);
    if (old) {
      const { data } = await sb.from('outreach').update(fields).eq('id', old.id).in('status', ['draft', 'failed', 'cancelled']).select('id').maybeSingle();
      if (data) written.push(m.step);
    } else {
      const { error } = await sb.from('outreach').insert(fields);
      if (!error) written.push(m.step);
      else if (error.code !== '23505') throw new Error(error.message);
    }
  }
  await sb.from('outreach').delete().eq('lead_id', leadId).gt('step', steps.length).in('status', ['draft', 'cancelled']);

  if (instruction) {
    await sb.from('learning_events').insert({
      kind: 'rewrite_instruction', lead_id: leadId,
      data: { instruction, before: (current || []).find((c) => c.step === 1) || null },
    });
  }
  return { ok: true, channel, steps: written, mode: gen.mode };
}

async function checkForLead(leadId) {
  const [{ data: lead }, { data: rows }] = await Promise.all([
    sb.from('leads').select('*').eq('id', leadId).maybeSingle(),
    sb.from('outreach').select('*').eq('lead_id', leadId).in('status', ['draft', 'failed']).order('step'),
  ]);
  if (!lead) throw new Error('Lead not found');
  const [profile, sendingRaw] = await Promise.all([getSetting('profile'), getSetting('sending')]);
  const sending = { ...DEFAULT_SENDING, ...sendingRaw };
  const out = [];
  for (const row of rows || []) {
    const warnings = await evaluateOutreach(row, { lead, profile, sending });
    await sb.from('outreach').update({ warnings, updated_at: nowIso() }).eq('id', row.id).in('status', ['draft', 'failed']);
    out.push(...warnings.map((w) => ({ ...w, step: row.step })));
  }
  return { warnings: out };
}

export const jobs = {
  draft_lead: (job) => draftForLead(job.payload?.lead_id, { instruction: job.payload?.instruction }),
  async rewrite_draft(job) {
    if (!job.payload?.instruction) throw new Error('Tell me what to change.');
    return draftForLead(job.payload?.lead_id, { instruction: job.payload.instruction });
  },
  check_outreach: (job) => checkForLead(job.payload?.lead_id),
};

let warnedNoProfile = 0;
export async function autoDraftTick() {
  const sending = { ...DEFAULT_SENDING, ...(await getSetting('sending')) };
  if (!sending.auto_draft) return { skipped: 'off' };
  const [profile, summary] = await Promise.all([getSetting('profile'), getSetting('profile_summary')]);
  if (!profile.your_name && !summary.generated_at) {
    if (Date.now() - warnedNoProfile > 3600000) { warnedNoProfile = Date.now(); log('auto-draft', 'waiting for a profile (Settings > Profile)'); }
    return { skipped: 'no_profile' };
  }
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const { count } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('type', 'draft_lead').filter('payload->>auto', 'eq', 'true').gte('created_at', hourAgo);
  const room = Math.min(2, (Number(sending.auto_draft_per_hour) || 6) - (count || 0));
  if (room <= 0) return { skipped: 'hourly_cap' };

  const { data: leads } = await sb.from('leads').select('id,lead_kind,trust_score,fit_score,best_email,is_suspicious')
    .eq('status', 'New').not('is_suspicious', 'is', true).in('enrich_status', ['done', 'skipped', 'failed'])
    .order('fit_score', { ascending: false, nullsFirst: false }).order('trust_score', { ascending: false, nullsFirst: false }).limit(60);
  const minTrust = Number(sending.min_trust_for_auto_draft) || 70;
  const eligible = (leads || []).filter((l) => (l.lead_kind === 'prospect' ? !!l.best_email : (l.trust_score ?? 0) >= minTrust));
  if (!eligible.length) return { queued: 0 };
  const ids = eligible.map((l) => l.id);
  const [{ data: haveRows }, { data: active }] = await Promise.all([
    sb.from('outreach').select('lead_id').in('lead_id', ids),
    sb.from('jobs').select('payload').eq('type', 'draft_lead').in('status', ['queued', 'running']),
  ]);
  const busyIds = new Set([...(haveRows || []).map((r) => r.lead_id), ...(active || []).map((j) => j.payload?.lead_id)]);
  const pick = eligible.filter((l) => !busyIds.has(l.id)).slice(0, room);
  for (const l of pick) await sb.from('jobs').insert({ type: 'draft_lead', payload: { lead_id: l.id, auto: true } });
  if (pick.length) log('auto-draft', `queued ${pick.length} draft(s)`);
  return { queued: pick.length };
}

export const tasks = [{ name: 'auto-draft', everyMs: 60000, initialDelayMs: 15000, run: autoDraftTick }];
