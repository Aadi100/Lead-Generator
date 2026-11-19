import { sb } from './db.mjs';
import { log } from './log.mjs';
import { getSetting, patchSetting } from './settings.mjs';
import { createScorer } from './scoring.mjs';

export const INTEGRATION_DEFAULTS = {
  serper: { enabled: false, api_key: '', services: true, trading: true, indiehackers: true, linkedin: true, fiverr: true },
  producthunt: { enabled: true, token: '' },
  x: { enabled: false, bearer_token: '' },
  reddit_api: { enabled: false, client_id: '', client_secret: '', username: '' },
  upwork_inbox: { enabled: false },
  status: {},
};

export const LABELS = { serper: 'Google search (Serper)', x: 'X (Twitter)', reddit_api: 'Reddit API', upwork_inbox: 'Upwork alerts', producthunt: 'Product Hunt', indiehackers: 'Indie Hackers', linkedin: 'LinkedIn', fiverr: 'Fiverr discovery', places: 'Google Places' };
const HOUR = 3600 * 1000;

export async function getIntegrations() {
  const v = await getSetting('integrations');
  const out = {};
  for (const k of Object.keys(INTEGRATION_DEFAULTS)) out[k] = { ...INTEGRATION_DEFAULTS[k], ...(v[k] || {}) };
  return out;
}

export async function loadScorer() {
  return createScorer(await getSetting('targeting'));
}

export function hasOverride(key) {
  try { return JSON.parse(process.env.SETTINGS_OVERRIDE || '{}')[key] !== undefined; } catch { return false; }
}

const lastWritten = new Map();

// Writes integrations.status[name] without touching the keys the user saved. Skips the write when nothing changed recently.
export async function recordStatus(name, ok, message) {
  if (hasOverride('integrations')) return;
  const msg = String(message || '').slice(0, 300);
  const prev = lastWritten.get(name);
  if (prev && prev.ok === ok && prev.msg === msg && Date.now() - prev.at < 30 * 60 * 1000) return;
  const { data } = await sb.from('app_settings').select('value').eq('key', 'integrations').maybeSingle();
  const value = data?.value || {};
  const status = { ...(value.status || {}), [name]: { ok: !!ok, checked_at: new Date().toISOString(), message: msg } };
  const { error } = await sb.from('app_settings').upsert({ key: 'integrations', value: { ...value, status }, updated_at: new Date().toISOString() });
  if (!error) lastWritten.set(name, { ok: !!ok, msg, at: Date.now() });
}

const fingerprint = (s) => {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return String(h);
};
const backoffs = new Map();

export function backoffActive(name, key) {
  const b = backoffs.get(name);
  if (!b) return false;
  if (b.fp !== fingerprint(key)) { backoffs.delete(name); return false; }
  return Date.now() < b.until;
}
export function startBackoff(name, key, ms) {
  backoffs.set(name, { until: Date.now() + ms, fp: fingerprint(key) });
}
export function clearBackoffs() {
  backoffs.clear();
}

// Plain-words message and back-off for a failed API call.
export function explainHttp(name, res, host) {
  const label = LABELS[name] || name;
  const s = res.status;
  if (s === 401) return { message: `${label}: the key was rejected (401). Check that it was pasted correctly. I will try again in 6 hours, or as soon as you change the key.`, backoffMs: 6 * HOUR };
  if (s === 402) return { message: `${label}: your plan does not include this or has no credits left (402). A paid plan or more credits is needed. I will try again in 6 hours.`, backoffMs: 6 * HOUR };
  if (s === 403) return { message: `${label}: access denied (403). The key may be missing a permission, or the plan does not include this. I will try again in 6 hours.`, backoffMs: 6 * HOUR };
  if (s === 429) return { message: `${label}: rate limit reached (429). Waiting an hour before trying again.`, backoffMs: HOUR };
  if (!s) return { message: `${label}: could not reach ${host || 'the service'} (${res.error || 'network error'}). Will try again later.`, backoffMs: 15 * 60 * 1000 };
  if (s >= 500) return { message: `${label}: the service had a problem (${s}). Will try again later.`, backoffMs: 30 * 60 * 1000 };
  return { message: `${label}: unexpected reply (${s}). Will try again in an hour.`, backoffMs: HOUR };
}

export async function dueNow(name, intervalMs) {
  const st = await getSetting('src_state');
  const last = st[name] ? Date.parse(st[name]) : 0;
  return Date.now() - last >= intervalMs;
}
export async function markRun(name) {
  await patchSetting('src_state', { [name]: new Date().toISOString() });
}

// A task that wakes every minute and only does real work when its interval has passed.
export function makeTask(name, intervalMs, fn) {
  return {
    name: `src-${name}`, everyMs: 60000, initialDelayMs: 20000 + Math.floor(Math.random() * 15000),
    async run() {
      if (!(await dueNow(name, intervalMs))) return;
      const r = await fn();
      if (r && !r.skipped) {
        await markRun(name);
        log(`src-${name}`, JSON.stringify(r));
      }
    },
  };
}

// Leads older than a day were posted before we saw them: save them, but do not alert about them.
export function prepareLead(lead) {
  const out = { ...lead };
  const posted = out.posted_at ? Date.parse(out.posted_at) : NaN;
  if (!Number.isNaN(posted) && Date.now() - posted > 24 * HOUR) out.alerted_at = new Date().toISOString();
  return out;
}

export async function loadTrade() {
  try {
    const mod = await import('./trade-parse.mjs');
    return typeof mod.parseTradePost === 'function' ? mod : null;
  } catch {
    return null;
  }
}

const ITEM_WORD = { account: 'account', boosting: 'boosting', 'top-up': 'top up', currency: 'currency', items: 'skins', keys: 'key' };

// Which games/items to search for. side 'buyer' = people who want what the user sells.
export function tradeTargets(trading = {}, max = 8) {
  const out = [];
  const add = (side, game, itemType) => {
    const g = String(game || '').trim();
    if (!g) return;
    const item = ITEM_WORD[itemType] || '';
    const key = `${side}|${g.toLowerCase()}|${item}`;
    if (!out.some((o) => o.key === key)) out.push({ key, side, game: g, item });
  };
  for (const e of trading.i_sell || []) add('buyer', e.game || (e.keywords || [])[0], e.item_type);
  for (const e of trading.i_want || []) add('seller', e.game || (e.keywords || [])[0], e.item_type);
  for (const g of trading.games || []) add('buyer', g, '');
  return out.slice(0, max);
}

export function tradeGames(trading = {}) {
  return [...new Set(tradeTargets(trading, 40).map((t) => t.game))];
}

export function cleanBearer(token) {
  return String(token || '').trim().replace(/^bearer\s+/i, '').replace(/^["']|["']$/g, '');
}

export function toTradeLead(lead, parsed) {
  return Object.assign(lead, {
    lead_kind: 'trade', category: 'Gaming', categories: JSON.stringify(['Gaming']),
    trade_side: parsed.side, game: parsed.game, item_type: parsed.item_type || 'other',
  });
}
