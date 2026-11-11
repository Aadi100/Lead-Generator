import dns from 'node:dns/promises';
import { FREE_MAIL, domainOfEmail } from './util.mjs';
import { withTimeout } from './http-fetch.mjs';

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'grr.la', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
  'tempmailo.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'throwawaymail.com', 'maildrop.cc',
  'mailnesia.com', 'fakeinbox.com', 'mintemail.com', 'tempail.com', 'mohmal.com', 'emailondeck.com', 'spamgourmet.com', 'burnermail.io',
  'discard.email', 'mytemp.email', 'moakt.com', 'mail.tm', 'inboxkitten.com', '33mail.com',
]);

const ROLE_LOCALS = new Set([
  'info', 'sales', 'contact', 'hello', 'hi', 'support', 'admin', 'office', 'enquiries', 'enquiry', 'mail', 'team', 'help', 'service', 'services',
  'billing', 'accounts', 'marketing', 'press', 'jobs', 'careers', 'hr', 'webmaster', 'postmaster', 'noreply', 'no-reply', 'donotreply',
  'customerservice', 'bookings', 'booking', 'reception', 'general', 'studio', 'shop', 'orders', 'hola', 'contactus',
]);

const SYNTAX = /^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const mxCache = new Map();

export function isRoleLocal(local) {
  const l = String(local || '').toLowerCase().replace(/\d+$/, '');
  return ROLE_LOCALS.has(l);
}

export async function hasMx(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d) return false;
  const hit = mxCache.get(d);
  if (hit && Date.now() - hit.at < 3600 * 1000) return hit.value;
  let value;
  try {
    const records = await withTimeout(dns.resolveMx(d), 6000, 'dns timeout');
    value = Array.isArray(records) && records.some((r) => r.exchange && r.exchange !== '.');
  } catch (e) {
    value = e.code === 'ENODATA' || e.code === 'ENOTFOUND' || e.code === 'NXDOMAIN' ? false : null;
  }
  mxCache.set(d, { at: Date.now(), value });
  return value;
}

// DNS-only check: it proves the domain can receive mail, never that the mailbox exists.
export async function verifyEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (e.length > 254 || !SYNTAX.test(e) || e.split('@')[0].length > 64) return { email: e, status: 'invalid_syntax', role: false };
  const [local, domain] = e.split('@');
  const role = isRoleLocal(local);
  if (DISPOSABLE.has(domain)) return { email: e, status: 'disposable', role };
  const mx = await hasMx(domain);
  if (mx === false) return { email: e, status: 'no_mx', role };
  if (mx === null) return { email: e, status: 'unknown', role };
  return { email: e, status: role ? 'role' : 'valid', role };
}

export async function buildEmailEntry(email, { provided = false, source = 'site' } = {}) {
  const v = await verifyEmail(email);
  const kind = provided ? 'provided' : v.role ? 'role' : 'personal';
  return { email: v.email, status: v.status, kind, source };
}

function nameParts(fullName) {
  const words = String(fullName || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/['-]/g, ''))
    .filter((w) => w && !['dr', 'mr', 'mrs', 'ms', 'prof'].includes(w));
  return words;
}

// Pattern guesses are only produced for a named person on a domain that accepts mail, and are always labelled 'guessed'.
export async function guessEmails(ownerName, domain) {
  const d = String(domain || '').toLowerCase();
  if (!d || FREE_MAIL.has(d) || DISPOSABLE.has(d)) return [];
  const words = nameParts(ownerName);
  if (!words.length) return [];
  if ((await hasMx(d)) !== true) return [];
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : null;
  const locals = [first];
  if (last) locals.push(`${first}.${last}`, `${first[0]}${last}`);
  return [...new Set(locals)].slice(0, 3).map((l) => ({ email: `${l}@${d}`, status: 'guessed', kind: 'guessed', source: 'pattern' }));
}

const RANK = (e) => {
  if (e.kind === 'provided' && e.status === 'valid') return 1;
  if (e.kind === 'personal' && e.status === 'valid') return 2;
  if (e.kind === 'provided' && e.status === 'role') return 3;
  if (e.kind === 'role' && e.status === 'role') return 4;
  if (e.kind === 'guessed') return 6;
  if (e.status === 'unknown') return 5;
  return 99;
};

export function pickBestEmail(entries) {
  const ranked = entries.filter((e) => !e.bounced && RANK(e) < 99).sort((a, b) => RANK(a) - RANK(b));
  return ranked[0] || null;
}

export { domainOfEmail };
