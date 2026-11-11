import { FREE_MAIL, domainOfEmail, hostOf, nowIso } from './util.mjs';
import { fetchPage, robotsAllows, withTimeout } from './http-fetch.mjs';
import { buildEmailEntry, guessEmails, hasMx, pickBestEmail } from './enrich-email.mjs';
import { extractPage, looksLikeName, socialsFromText } from './enrich-extract.mjs';

const PLATFORM_HOSTS = [
  'reddit.com', 'redd.it', 'freelancer.com', 'upwork.com', 'linkedin.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com',
  'news.ycombinator.com', 'ycombinator.com', 'weworkremotely.com', 'openstreetmap.org', 'github.com', 'behance.net', 'dribbble.com',
  'youtube.com', 'youtu.be', 'tiktok.com', 'discord.com', 'discord.gg', 't.me', 'telegram.me', 'wa.me', 'whatsapp.com', 'docs.google.com',
  'forms.gle', 'typeform.com', 'calendly.com', 'notion.site', 'notion.so', 'imgur.com', 'bit.ly', 'goo.gl', 'medium.com', 'pinterest.com',
  'fiverr.com', 'peopleperhour.com', 'google.com', 'wikipedia.org',
];
const isPlatformHost = (host) => !host || PLATFORM_HOSTS.some((p) => host === p || host.endsWith('.' + p));

const SUBPAGE_RE = [/contact/i, /about|who-we-are|our-story|story/i, /team|people|staff|leadership/i];
const DEFAULT_SUBPAGES = ['/contact', '/about', '/team'];

function cleanUrl(u) {
  return String(u || '').trim().replace(/[.,;:)\]>"']+$/, '');
}

function collectCandidates(lead) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    let url = cleanUrl(raw);
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const host = hostOf(url);
    if (isPlatformHost(host) || seen.has(host) || !/\.[a-z]{2,}$/i.test(host)) return;
    seen.add(host);
    out.push(url);
  };
  for (const part of String(lead.contact || '').split(' · ')) {
    const m = /^site:\s*(.+)$/i.exec(part.trim());
    if (m) add(m[1]);
  }
  for (const m of String(lead.description || '').matchAll(/https?:\/\/[^\s<>"')\]]+/g)) add(m[0]);
  for (const e of collectProvidedEmails(lead)) {
    const d = domainOfEmail(e);
    if (d && !FREE_MAIL.has(d)) add(d);
  }
  if (lead.website) add(lead.website);
  return out.slice(0, 2);
}

function collectProvidedEmails(lead) {
  const found = new Set();
  const text = `${lead.contact || ''}\n${lead.description || ''}`;
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) found.add(m[0].toLowerCase());
  return [...found].slice(0, 5);
}

function providedPhones(lead) {
  const out = [];
  for (const part of String(lead.contact || '').split(' · ')) {
    const m = /^(?:phone|whatsapp):\s*(.+)$/i.exec(part.trim());
    if (m) out.push(m[1].trim());
  }
  return out;
}

function pickSubpages(home) {
  const chosen = [];
  for (const re of SUBPAGE_RE) {
    const hit = home.links.find((l) => re.test(l.href.split('/').pop() || '') || re.test(l.text));
    if (hit && !chosen.includes(hit.href)) chosen.push(hit.href);
  }
  if (!chosen.length) {
    for (const p of DEFAULT_SUBPAGES) {
      try { chosen.push(new URL(p, home.finalUrl).href); } catch { /* ignore */ }
    }
  }
  return chosen.slice(0, 3);
}

async function crawlSite(startUrl) {
  if (!(await robotsAllows(startUrl))) return { robotsBlocked: true, startUrl };
  let page = await fetchPage(startUrl);
  if (page.status === 0 && startUrl.startsWith('https://')) page = await fetchPage('http://' + startUrl.slice(8));
  if (!page.ok || !page.text) {
    return { reachable: false, statusCode: page.status, error: page.error || `HTTP ${page.status}`, startUrl, finalUrl: page.finalUrl };
  }
  const home = extractPage(page.text, page.finalUrl);
  const pages = [{ label: 'home', ...home }];
  for (const url of pickSubpages(home)) {
    if (pages.length >= 4) break;
    if (!(await robotsAllows(url))) continue;
    const r = await fetchPage(url);
    if (r.ok && r.text && /html|text/i.test(r.contentType || 'text/html')) {
      let label = url;
      try { label = new URL(url).pathname || url; } catch { /* ignore */ }
      pages.push({ label, ...extractPage(r.text, r.finalUrl) });
    }
  }
  return { reachable: true, startUrl, finalUrl: page.finalUrl, statusCode: page.status, ms: page.ms, pages, home };
}

function buildSignals(crawl) {
  if (crawl.robotsBlocked) return { reachable: null, robots_blocked: true, issues: [] };
  if (!crawl.reachable) {
    return { reachable: false, status_code: crawl.statusCode || null, final_url: crawl.finalUrl || null, issues: [`Website did not load (${crawl.error})`] };
  }
  const year = new Date().getFullYear();
  const h = crawl.home.signals;
  const issues = [];
  const https = String(crawl.finalUrl).startsWith('https://');
  if (!https) issues.push('Site is not served over HTTPS');
  if (!h.mobile_viewport) issues.push('No mobile viewport tag (may not be mobile-friendly)');
  if (h.copyright_year && h.copyright_year <= year - 3) issues.push(`Footer copyright says ${h.copyright_year}`);
  if (crawl.ms > 4000) issues.push(`Home page took ${(crawl.ms / 1000).toFixed(1)}s to load`);
  return {
    reachable: true,
    status_code: crawl.statusCode,
    final_url: crawl.finalUrl,
    platform: h.platform,
    https,
    mobile_viewport: h.mobile_viewport,
    copyright_year: h.copyright_year,
    has_contact_form: crawl.pages.some((p) => p.signals.has_contact_form),
    has_blog: h.has_blog,
    title: crawl.home.title || null,
    description: crawl.home.description || null,
    load_ms: crawl.ms,
    issues,
  };
}

function buildOpportunity(lead, hasSite, signals) {
  if (!hasSite) {
    if (lead.lead_kind === 'prospect') return 'OpenStreetMap lists no website for this business: offer a first site.';
    if (lead.category === 'Website') return 'No website link was shared in the post.';
    return null;
  }
  if (signals.robots_blocked) return null;
  const issues = signals.issues || [];
  if (!issues.length) return null;
  const pitch = lead.category === 'Website' || lead.lead_kind === 'prospect' ? ' A fix or redesign pitch may fit.' : '';
  return `Site notes: ${issues.join('; ')}.${pitch}`;
}

function registrable(host) {
  return String(host || '').replace(/^www\./, '');
}

export async function enrichLead(lead) {
  const candidates = collectCandidates(lead);
  const socials = { ...(lead.socials || {}), ...socialsFromText(`${lead.contact || ''}\n${lead.description || ''}`) };
  const phones = new Set(providedPhones(lead));
  const emailMap = new Map();
  for (const e of collectProvidedEmails(lead)) emailMap.set(e, { provided: true, source: 'lead' });

  let crawl = null;
  let website = lead.website || null;
  for (const url of candidates) {
    crawl = await crawlSite(url);
    if (crawl.reachable || crawl.robotsBlocked) { website = crawl.finalUrl || url; break; }
    website = website || url;
  }

  let ownerName = null;
  let ownerTitle = null;
  let companyName = lead.company_name || null;
  const siteHost = registrable(hostOf(website));

  if (crawl && crawl.reachable) {
    for (const p of crawl.pages) {
      Object.entries(p.socials).forEach(([k, v]) => { if (!socials[k]) socials[k] = v; });
      p.phones.forEach((ph) => phones.add(ph));
      for (const e of p.emails) {
        const d = registrable(domainOfEmail(e));
        const sameSite = siteHost && (d === siteHost || d.endsWith('.' + siteHost) || siteHost.endsWith('.' + d));
        if (!emailMap.has(e) && (sameSite || FREE_MAIL.has(d))) emailMap.set(e, { provided: false, source: `site:${p.label}` });
      }
      if (!ownerName && p.people.length) { ownerName = p.people[0].name; ownerTitle = p.people[0].title; }
    }
    const site = String(crawl.home.siteName || '').trim();
    const host = hostOf(crawl.finalUrl) || '';
    const isPlatformName = site && (host === site.toLowerCase() || host.endsWith('.' + site.toLowerCase()));
    companyName = site && !isPlatformName ? site : null;
  }

  if (!ownerName && lead.author && !/^u\//.test(lead.author) && ['Web Form', 'Hacker News'].includes(lead.source) && looksLikeName(lead.author)) {
    ownerName = lead.author;
  }
  if (!ownerName && lead.owner_name && !(crawl && crawl.reachable)) { ownerName = lead.owner_name; ownerTitle = lead.owner_title || null; }

  const entries = [];
  for (const [email, meta] of [...emailMap].slice(0, 8)) entries.push(await buildEmailEntry(email, meta));
  if (ownerName && crawl && crawl.reachable && ownerTitle) {
    const domain = siteHost && !FREE_MAIL.has(siteHost) ? siteHost : null;
    if (domain && (await hasMx(domain)) === true) {
      for (const g of await guessEmails(ownerName, domain)) if (!entries.some((e) => e.email === g.email)) entries.push(g);
    }
  }
  for (const prev of lead.emails || []) if (prev && prev.bounced && !entries.some((e) => e.email === prev.email)) entries.push(prev);

  const best = pickBestEmail(entries);
  const signals = crawl ? buildSignals(crawl) : {};
  const hasSite = !!(crawl && (crawl.reachable || crawl.robotsBlocked));
  const gotSomething = candidates.length > 0 || entries.length > 0 || phones.size > 0 || Object.keys(socials).length > 0;

  return {
    enrich_status: gotSomething ? 'done' : 'skipped',
    enriched_at: nowIso(),
    enrich_error: null,
    website,
    company_name: companyName,
    owner_name: ownerName,
    owner_title: ownerTitle,
    emails: entries.slice(0, 10),
    phones: [...phones].slice(0, 5),
    socials,
    site_signals: signals,
    opportunity: buildOpportunity(lead, hasSite || !!(crawl && !crawl.reachable && candidates.length), signals),
    best_email: best ? best.email : null,
    best_email_status: best ? best.status : null,
  };
}

export const enrichWithTimeout = (lead, ms = 45000) => withTimeout(enrichLead(lead), ms, `enrichment timed out after ${Math.round(ms / 1000)}s`);
