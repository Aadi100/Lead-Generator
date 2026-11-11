import * as cheerio from 'cheerio';

const SOCIAL = [
  ['linkedin', /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in|school)\/[^/?#\s"')]+/i],
  ['facebook', /^https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|plugins|tr\b|dialog|login|events|groups\/?$|policies)[^/?#\s"')]+/i],
  ['instagram', /^https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore|reel|accounts|share)[^/?#\s"')]+/i],
  ['x', /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share|home|search|i\/|hashtag)[^/?#\s"')]+/i],
  ['github', /^https?:\/\/(?:www\.)?github\.com\/(?!sponsors|features|topics|orgs\/?$|about|pricing)[^/?#\s"')]+/i],
  ['youtube', /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[^/?#\s"')]+/i],
  ['tiktok', /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/?#\s"')]+/i],
  ['behance', /^https?:\/\/(?:www\.)?behance\.net\/(?!search)[^/?#\s"')]+/i],
  ['dribbble', /^https?:\/\/(?:www\.)?dribbble\.com\/(?!shots|search)[^/?#\s"')]+/i],
];

export function socialFromUrl(href) {
  const h = String(href || '').trim();
  for (const [network, re] of SOCIAL) {
    const m = re.exec(h);
    if (m) return [network, m[0].replace(/\/+$/, '')];
  }
  return null;
}

export function socialsFromText(text) {
  const out = {};
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const s = socialFromUrl(m[0].replace(/[.,;]+$/, ''));
    if (s && !out[s[0]]) out[s[0]] = s[1];
  }
  return out;
}

const STOP_WORDS = new Set([
  'our', 'the', 'team', 'about', 'contact', 'us', 'home', 'services', 'meet', 'founder', 'owner', 'ceo', 'director', 'managing', 'welcome', 'hello',
  'get', 'in', 'touch', 'and', 'co', 'chief', 'executive', 'officer', 'company', 'studio', 'agency', 'all', 'rights', 'reserved', 'privacy', 'policy',
  'terms', 'read', 'more', 'learn', 'news', 'blog', 'portfolio', 'work', 'works', 'what', 'we', 'do', 'who', 'are', 'you', 'your', 'for', 'with',
  'digital', 'experience', 'architect', 'designer', 'developer', 'engineer', 'manager', 'marketing', 'strategy', 'strategist', 'creative', 'senior',
  'junior', 'lead', 'head', 'specialist', 'consultant', 'executive', 'product', 'brand', 'content', 'sales', 'account', 'project', 'operations',
  'technical', 'technology', 'software', 'web', 'ux', 'ui', 'design', 'development', 'business', 'customer', 'success', 'vice', 'assistant',
  'associate', 'coordinator', 'analyst', 'producer', 'editor', 'writer', 'photographer', 'group', 'solutions', 'systems', 'labs', 'inc', 'llc',
  'ltd', 'corp', 'limited', 'partners', 'consulting', 'media', 'interactive', 'ventures', 'global', 'international', 'services', 'online',
]);

export function looksLikeName(s) {
  const words = String(s || '').trim().replace(/\s+/g, ' ').split(' ');
  if (words.length < 2 || words.length > 3) return false;
  return words.every((w) => /^\p{Lu}[\p{L}'’.-]+$/u.test(w) && !STOP_WORDS.has(w.toLowerCase().replace(/\.$/, '')));
}

const TITLE_RE = /\b(co-?founder|founder|owner|proprietor|ceo|chief executive officer|managing director|director|principal|president|partner)\b/i;
const titleRank = (t) => (/(owner|founder|proprietor)/i.test(t) ? 1 : /(ceo|chief executive|managing director|president)/i.test(t) ? 2 : 3);

const JUNK_EMAIL = /(\.(png|jpe?g|gif|webp|svg|css|js)$|example\.(com|org)|sentry|wixpress|yourdomain|domain\.com|^(your|name|email|user|username)@|@(email|mail)\.com$|u00|%)/i;

function decodeCfEmail(hex) {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  } catch {
    return '';
  }
}

function emailsFrom($, text) {
  const found = new Set();
  $('a[href^="mailto:" i]').each((_, a) => {
    const raw = ($(a).attr('href') || '').slice(7).split('?')[0];
    try { found.add(decodeURIComponent(raw).trim().toLowerCase()); } catch { found.add(raw.trim().toLowerCase()); }
  });
  $('[data-cfemail]').each((_, el) => {
    const e = decodeCfEmail($(el).attr('data-cfemail') || '');
    if (e.includes('@')) found.add(e.toLowerCase());
  });
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) found.add(m[0].toLowerCase());
  return [...found].filter((e) => e.length < 80 && !JUNK_EMAIL.test(e));
}

function phonesFrom($, text) {
  const seen = new Map();
  const add = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15 || seen.has(digits)) return;
    seen.set(digits, raw.trim().replace(/\s+/g, ' '));
  };
  $('a[href^="tel:" i]').each((_, a) => add(decodeURIComponent(($(a).attr('href') || '').slice(4))));
  for (const m of text.matchAll(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/g)) {
    if (/[+()\s.-]/.test(m[0])) add(m[0]);
  }
  return [...seen.values()].slice(0, 3);
}

function jsonLdNodes($) {
  const nodes = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const data = JSON.parse($(s).contents().text());
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== 'object') continue;
        if (Array.isArray(n)) { stack.push(...n); continue; }
        nodes.push(n);
        if (n['@graph']) stack.push(...[].concat(n['@graph']));
      }
    } catch { /* bad json-ld */ }
  });
  return nodes;
}

const typesOf = (n) => [].concat(n['@type'] || []).map(String);
const asArray = (v) => (v == null ? [] : [].concat(v));
const textOf = (v) => (typeof v === 'string' ? v : v && typeof v.name === 'string' ? v.name : '');

function peopleFrom($, nodes) {
  const people = [];
  const push = (name, title, via) => {
    const n = String(name || '').trim().replace(/\s+/g, ' ');
    const t = String(title || '').trim();
    if (!looksLikeName(n) || !TITLE_RE.test(t)) return;
    if (!people.some((p) => p.name === n)) people.push({ name: n, title: t.match(TITLE_RE)[0].replace(/^./, (c) => c.toUpperCase()), via });
  };
  for (const n of nodes) {
    const types = typesOf(n);
    if (types.includes('Person')) push(n.name, n.jobTitle, 'json-ld');
    for (const f of asArray(n.founder).concat(asArray(n.founders))) push(textOf(f), 'Founder', 'json-ld');
  }
  const titleOnly = [];
  $('h1,h2,h3,h4,h5,h6,p,li,span,div,strong,b,em,a').each((_, el) => {
    if (people.length >= 6) return false;
    if ($(el).children().length > 3) return;
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!text || text.length > 90 || !TITLE_RE.test(text)) return;
    const parts = text.split(/\s*[,|–—:·•-]\s+|\s+[-–—]\s+|:\s*/).map((p) => p.trim()).filter(Boolean);
    const namePart = parts.find((p) => looksLikeName(p));
    const titlePart = parts.find((p) => p.length <= 40 && TITLE_RE.test(p));
    if (namePart && titlePart) { push(namePart, titlePart, 'text'); return; }
    if (titlePart && !namePart && parts.length === 1) titleOnly.push(el);
  });
  for (const el of titleOnly) {
    const title = $(el).text().trim().replace(/\s+/g, ' ');
    const prev = $(el).prev();
    const prevText = prev.length ? prev.text().trim().replace(/\s+/g, ' ') : '';
    if (looksLikeName(prevText)) { push(prevText, title, 'text'); continue; }
    const card = $(el).parent();
    if (card.children().length <= 4) {
      const first = card.children().first();
      const t = first.length && first[0] !== el ? first.text().trim().replace(/\s+/g, ' ') : '';
      if (looksLikeName(t)) push(t, title, 'text');
    }
  }
  return people.sort((a, b) => titleRank(a.title) - titleRank(b.title));
}

function detectPlatform(html, generator) {
  const h = html.toLowerCase();
  const g = String(generator || '').toLowerCase();
  if (h.includes('wp-content') || h.includes('wp-includes') || g.includes('wordpress')) return 'WordPress';
  if (h.includes('cdn.shopify.com') || h.includes('shopify.theme') || g.includes('shopify')) return 'Shopify';
  if (h.includes('wixstatic.com') || h.includes('wix.com') || g.includes('wix')) return 'Wix';
  if (h.includes('squarespace') || g.includes('squarespace')) return 'Squarespace';
  if (h.includes('data-wf-page') || h.includes('webflow.js') || g.includes('webflow')) return 'Webflow';
  if (h.includes('__next_data__') || h.includes('/_next/')) return 'Next.js';
  if (h.includes('data-reactroot') || h.includes('react-dom')) return 'React';
  return 'custom';
}

export function extractPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const nodes = jsonLdNodes($);
  $('script,style,noscript,template').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const meta = (sel) => ($(sel).attr('content') || '').trim();
  const generator = meta('meta[name="generator" i]');

  const socials = {};
  $('a[href]').each((_, a) => {
    const s = socialFromUrl(($(a).attr('href') || '').trim());
    if (s && !socials[s[0]]) socials[s[0]] = s[1];
  });
  for (const n of nodes) for (const url of asArray(n.sameAs)) {
    const s = socialFromUrl(String(url));
    if (s && !socials[s[0]]) socials[s[0]] = s[1];
  }

  let origin = '';
  try { origin = new URL(pageUrl).origin; } catch { /* ignore */ }
  const links = [];
  $('a[href]').each((_, a) => {
    const href = ($(a).attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    try {
      const abs = new URL(href, pageUrl);
      if (abs.origin === origin) links.push({ href: abs.origin + abs.pathname, text: $(a).text().trim().slice(0, 60) });
    } catch { /* bad href */ }
  });

  const org = nodes.find((n) => typesOf(n).some((t) => /Organization|LocalBusiness|Corporation|Store|Restaurant|ProfessionalService/i.test(t)));
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  const forms = $('form');
  const hasContactForm = forms.toArray().some((f) => $(f).find('textarea').length > 0 || $(f).find('input[type="email"]').length > 0)
    || $('iframe[src*="form" i], iframe[src*="typeform" i], iframe[src*="hubspot" i]').length > 0;
  const orgPhone = org && typeof org.telephone === 'string' ? org.telephone : '';

  return {
    title: ($('title').first().text() || '').trim().slice(0, 200),
    description: meta('meta[name="description" i]') || meta('meta[property="og:description" i]'),
    siteName: meta('meta[property="og:site_name" i]') || (org && textOf(org)) || '',
    emails: emailsFrom($, text),
    phones: phonesFrom($, text + ' ' + orgPhone),
    socials,
    people: peopleFrom($, nodes),
    links,
    text,
    headings: $('h1,h2,h3').toArray().map((h) => $(h).text().trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40),
    signals: {
      mobile_viewport: $('meta[name="viewport" i]').length > 0,
      copyright_year: years.length ? Math.max(...years) : null,
      has_contact_form: hasContactForm,
      has_blog: links.some((l) => /\/(blog|news|articles|journal)(\/|$)/i.test(l.href)),
      platform: detectPlatform(html, generator),
      generator: generator || null,
    },
  };
}
