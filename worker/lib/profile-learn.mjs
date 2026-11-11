import { getSetting, setSetting } from './settings.mjs';
import { claudeStatus, extractJson, runClaude } from './claude.mjs';
import { fetchJson, fetchPage, robotsAllows } from './http-fetch.mjs';
import { extractPage } from './enrich-extract.mjs';
import { hostOf } from './util.mjs';

const LOGIN_WALL_HOSTS = ['linkedin.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'tiktok.com'];
const PER_SOURCE = 10000;
const TOTAL_CAP = 30000;
const SERVICE_WORDS = ['website', 'web design', 'web development', 'web app', 'mobile app', 'app development', 'logo', 'branding', 'graphic design', 'ui/ux', 'ux design', 'seo', 'e-commerce', 'ecommerce', 'shopify', 'wordpress', 'automation', 'chatbot', 'ai agent', 'video editing', 'copywriting'];

const normalize = (u) => (/^https?:\/\//i.test(String(u).trim()) ? String(u).trim() : 'https://' + String(u).trim());

function pageText(p) {
  const parts = [p.title && `Title: ${p.title}`, p.description && `Description: ${p.description}`, p.headings.length && `Headings: ${p.headings.join(' | ')}`, p.text.slice(0, 6000)];
  return parts.filter(Boolean).join('\n');
}

async function readGithub(url) {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/?$/i.exec(url);
  if (!m) return null;
  const gh = { headers: { Accept: 'application/vnd.github+json' }, gapMs: 500 };
  const user = await fetchJson(`https://api.github.com/users/${m[1]}`, gh);
  if (!user.ok || !user.json) return { status: 'failed', text: '', note: `GitHub API ${user.status || user.error}` };
  const repos = await fetchJson(`https://api.github.com/users/${m[1]}/repos?sort=updated&per_page=10`, gh);
  const u = user.json;
  const lines = [`GitHub profile ${u.login}: ${u.name || ''} ${u.bio ? '- ' + u.bio : ''}`, u.blog && `Website: ${u.blog}`, u.location && `Location: ${u.location}`, `Public repos: ${u.public_repos}`];
  for (const r of Array.isArray(repos.json) ? repos.json : []) lines.push(`Repo ${r.name}${r.language ? ' [' + r.language + ']' : ''}${r.description ? ': ' + r.description : ''} (${r.stargazers_count} stars)`);
  return { status: 'ok', text: lines.filter(Boolean).join('\n') };
}

async function readSource(url, isWebsite) {
  const gh = await readGithub(url);
  if (gh) return gh;
  const host = hostOf(url) || '';
  if (!(await robotsAllows(url))) return { status: 'blocked', text: '', note: 'robots.txt does not allow reading this page' };
  const res = await fetchPage(url);
  if (!res.ok || !res.text) {
    const wall = LOGIN_WALL_HOSTS.some((h) => host === h || host.endsWith('.' + h));
    return { status: wall || res.status === 403 || res.status === 999 ? 'blocked' : 'failed', text: '', note: wall ? 'This site needs a login to be read' : `HTTP ${res.status || res.error}` };
  }
  const home = extractPage(res.text, res.finalUrl);
  const wall = LOGIN_WALL_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  if (wall && home.text.length < 1500) return { status: 'blocked', text: '', note: 'This site needs a login to be read' };
  let text = pageText(home);
  if (isWebsite) {
    const extra = home.links.filter((l) => /about|service|portfolio|work|case|pricing/i.test(l.href)).slice(0, 2);
    for (const l of extra) {
      if (!(await robotsAllows(l.href))) continue;
      const r = await fetchPage(l.href);
      if (r.ok && r.text) text += '\n---\n' + pageText(extractPage(r.text, r.finalUrl));
    }
  }
  return { status: 'ok', text };
}

function heuristicSummary(profile, sources) {
  const all = sources.map((s) => s.text).join('\n').toLowerCase();
  const found = SERVICE_WORDS.filter((w) => all.includes(w));
  const services = [...new Set([...(profile.services || []), ...found])].slice(0, 12);
  const firstDesc = sources.map((s) => (/Description: (.+)/.exec(s.text) || [])[1]).find(Boolean) || '';
  return {
    mode: 'heuristic',
    business_name: profile.business_name || '',
    summary: firstDesc || profile.headline || '',
    what_you_sell: services,
    services,
    ideal_customers: [],
    strengths: [],
    voice: '',
    sample_phrases: [],
    keywords_target: services,
    keywords_avoid: [],
    portfolio_highlights: [],
  };
}

function buildPrompt(profile, sources) {
  const material = sources.map((s) => `### SOURCE ${s.url} (${s.status})\n${s.text.slice(0, PER_SOURCE)}`).join('\n\n').slice(0, TOTAL_CAP);
  return `Read the material about a freelancer or small agency and describe them. Use ONLY facts present in the material or in the owner's own notes. If something is unknown, use an empty string or empty array. Never invent services, clients, prices or results.

Owner's own notes (authoritative):
${JSON.stringify({ your_name: profile.your_name, business_name: profile.business_name, headline: profile.headline, services: profile.services, location: profile.location, notes: profile.notes }, null, 1)}

Material:
${material}

Return ONLY a JSON object with exactly these keys:
{"business_name":string,"summary":string (2 sentences max),"what_you_sell":[string],"services":[string],"ideal_customers":[string],"strengths":[string],"voice":string (how they write: tone, sentence length, formality, based on the material),"sample_phrases":[string (short phrases actually used by them)],"keywords_target":[string (8-15 short phrases that a person who needs these services would write in a request, e.g. "shopify developer", "need a logo")],"keywords_avoid":[string (topics clearly outside their services)],"portfolio_highlights":[string]}`;
}

export async function learnProfile() {
  const profile = await getSetting('profile');
  const seen = new Set();
  const urls = [];
  for (const [kind, list] of [['w', profile.websites], ['l', profile.links]]) {
    for (const u of list || []) {
      const n = normalize(u);
      if (n.length > 10 && !seen.has(n)) { seen.add(n); urls.push([kind, n]); }
    }
  }
  const sources = [];
  for (const [kind, url] of urls.slice(0, 12)) {
    try {
      const r = await readSource(url, kind === 'w');
      sources.push({ url, kind, status: r.status, text: r.text || '', note: r.note, chars: (r.text || '').length });
    } catch (e) {
      sources.push({ url, kind, status: 'failed', text: '', note: e.message, chars: 0 });
    }
  }
  const readable = sources.filter((s) => s.text);
  const ownerOnly = !!(profile.services?.length || profile.headline || profile.notes);
  if (!readable.length && !ownerOnly) throw new Error('Nothing to learn from: add a website or profile link, or list your services.');

  let summary;
  const status = await claudeStatus();
  if (status.available) {
    try {
      const out = await runClaude(buildPrompt(profile, readable), { system: 'You output only valid JSON, nothing else.', timeoutMs: 180000 });
      const j = extractJson(out);
      const arr = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 20) : []);
      summary = {
        mode: 'claude',
        business_name: String(j.business_name || profile.business_name || ''),
        summary: String(j.summary || ''),
        what_you_sell: arr(j.what_you_sell), services: arr(j.services), ideal_customers: arr(j.ideal_customers), strengths: arr(j.strengths),
        voice: String(j.voice || ''), sample_phrases: arr(j.sample_phrases), keywords_target: arr(j.keywords_target), keywords_avoid: arr(j.keywords_avoid),
        portfolio_highlights: arr(j.portfolio_highlights),
      };
    } catch {
      summary = null;
    }
  }
  if (!summary) summary = heuristicSummary(profile, readable.filter((s) => s.kind === 'w'));

  const value = {
    generated_at: new Date().toISOString(),
    sources: sources.map((s) => ({ url: s.url, status: s.status, chars: s.chars, ...(s.note ? { note: s.note } : {}) })),
    ...summary,
  };
  await setSetting('profile_summary', value);
  return { mode: value.mode, sources: value.sources, summary: value.summary };
}
