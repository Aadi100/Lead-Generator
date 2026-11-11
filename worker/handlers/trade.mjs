import { log } from '../lib/log.mjs';
import { getSetting, patchSetting } from '../lib/settings.mjs';
import { fetchPage, fetchJson } from '../lib/http-fetch.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import { loadStockForMatch } from '../lib/stock-db.mjs';
import { sleep } from '../lib/util.mjs';
import { parseRedditAtom, redditPostToLead, discordMessageToLead, gameIndexFor, snowflakeGt, worthSaving } from '../lib/trade-feed.mjs';

// Verified to exist and return entries (see the worker report). A wrong name would 404 the whole combined feed, so never add unverified ones here.
export const DEFAULT_SUBS = ['RocketLeagueExchange', 'GlobalOffensiveTrade', 'Fortnitetrading', 'AccountsForSale', 'ValorantTrading'];

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_UA = 'DiscordBot (https://github.com/Aadi100/Lead-Generator, 1.0)';
const arr = (v) => (Array.isArray(v) ? v : []);
const guildCache = new Map();
let redditBusy = false;
let discordBusy = false;

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

function discordProblem(r) {
  const code = r.json?.code;
  if (r.status === 401) return 'The bot token was rejected (Settings > Connections > Discord).';
  if (code === 50001 || r.status === 403) return 'Missing Access: the bot is not in that server or cannot see that channel.';
  if (code === 10003 || r.status === 404) return 'Unknown channel: check the channel id.';
  if (code === 50013) return 'Missing Permissions: give the bot View Channel and Read Message History.';
  return `Discord answered ${r.status || r.error}${r.json?.message ? `: ${r.json.message}` : ''}`;
}

async function discordGet(path, token) {
  let r = await fetchJson(`${DISCORD_API}${path}`, { headers: { Authorization: `Bot ${token}` }, ua: DISCORD_UA, gapMs: 1100 });
  if (r.status === 429) {
    const wait = Math.min(Number(r.json?.retry_after) || 2, 10);
    await sleep(wait * 1000 + 200);
    r = await fetchJson(`${DISCORD_API}${path}`, { headers: { Authorization: `Bot ${token}` }, ua: DISCORD_UA, gapMs: 1100 });
  }
  return r;
}

export async function scanDiscord(trading, integrations, state) {
  const token = integrations.discord?.bot_token;
  const channels = arr(trading.discord?.channels).filter((c) => c && /^\d{5,25}$/.test(String(c.id || '').trim()));
  if (!trading.discord?.enabled || !token || !channels.length) return { skipped: true, matched: 0, inserted: 0, errors: {} };
  const ctx = { trading, gameIndex: gameIndexFor(trading), stock: await loadStockForMatch().catch(() => undefined) };
  const newest = { ...(state.discord || {}) };
  const errors = {};
  let matched = 0;
  let inserted = 0;
  for (const ch of channels) {
    const id = String(ch.id).trim();
    if (!guildCache.has(id)) {
      const info = await discordGet(`/channels/${id}`, token);
      if (!info.ok) { errors[id] = discordProblem(info); continue; }
      guildCache.set(id, info.json?.guild_id || null);
    }
    const after = newest[id];
    const r = await discordGet(`/channels/${id}/messages?limit=50${after ? `&after=${after}` : ''}`, token);
    if (!r.ok) { errors[id] = discordProblem(r); continue; }
    const msgs = (Array.isArray(r.json) ? r.json : []).slice().sort((a, b) => (snowflakeGt(a.id, b.id) ? 1 : -1));
    if (msgs.length && msgs.every((m) => !m.author?.bot && !String(m.content || '').trim())) {
      errors[id] = 'Messages came back empty: turn on "Message Content Intent" for the bot in the Discord developer portal.';
    }
    const leads = msgs.map((m) => discordMessageToLead(m, { guildId: guildCache.get(id), channelId: id, label: ch.label }, ctx)).filter(worthSaving);
    matched += leads.length;
    if (leads.length) inserted += await insertLeads(leads);
    for (const m of msgs) if (snowflakeGt(m.id, newest[id] || '0')) newest[id] = m.id;
  }
  return { matched, inserted, errors, newest };
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

async function runDiscord(trading) {
  if (discordBusy) return null;
  discordBusy = true;
  try {
    const [integrations, state] = await Promise.all([getSetting('integrations'), getSetting('trade_state')]);
    const r = await scanDiscord(trading, integrations, state);
    if (r.newest) await patchSetting('trade_state', { discord: r.newest, discord_errors: r.errors });
    if (!r.skipped) log('trade', `discord: ${r.matched} trade messages, ${r.inserted} new${Object.keys(r.errors).length ? `, problems: ${JSON.stringify(r.errors)}` : ''}`);
    return r;
  } finally {
    discordBusy = false;
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
    const discord = await runDiscord(trading);
    const out = { reddit: reddit?.matched || 0, discord: discord?.matched || 0, inserted: (reddit?.inserted || 0) + (discord?.inserted || 0) };
    await recordRun({ ...out, reddit_error: reddit?.error || null, discord_errors: discord?.errors || {} });
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
  {
    name: 'trade-discord', everyMs: 120000, initialDelayMs: 30000,
    async run() {
      const trading = await getSetting('trading');
      if (!trading.enabled || !trading.discord?.enabled) return;
      await runDiscord(trading);
    },
  },
];
