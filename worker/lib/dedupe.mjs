// Pure matching logic for "is this the same person or the same ad seen on another source?".
// No database access here. Duplicates are never deleted: matches become links (see schema-v6.sql).
//
// Key kinds: email, phone, handle, domain, text (title fingerprint), body (opening-text fingerprint).
// False-positive guards: free mail domains, platform domains, role mailboxes on free mail, generic
// handles and short or generic titles never produce a key.

import { FREE_MAIL } from './util.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const lower = (v) => String(v ?? '').toLowerCase();

const JSON_COLS = ['emails', 'tags', 'phones', 'socials'];
function parseCol(v, fallback) {
  if (typeof v !== 'string') return v ?? fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

// ---------- guards ----------
export const PLATFORM_DOMAINS = new Set([
  'reddit.com', 'redd.it', 'freelancer.com', 'upwork.com', 'fiverr.com', 'linkedin.com', 'facebook.com', 'fb.com', 'twitter.com', 'x.com',
  'instagram.com', 'youtube.com', 'youtu.be', 'github.com', 'gitlab.com', 'google.com', 'goo.gl', 'apple.com', 'microsoft.com', 'amazon.com',
  'notion.so', 'notion.site', 'medium.com', 'imgur.com', 't.me', 'telegram.org', 'discord.gg', 'discord.com', 'wa.me', 'whatsapp.com',
  'calendly.com', 'linktr.ee', 'bit.ly', 'tinyurl.com', 'producthunt.com', 'dribbble.com', 'behance.net', 'wordpress.com', 'wixsite.com',
  'wix.com', 'squarespace.com', 'myshopify.com', 'shopify.com', 'weebly.com', 'blogspot.com', 'figma.com', 'canva.com', 'dropbox.com',
  'ycombinator.com', 'news.ycombinator.com', 'weworkremotely.com', 'indeed.com', 'glassdoor.com', 'craigslist.org', 'pinterest.com',
  'tiktok.com', 'twitch.tv', 'workable.com', 'lever.co', 'greenhouse.io', 'ashbyhq.com', 'bamboohr.com', 'recruitee.com', 'smartrecruiters.com', 'breezy.hr', 'jobvite.com', 'applytojob.com', 'teamtailor.com', 'workday.com', 'myworkdayjobs.com', 'angel.co', 'wellfound.com', 'remoteok.com', 'remote.co', 'flexjobs.com', 'toptal.com', 'peopleperhour.com', 'guru.com', 'truelancer.com', 'airtable.com', 'zoom.us', 'slack.com', 'gumroad.com', 'patreon.com', 'substack.com', 'play.google.com', 'vercel.app', 'netlify.app', 'herokuapp.com', 'github.io', 'carrd.co', 'typeform.com', 'forms.gle',
]);

const GENERIC_LOCALS = new Set([
  'info', 'contact', 'hello', 'hi', 'support', 'admin', 'sales', 'office', 'mail', 'team', 'enquiries', 'inquiries', 'help', 'service',
  'webmaster', 'hr', 'jobs', 'careers', 'billing', 'accounts', 'noreply', 'no-reply', 'donotreply', 'test', 'example', 'user', 'email',
]);
const PLACEHOLDER_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'test.com', 'domain.com', 'email.com', 'yourdomain.com', 'invalid', 'example.invalid']);

const GENERIC_HANDLES = new Set([
  'admin', 'support', 'info', 'user', 'username', 'freelancer', 'client', 'hiring', 'recruiter', 'business', 'official', 'contact',
  'deleted', '[deleted]', 'anonymous', 'unknown', 'automoderator', 'null', 'none', 'dm', 'me',
  // brand accounts that show up in scraped social links of app store pages, job boards and so on
  'appstore', 'apple', 'google', 'googleplay', 'playstore', 'facebook', 'twitter', 'instagram', 'youtube', 'github', 'microsoft', 'linkedin',
  'reddit', 'shopify', 'wordpress', 'freelancer', 'upwork', 'fiverr', 'workable', 'weworkremotely', 'ycombinator', 'hackernews', 'notion', 'slack',
]);

const STOP = new Set((
  'a an the and or of for to in on at with by from is are was be been being it its this that these those i we you they he she my our your their ' +
  'me us them need needed needs want wanted wants looking look seeking hire hiring help someone somebody anyone who whom please pls urgent asap ' +
  'required require requirement project job work build make create do does can could should would will have has had get got new good great best ' +
  'simple small big quick fast cheap budget paid pay hiring freelancer developer designer expert experienced professional person team ' +
  'hello hi hey thanks thank regards'
).split(' '));

// Titles that carry no identity on their own, even when long enough.
const GENERIC_TITLE_RES = [
  /^(need|looking for|seeking|hiring|want)( a| an)? (web|website|app|mobile app|logo|ui|ux|graphic|wordpress|shopify|react|full ?stack)? ?(developer|designer|freelancer|expert|website|app|logo)\W*$/i,
  /^(website|web|app|logo|design) (developer|designer|needed|project)\W*$/i,
];

export function normalizeEmail(raw) {
  const m = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/.exec(String(raw || ''));
  if (!m) return null;
  let local = m[1].toLowerCase();
  const domain = m[2].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(domain)) return null;
  if (PLACEHOLDER_DOMAINS.has(domain)) return null;
  const plusless = local.replace(/\+.*$/, '');
  if (GENERIC_LOCALS.has(plusless)) {
    // A role mailbox is only an identity on a company domain, never on gmail and friends.
    if (FREE_MAIL.has(domain)) return null;
    return { email: `${plusless}@${domain}`, role: true, domain };
  }
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = plusless.replace(/\./g, '');
  else local = plusless;
  if (local.length < 3) return null;
  return { email: `${local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`, role: false, domain };
}

export function registrableDomain(host) {
  const h = lower(host).replace(/^www\./, '').replace(/\.$/, '');
  if (!h || !h.includes('.')) return null;
  const parts = h.split('.');
  const second = parts[parts.length - 2];
  const take = parts.length >= 3 && parts[parts.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'].includes(second) ? 3 : 2;
  return parts.slice(-take).join('.');
}

export function domainKey(raw) {
  let host = String(raw || '').trim();
  if (!host) return null;
  try { host = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`).hostname; } catch { return null; }
  const d = registrableDomain(host);
  if (!d || FREE_MAIL.has(d) || PLATFORM_DOMAINS.has(d) || PLATFORM_DOMAINS.has(host.replace(/^www\./, ''))) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  return d;
}

export function normalizeHandle(raw) {
  let h = lower(raw).trim().replace(/^(u|user|r)\//, '').replace(/^@/, '').replace(/[\s]/g, '');
  if (!h || GENERIC_HANDLES.has(h) || h.length < 5) return null;
  if (/^\d+$/.test(h)) return null;
  // Plain short dictionary-like words are too common; demand a digit, separator or real length.
  if (!/[\d_.-]/.test(h) && h.length < 8) return null;
  return h;
}

export function normalizePhone(raw) {
  const d = String(raw || '').replace(/[^\d]/g, '');
  if (d.length < 8 || d.length > 15) return null;
  if (/^(\d)\1+$/.test(d)) return null;
  return d.replace(/^0+/, '');
}

// ---------- text fingerprints ----------
export function tokens(text) {
  return lower(text)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + str.length.toString(36);
}

export function titleFingerprint(title) {
  const raw = String(title || '').replace(/\[[^\]]*\]/g, '').trim();
  if (GENERIC_TITLE_RES.some((re) => re.test(raw))) return null;
  const t = [...new Set(tokens(title))];
  if (t.length < 4) return null;
  return hash(t.sort().join(' '));
}

export function bodyTokens(text) {
  return tokens(text);
}

export function bodyFingerprint(text) {
  const t = bodyTokens(text);
  if (t.length < 25) return null;
  return hash(t.slice(0, 30).join(' '));
}

export function jaccard(a, b) {
  const A = new Set(a); const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------- extraction ----------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

export function extractIdentity(lead) {
  const emailsRaw = [
    lead.best_email,
    ...arr(parseCol(lead.emails, [])).map((e) => (typeof e === 'string' ? e : e?.email)),
    ...(String(lead.contact || '').match(EMAIL_RE) || []),
    ...(String(lead.description || '').match(EMAIL_RE) || []),
  ];
  const emails = new Map();
  for (const r of emailsRaw) { const n = normalizeEmail(r); if (n && !emails.has(n.email)) emails.set(n.email, n); }

  const handles = new Set();
  const addHandle = (v) => { const h = normalizeHandle(v); if (h) handles.add(h); };
  const contact = String(lead.contact || '');
  for (const part of contact.split('·')) {
    const m = /^\s*(reddit|telegram|discord|twitter|x|github|instagram|skype)\s*:\s*(.+)$/i.exec(part);
    if (m) addHandle(m[2].replace(/#\d{4}$/, ''));
  }
  const author = String(lead.author || '').trim();
  if (author && !/^\[?deleted\]?$/i.test(author)) addHandle(author);
  for (const v of Object.values(parseCol(lead.socials, {}) || {})) {
    const m = /(?:twitter|x|instagram|github|t)\.(?:com|me)\/@?([A-Za-z0-9_.-]{4,})/i.exec(String(v));
    if (m) addHandle(m[1]);
  }

  const phones = new Set();
  for (const p of arr(parseCol(lead.phones, []))) { const n = normalizePhone(p); if (n) phones.add(n); }
  for (const m of contact.matchAll(/whatsapp\s*:\s*([+\d][\d\s().-]{6,})/gi)) { const n = normalizePhone(m[1]); if (n) phones.add(n); }

  const domains = new Set();
  const addDomain = (v) => { const d = domainKey(v); if (d) domains.add(d); };
  addDomain(lead.website);
  for (const part of contact.split('·')) {
    const m = /^\s*site\s*:\s*(\S+)/i.exec(part);
    if (m) addDomain(m[1]);
  }
  for (const e of emails.values()) if (!FREE_MAIL.has(e.domain) && !PLATFORM_DOMAINS.has(e.domain)) { const d = registrableDomain(e.domain); if (d) domains.add(d); }

  return {
    emails: [...emails.values()],
    handles: [...handles],
    phones: [...phones],
    domains: [...domains],
    author: normalizeHandle(author) || null,
    titleFp: titleFingerprint(lead.title),
    bodyFp: bodyFingerprint(lead.description),
    bodyTokens: bodyTokens(lead.description),
  };
}

// The rows that go into lead_identity_keys.
export function keysOf(lead) {
  const id = extractIdentity(lead);
  const keys = [];
  for (const e of id.emails) keys.push({ kind: 'email', value: e.email });
  for (const h of id.handles) keys.push({ kind: 'handle', value: h });
  for (const p of id.phones) keys.push({ kind: 'phone', value: p });
  for (const d of id.domains) keys.push({ kind: 'domain', value: d });
  if (id.titleFp) keys.push({ kind: 'text', value: id.titleFp });
  if (id.bodyFp) keys.push({ kind: 'body', value: id.bodyFp });
  return keys;
}

// ---------- pair comparison ----------
// relation: 'same_contact' (same person or company), 'cross_post' (same ad, contact unknown or equal),
//           'text_blast' (same text but different people: spam signal, never merged).
// state: 'auto' (shown as one lead), 'suspected' (needs the user's Confirm or Split).
export function comparePair(a, b) {
  const A = a.__id || extractIdentity(a);
  const B = b.__id || extractIdentity(b);
  const reasons = [];

  const sharedEmail = A.emails.find((x) => B.emails.some((y) => y.email === x.email));
  const sharedHandle = A.handles.find((x) => B.handles.includes(x));
  const sharedPhone = A.phones.find((x) => B.phones.includes(x));
  const sharedDomain = A.domains.find((x) => B.domains.includes(x));

  const sameTitle = !!A.titleFp && A.titleFp === B.titleFp;
  const sim = A.bodyTokens.length >= 25 && B.bodyTokens.length >= 25 ? jaccard(A.bodyTokens, B.bodyTokens) : 0;
  const nearIdentical = sim >= 0.95;
  const sameBody = (!!A.bodyFp && A.bodyFp === B.bodyFp) || sim >= 0.8;
  const sameText = sameTitle || sameBody;

  if (sharedEmail && !sharedEmail.role) reasons.push(`same email ${sharedEmail.email}`);
  else if (sharedEmail) reasons.push(`same company mailbox ${sharedEmail.email}`);
  if (sharedPhone) reasons.push('same phone number');
  if (sharedHandle) reasons.push(`same handle "${sharedHandle}"`);
  if (sharedDomain) reasons.push(`same website ${sharedDomain}`);
  if (sameTitle) reasons.push('same title');
  if (sameBody) reasons.push(sim >= 0.8 ? `very similar text (${Math.round(sim * 100)}% overlap)` : 'same opening text');

  const strongId = (sharedEmail && !sharedEmail.role) || sharedPhone || sharedHandle;
  if (strongId) return { relation: 'same_contact', state: 'auto', strength: 0.95, reasons };
  if (sharedDomain && (sameText || sharedEmail)) return { relation: 'same_contact', state: 'auto', strength: 0.88, reasons };

  if (sameText) {
    const idsA = A.emails.length + A.handles.length + A.phones.length;
    const idsB = B.emails.length + B.handles.length + B.phones.length;
    const contactsDiffer = idsA > 0 && idsB > 0;
    const authorsDiffer = !!A.author && !!B.author && A.author !== B.author;
    if (contactsDiffer || authorsDiffer) {
      return { relation: 'text_blast', state: 'auto', strength: sameBody ? 0.85 : 0.6, reasons: reasons.concat('but a different contact or author') };
    }
    const certain = (sameTitle && sameBody) || nearIdentical;
    const strength = certain ? 0.9 : sameBody ? 0.75 : 0.6;
    return { relation: 'cross_post', state: certain ? 'auto' : 'suspected', strength, reasons };
  }
  if (sharedDomain || sharedEmail) return { relation: 'same_contact', state: 'suspected', strength: 0.55, reasons };
  return null;
}

// Candidate pairs with the same key are compared once the worker has fetched them.
export function matchAgainst(lead, others) {
  const L = { ...lead, __id: extractIdentity(lead) };
  const out = [];
  for (const o of others) {
    if (o.id === lead.id) continue;
    const r = comparePair(L, { ...o, __id: extractIdentity(o) });
    if (r) out.push({ other_id: o.id, ...r });
  }
  return out;
}

export const orderPair = (x, y) => (x < y ? [x, y] : [y, x]);

// ---------- signals ----------
export const DEDUPE_FLAG_PREFIX = 'Same text posted under';
const MIN_BLAST = 2; // this lead plus 2 others with different contacts

// links: [{relation, state, other: {id, source, ...}}] for ONE lead (split links already removed).
export function summarizeLinks(lead, links) {
  const live = links.filter((l) => l.state === 'auto' || l.state === 'confirmed');
  const same = live.filter((l) => l.relation === 'same_contact' || l.relation === 'cross_post');
  const blast = live.filter((l) => l.relation === 'text_blast');
  const otherSources = new Set(same.map((l) => l.other?.source).filter((s) => s && s !== lead.source));
  const confirmedSame = same.filter((l) => l.state === 'confirmed' || l.relation === 'same_contact');
  const signals = { trust_delta: 0, flag: null, make_suspicious: false, positive: null, linked: same.length, sources: otherSources.size, blast: blast.length };
  if (otherSources.size >= 1 && confirmedSame.some((l) => l.other?.source && l.other.source !== lead.source)) {
    signals.trust_delta = otherSources.size >= 2 ? 7 : 5;
    signals.positive = `Same contact seen on ${otherSources.size + 1} sources`;
  }
  if (blast.length >= MIN_BLAST) {
    signals.trust_delta = -12;
    signals.positive = null;
    signals.flag = `${DEDUPE_FLAG_PREFIX} ${blast.length + 1} different contacts (possible spam blast)`;
    signals.make_suspicious = true;
  }
  return signals;
}

export function levelOf(score) {
  return score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low';
}

// Applies new signals on top of what was applied before, so re-running never stacks.
export function applySignals(lead, prev, next) {
  const prevDelta = Number(prev?.trust_delta) || 0;
  const base = (lead.trust_score ?? 50) - prevDelta;
  const score = Math.max(5, Math.min(98, Math.round(base + next.trust_delta)));
  let flags = arr(parseCol(lead.flags, [])).filter((f) => !String(f).startsWith(DEDUPE_FLAG_PREFIX));
  if (next.flag) flags = [...flags, next.flag];
  let suspicious = !!lead.is_suspicious;
  if (next.make_suspicious && !suspicious) { suspicious = true; next = { ...next, made_suspicious: true }; }
  else if (!next.make_suspicious && prev?.made_suspicious) { suspicious = false; next = { ...next, made_suspicious: false }; }
  else if (prev?.made_suspicious && next.make_suspicious) next = { ...next, made_suspicious: true };
  return { patch: { trust_score: score, trust_level: levelOf(score), flags, is_suspicious: suspicious }, signals: next };
}

export { JSON_COLS };
