import { log } from '../lib/log.mjs';
import { getSetting, patchSetting } from '../lib/settings.mjs';
import { fetchPage } from '../lib/http-fetch.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import { loadStockForMatch } from '../lib/stock-db.mjs';
import { parseRedditAtom, redditPostToLead, gameIndexFor, worthSaving } from '../lib/trade-feed.mjs';

// Verified to exist and return entries (see the worker report). A wrong name would 404 the whole combined feed, so never add unverified ones here.
export const DEFAULT_SUBS = ['RocketLeagueExchange', 'GlobalOffensiveTrade', 'Fortnitetrading', 'AccountsForSale', 'ValorantTrading'];

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const arr = (v) => (Array.isArray(v) ? v : []);
let redditBusy = false;

export function subsFor(trading = {}) {
  const extra = arr(trading.extra_subreddits).map((s) => String(s || '').replace(/^\/?r\//i, '').trim()).filter((s) => /^[A-Za-z0-9_]{2,21}$/.test(s));
  const seen = new Set();
  return [...DEFAULT_SUBS, ...extra].filter((s) => (seen.has(s.toLowerCase()) ? false : seen.add(s.toLowerCase())));
}

export async function scanReddit(trading) {
  const subs = subsFor(trading);
  if (!subs.length) return { seen: 0, matched: 0, inserted: 0, error: 'No subreddits to watch' };
  const res = await fetchPage(`https://www.reddit.com/r/${subs.join('+')}/new/.rss?limit=100`, { headers: { 'User-Agent': BROWSER_UA }, timeoutMs: 25000, maxBytes: 3 * 1024 * 1024 });
  if (res.status === 429) return { seen: 0, matched: 0, inserted: 0, error: 'Reddit is rate-limiting this connection; will retry next time' };
  if (!res.ok) return { seen: 0, matched: 0, inserted: 0, error: `Reddit feed answered ${res.status || res.error}` };
  const entries = parseRedditAtom(res.text);
  const ctx = { trading, gameIndex: gameIndexFor(trading), stock: await loadStockForMatch().catch(() => undefined) };
  const leads = entries.map((e) => redditPostToLead(e, ctx)).filter(worthSaving);
  const inserted = leads.length ? await insertLeads(leads) : 0;
  return { seen: entries.length, matched: leads.length, inserted };
}

async function runReddit(trading) {
  if (redditBusy) return null;
  redditBusy = true;
  try {
    const r = await scanReddit(trading);
    const state = await getSetting('trade_state');
    await patchSetting('trade_state', { reddit: { ...(state.reddit || {}), last_run: new Date().toISOString(), last_error: r.error || null } });
    if (r.error) log('trade', r.error); else log('trade', `reddit: ${r.seen} posts, ${r.matched} trade posts, ${r.inserted} new`);
    return r;
  } finally {
    redditBusy = false;
  }
}

async function recordRun(summary) {
  await patchSetting('trading', { last_run: new Date().toISOString(), last_result: summary });
}

export const jobs = {
  async trade_scan() {
    const trading = await getSetting('trading');
    if (!trading.enabled) throw new Error('Turn on game trading first (Settings > Trading).');
    const reddit = await runReddit(trading);
    const out = { reddit: reddit?.matched || 0, inserted: reddit?.inserted || 0 };
    await recordRun({ ...out, reddit_error: reddit?.error || null });
    return out;
  },
};

export const tasks = [
  {
    // n8n's Reddit feeds fire at :00 :05 :10 :20 :25 :30 :40 :45 :50. Minutes 15, 35 and 55 are at least five minutes from all of them.
    name: 'trade-reddit', everyMs: 60000, initialDelayMs: 20000,
    async run() {
      const trading = await getSetting('trading');
      if (!trading.enabled) return;
      const slot = new Date().getMinutes() % 20;
      if (slot !== 15 && slot !== 16) return;
      const state = await getSetting('trade_state');
      if (Date.now() - (state.reddit?.last_run ? Date.parse(state.reddit.last_run) : 0) < 10 * 60 * 1000) return;
      const r = await runReddit(trading);
      if (r) await recordRun({ reddit: r.matched, inserted: r.inserted, reddit_error: r.error || null });
    },
  },
];
