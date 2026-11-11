import { hostOf, sleep } from './util.mjs';

export const BOT_UA = 'LeadRadarBot/1.0 (+personal lead research)';
export const API_UA = 'LeadRadar/1.0 (personal lead research)';

const nextSlot = new Map();
const robotsCache = new Map();

export function withTimeout(promise, ms, message = 'timed out') {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

// Reserves the next free slot for a host so concurrent callers queue up one second apart.
export async function throttleHost(host, gapMs = 1000) {
  if (!host) return;
  const slot = Math.max(Date.now(), nextSlot.get(host) || 0);
  nextSlot.set(host, slot + gapMs);
  const wait = slot - Date.now();
  if (wait > 0) await sleep(wait);
}

async function readBody(res, maxBytes) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    size += value.length;
    if (size >= maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}

export async function fetchPage(url, { timeoutMs = 8000, maxBytes = 700 * 1024, headers = {}, polite = true } = {}) {
  const t0 = Date.now();
  try {
    if (polite) await throttleHost(hostOf(url));
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': BOT_UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'en', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = res.headers.get('content-type') || '';
    const text = !contentType || /text|json|xml|html/i.test(contentType) ? await readBody(res, maxBytes) : '';
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, contentType, text, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, finalUrl: url, contentType: '', text: '', ms: Date.now() - t0, error: e.name === 'TimeoutError' ? 'timeout' : e.cause?.code || e.message };
  }
}

export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 20000, gapMs = 1000, ua = API_UA } = {}) {
  try {
    await throttleHost(hostOf(url), gapMs);
    const res = await fetch(url, { method, body, headers: { 'User-Agent': ua, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: '', error: e.name === 'TimeoutError' ? 'timeout' : e.cause?.code || e.message };
  }
}

function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastUa = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastUa) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastUa = true;
    } else {
      lastUa = false;
      if ((key === 'disallow' || key === 'allow') && cur) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.includes('leadradarbot'));
  const star = groups.filter((g) => g.agents.includes('*'));
  return (mine.length ? mine : star).flatMap((g) => g.rules);
}

function ruleRegex(path) {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

export async function robotsAllows(url) {
  let u;
  try { u = new URL(url); } catch { return true; }
  let entry = robotsCache.get(u.origin);
  if (!entry || Date.now() - entry.at > 3600 * 1000) {
    const r = await fetchPage(u.origin + '/robots.txt', { timeoutMs: 5000, maxBytes: 100 * 1024 });
    const looksLikeRobots = r.ok && !/html/i.test(r.contentType) && /user-agent/i.test(r.text);
    entry = { at: Date.now(), rules: looksLikeRobots ? parseRobots(r.text) : [] };
    robotsCache.set(u.origin, entry);
  }
  const target = u.pathname + u.search;
  let best = null;
  for (const rule of entry.rules) {
    if (!rule.path) continue;
    if (ruleRegex(rule.path).test(target) && (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow))) best = rule;
  }
  return !best || best.allow;
}
