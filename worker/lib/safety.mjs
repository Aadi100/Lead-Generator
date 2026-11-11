import { sb } from './db.mjs';
import { hostOf, domainOfEmail } from './util.mjs';

const BAD_STATUS = new Set(['no_mx', 'disposable', 'invalid_syntax']);
const STATUS_TEXT = { no_mx: 'no mail server found for that domain', disposable: 'disposable address', invalid_syntax: 'not a valid email format' };
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const ROLE_LOCAL = /^(info|sales|contact|hello|support|admin|office|team|mail|enquiries|inquiries|help|billing|accounts|hr|jobs|careers|press|marketing)$/i;
const TLDS = 'com|net|org|io|co|dev|app|ai|me|biz|info|us|uk|pk|in|de|fr|ca|au|shop|store|online|site|xyz|agency|studio|design|tech|cloud|ly|gg|tv|so';
const PLACEHOLDER_RE = /\[[^\]\n]{2,40}\]|\{\{[^}]*\}\}|<insert[^>]*>|<your[^>]*>|\bXXX+\b|lorem ipsum|\bTODO\b/i;
const AI_LEAK_RE = /\bas an ai\b|language model|system prompt|i (?:cannot|can't|can not) (?:help|assist|comply|write)|here(?:'s| is) (?:the |your |a |an )?(?:email|draft|message|follow-?up)|\bclaude\b|\banthropic\b|^\s*subject\s*:/im;
const LEVEL_RANK = { hard: 0, hold: 1, warn: 2 };

export function wordCount(s) {
  return (String(s || '').match(/\S+/g) || []).length;
}

export function extractLinkHosts(text) {
  const t = String(text || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, ' ');
  const hosts = new Set();
  for (const m of t.matchAll(/https?:\/\/[^\s)>\]"']+/gi)) {
    const h = hostOf(m[0].replace(/[.,;:!?]+$/, ''));
    if (h) hosts.add(h);
  }
  for (const m of t.matchAll(/\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi)) {
    const h = hostOf(m[0]);
    if (h) hosts.add(h);
  }
  const bare = new RegExp(`\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?![a-z0-9@-])`, 'gi');
  for (const m of t.matchAll(bare)) hosts.add(m[0].toLowerCase().replace(/^www\./, ''));
  return [...hosts];
}

export function allowedHosts({ lead = {}, profile = {}, sending = {} }) {
  const set = new Set();
  const add = (h) => h && set.add(String(h).toLowerCase().replace(/^www\./, ''));
  for (const d of sending.owned_domains || []) add(hostOf(d) || d);
  for (const u of profile.websites || []) add(hostOf(u));
  for (const u of profile.links || []) add(hostOf(u));
  add(hostOf(lead.website));
  add(domainOfEmail(sending.from_email));
  add(domainOfEmail(profile.email));
  return set;
}

const hostAllowed = (host, allowed) => [...allowed].some((a) => host === a || host.endsWith('.' + a));

export function checkOutreach({ lead = {}, row, profile = {}, sending = {}, suppressed = false, duplicate = false, ownEmails = [] }) {
  const out = [];
  const add = (level, code, message) => out.push({ level, code, message });
  const body = String(row.body || '');
  const subject = String(row.subject || '');
  const email = String(row.to_email || '').trim().toLowerCase();
  const isEmail = row.channel === 'email';

  if (isEmail) {
    if (!email) add('hard', 'no_recipient', 'There is no recipient email address.');
    else if (!EMAIL_RE.test(email)) add('hard', 'invalid_email', 'The recipient address is not a valid email address.');
    else {
      const known = (lead.emails || []).find((e) => String(e.email || '').toLowerCase() === email);
      if (known && BAD_STATUS.has(known.status)) add('hard', 'invalid_email', `This address cannot be used (${STATUS_TEXT[known.status]}).`);
      else if (known?.status === 'role' || known?.kind === 'role' || ROLE_LOCAL.test(email.split('@')[0])) add('warn', 'role_address', 'This is a shared inbox (like info@), so the owner may not read it.');
      if (known && (known.status === 'guessed' || known.kind === 'guessed')) add('warn', 'guessed_address', 'This address was guessed from the owner\'s name and could not be confirmed.');
      if (suppressed) add('hard', 'suppressed', 'This address is on your do-not-contact list.');
      if (duplicate) add('hard', 'duplicate_recipient', 'You already contacted this address for another lead.');
      if (ownEmails.map((e) => String(e || '').toLowerCase()).includes(email)) add('hard', 'own_address', 'This is your own email address.');
    }
    if (!subject.trim()) add('hold', 'no_subject', 'The email has no subject.');
  }

  if (!body.trim()) add('hold', 'empty_body', 'The message is empty.');
  if (PLACEHOLDER_RE.test(subject + '\n' + body)) add('hold', 'placeholder', 'The text still contains a placeholder such as [Your Name] or {{name}}.');
  if (AI_LEAK_RE.test(subject + '\n' + body)) add('hold', 'ai_leak', 'The text looks like it contains AI instructions or wording ("as an AI", "here is the email").');
  if (wordCount(body) > 220) add('hold', 'too_long', `The message is ${wordCount(body)} words. Under 150 works better.`);

  const allowed = allowedHosts({ lead, profile, sending });
  const foreign = extractLinkHosts(subject + '\n' + body).filter((h) => !hostAllowed(h, allowed));
  if (foreign.length) add('hold', 'foreign_link', `Links to a site you do not own: ${foreign.slice(0, 3).join(', ')}.`);

  if (lead.is_suspicious && sending.require_confirm_suspicious !== false && !row.confirmed_suspicious) {
    add('hold', 'suspicious_lead', 'This lead was flagged as suspicious. Confirm you checked it before sending.');
  }
  if (['Ignored', 'Lost'].includes(lead.status)) add('hold', 'lead_closed', `This lead is marked ${lead.status}.`);

  if (profile.your_name) {
    const first = String(profile.your_name).trim().split(/\s+/)[0].toLowerCase();
    if (first && !body.toLowerCase().includes(first) && !String(profile.signature || '').trim()) add('warn', 'no_signature', 'The message does not end with your name.');
  } else {
    add('warn', 'no_signature', 'Your name is not set in the profile, so the message has no signature.');
  }
  if ((row.warnings || []).some((w) => w.code === 'template')) add('warn', 'template', 'Written from a template because the AI was not available. Read it carefully.');

  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

export function blockers(warnings, row) {
  return (warnings || []).filter((w) => w.level === 'hard' || (w.level === 'hold' && (w.code === 'suspicious_lead' || !row.override_warnings)));
}

export const describeBlockers = (list) => list.map((w) => w.message).join(' ');

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

export async function evaluateOutreach(row, { lead, profile, sending, imapUser }) {
  const email = String(row.to_email || '').trim().toLowerCase();
  let suppressed = false;
  let duplicate = false;
  if (row.channel === 'email' && email) {
    const { data: s } = await sb.from('suppressions').select('email').eq('email', email).limit(1);
    suppressed = !!s?.length;
    const { data: dup } = await sb.from('outreach').select('id')
      .ilike('to_email', escapeLike(email))
      .neq('lead_id', row.lead_id)
      .in('status', ['sent', 'queued', 'sending', 'scheduled', 'replied'])
      .limit(1);
    duplicate = !!dup?.length;
  }
  const ownEmails = [sending.from_email, profile.email, imapUser].filter(Boolean);
  return checkOutreach({ lead, row, profile, sending, suppressed, duplicate, ownEmails });
}
