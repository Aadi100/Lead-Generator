import { wordCount } from './safety.mjs';

export const LOCKED_STATUSES = ['queued', 'sending', 'scheduled', 'sent', 'replied'];
const BAD = new Set(['no_mx', 'disposable', 'invalid_syntax']);
const GOOD = new Set(['valid', 'role', 'guessed']);
const KIND_RANK = { provided: 0, personal: 1, role: 2, guessed: 3 };

const usable = (e) => e && e.email && !BAD.has(e.status) && (GOOD.has(e.status) || e.kind === 'provided');

export function pickRecipient(lead) {
  const emails = Array.isArray(lead.emails) ? lead.emails : [];
  const best = lead.best_email ? emails.find((e) => e.email === lead.best_email) || { email: lead.best_email, status: lead.best_email_status, kind: 'personal' } : null;
  let chosen = usable(best) ? best : null;
  if (!chosen) chosen = emails.filter(usable).sort((a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9))[0] || null;
  if (!chosen) return { channel: 'manual', email: null, name: lead.owner_name || null };
  return { channel: 'email', email: chosen.email, name: lead.owner_name || null };
}

export function followupSteps(sending) {
  if (!sending.auto_followups) return 0;
  const days = (Array.isArray(sending.followup_days) ? sending.followup_days : []).filter((n) => Number(n) > 0);
  return Math.min(2, days.length);
}

export function sanitizeBody(text) {
  return String(text || '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[*•]\s+/gm, '- ')
    .replace(/[ \t]*[—–][ \t]*/g, ', ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeSubject(s) {
  return String(s || '').replace(/^\s*subject\s*:\s*/i, '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
}

export function parseDraftJson(obj, { channel, steps }) {
  if (!obj || typeof obj !== 'object') throw new Error('AI reply was not an object');
  const list = Array.isArray(obj.messages) ? obj.messages : [];
  const byStep = new Map(list.map((m) => [Number(m.step), sanitizeBody(m.body)]));
  const messages = steps.map((step) => {
    const body = byStep.get(step);
    if (!body) throw new Error(`AI reply is missing step ${step}`);
    return { step, body };
  });
  const subject = channel === 'manual' ? '' : sanitizeSubject(obj.subject);
  if (channel === 'email' && !subject) throw new Error('AI reply has no subject');
  return { subject, messages };
}

const firstName = (name) => {
  const n = String(name || '').trim().split(/\s+/)[0];
  return /^[A-Za-z][A-Za-z'-]{1,}$/.test(n) ? n : '';
};
const shorten = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const CATEGORY_LINE = {
  Website: 'build or fix websites',
  App: 'build mobile and web apps',
  Design: 'do brand and graphic design',
  Automation: 'set up automations and integrations',
};

export function templateDrafts({ lead, profile = {}, summary = {}, channel, steps }) {
  const you = profile.your_name || '';
  const sign = String(profile.signature || '').trim() || you;
  const services = (profile.services && profile.services.length ? profile.services : summary.services) || [];
  const offer = services.length ? `I help with ${services.slice(0, 3).join(', ')}.` : `I ${CATEGORY_LINE[lead.category] || 'can help with this kind of work'}.`;
  const hi = firstName(lead.owner_name) ? `Hi ${firstName(lead.owner_name)},` : 'Hello,';
  const isProspect = lead.lead_kind === 'prospect';
  const topic = shorten(String(lead.title || '').replace(/^\[[^\]]+\]\s*/, ''), 70);
  const opening = isProspect
    ? `I noticed ${lead.company_name || lead.author || 'your business'} does not seem to have a website listed.`
    : `I saw your post "${topic}".`;
  const extra = lead.opportunity && lead.website ? ` ${lead.opportunity}` : '';
  const close = 'Would a short reply or a 15-minute call this week work for you?';
  const signoff = sign ? `\n\n${sign}` : '';

  const subject = channel === 'manual' ? '' : isProspect ? `A website for ${shorten(lead.company_name || lead.author || 'your business', 50)}` : `About your post: ${shorten(topic, 55)}`;
  const first = channel === 'manual'
    ? `${hi} ${opening} ${offer} ${close}${signoff}`
    : `${hi}\n\n${opening} ${offer}${extra}\n\n${close}${signoff}`;
  const nudge = (n) => (n === 2
    ? `${hi}\n\nJust following up on my note about ${isProspect ? 'a website' : `"${topic}"`}. Happy to answer any questions.${signoff}`
    : `${hi}\n\nLast note from me. If the timing is wrong, no problem. If you still need help, reply and I will get back to you the same day.${signoff}`);
  const messages = steps.map((step) => ({ step, body: step === 1 ? first : nudge(step) }));
  return { subject, messages };
}

export { wordCount };
