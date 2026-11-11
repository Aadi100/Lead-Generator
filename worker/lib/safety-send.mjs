import { sb } from './db.mjs';
import { domainOfEmail } from './util.mjs';

export const DEFAULT_SENDING = {
  provider: 'none', paused: false, daily_limit: 20, auto_followups: true, followup_days: [4, 9],
  from_name: '', from_email: '', reply_to: '', footer: '', require_confirm_suspicious: true,
  auto_draft: true, auto_draft_per_hour: 6, min_trust_for_auto_draft: 70, owned_domains: [],
};

// Read straight from the database (no cache) so "pause" takes effect immediately.
export async function readSendingFresh() {
  let override = {};
  try { override = JSON.parse(process.env.SETTINGS_OVERRIDE || '{}'); } catch { /* ignore */ }
  if (override.sending) return { ...DEFAULT_SENDING, ...override.sending };
  const { data } = await sb.from('app_settings').select('value').eq('key', 'sending').maybeSingle();
  return { ...DEFAULT_SENDING, ...(data?.value || {}) };
}

export function startOfLocalDay(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dueDates(sentAt, followupDays) {
  const base = new Date(sentAt).getTime();
  return (followupDays || []).slice(0, 2).map((d) => new Date(base + Number(d) * 86400000));
}

export const followUpSubject = (step1Subject) => {
  const s = String(step1Subject || '').trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
};

export const messageIdFor = (outreachId, fromEmail) => `<lr.${outreachId}@${domainOfEmail(fromEmail) || 'localhost'}>`;

export const composeBody = (body, footer) => {
  const b = String(body || '').trim();
  const f = String(footer || '').trim();
  return f ? `${b}\n\n${f}` : b;
};

// step 1 rows are sent as soon as they are 'queued'. Follow-ups wait for the previous step and their due date.
export function followupEligibility({ row, prev, lead, now = new Date() }) {
  if (!prev) return { action: 'cancel', reason: 'the first message does not exist' };
  if (prev.status !== 'sent') {
    if (['failed', 'cancelled', 'draft', 'replied'].includes(prev.status)) return { action: 'cancel', reason: 'the previous message was not sent' };
    return { action: 'wait' };
  }
  if (['Replied', 'Won', 'Lost', 'Ignored'].includes(lead.status)) return { action: 'cancel', reason: `the lead is now ${lead.status}` };
  if (row.status === 'queued') return { action: 'send' };
  if (!row.due_at || new Date(row.due_at) > now) return { action: 'wait' };
  return { action: 'send' };
}
