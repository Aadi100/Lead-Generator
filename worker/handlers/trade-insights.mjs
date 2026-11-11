import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting, setSetting, patchSetting } from '../lib/settings.mjs';
import { claudeStatus, runClaude, extractJson } from '../lib/claude.mjs';

const DAYS = 30;
const arr = (v) => (Array.isArray(v) ? v : []);
const ITEM_TYPES = ['account', 'boosting', 'top-up', 'currency', 'items', 'keys', 'other'];

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return Math.round((a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2) * 100) / 100;
}

// Pure. leads: [{game, item_type, trade_side, budget_amount, is_suspicious}]
export function aggregateMarket(leads) {
  const groups = new Map();
  let used = 0;
  for (const l of leads) {
    if (!l.game || l.is_suspicious) continue;
    used++;
    const key = `${l.game}|${l.item_type || 'other'}`;
    const g = groups.get(key) || { game: l.game, item_type: l.item_type || 'other', wanted: 0, offered: 0, prices: [] };
    if (l.trade_side === 'buyer') g.wanted++; else if (l.trade_side === 'seller') g.offered++;
    if (l.budget_amount !== null && l.budget_amount !== undefined && Number(l.budget_amount) > 0) g.prices.push(Number(l.budget_amount));
    groups.set(key, g);
  }
  const rows = [...groups.values()]
    .map((g) => ({
      game: g.game, item_type: g.item_type, wanted: g.wanted, offered: g.offered,
      median_price: median(g.prices), ratio: Math.round((g.wanted / Math.max(g.offered, 1)) * 100) / 100,
    }))
    .sort((a, b) => b.wanted + b.offered - (a.wanted + a.offered))
    .slice(0, 60);
  return { rows, totals: { trade_leads: used } };
}

export function heuristicSuggestions(rows) {
  const observed = rows.filter((r) => r.wanted >= 1).sort((a, b) => b.ratio - a.ratio || b.wanted - a.wanted).slice(0, 6);
  if (observed.length) {
    return observed.map((r) => ({
      title: `${r.game} ${r.item_type}`,
      why: `${r.wanted} ${r.wanted === 1 ? 'person asked' : 'people asked'} to buy and ${r.offered} ${r.offered === 1 ? 'offer was' : 'offers were'} posted in the last ${DAYS} days${r.median_price ? `, with a typical price around $${r.median_price}` : ''}.`,
      game: r.game, item_type: r.item_type, basis: 'observed',
      confidence: r.wanted >= 5 ? 'high' : r.wanted >= 2 ? 'medium' : 'low',
    }));
  }
  return [
    { title: 'Top-ups for popular mobile and Roblox games', why: 'Small, repeat purchases are the most common kind of game trade. This is general knowledge, not measured from your data yet.', game: 'Roblox', item_type: 'top-up', basis: 'general knowledge', confidence: 'low' },
    { title: 'Rank boosting for Valorant, League of Legends or Apex', why: 'Boosting is a steady service category. This is general knowledge; check each publisher\'s rules before offering it.', game: 'Valorant', item_type: 'boosting', basis: 'general knowledge', confidence: 'low' },
    { title: 'Genshin Impact or Honkai accounts', why: 'Account trades for gacha games are common. This is general knowledge; many publishers forbid account sales.', game: 'Genshin Impact', item_type: 'account', basis: 'general knowledge', confidence: 'low' },
  ];
}

export function buildSuggestPrompt({ rows, trading = {}, profile = {} }) {
  const table = rows.slice(0, 25).map((r) => `${r.game} | ${r.item_type} | buyers ${r.wanted} | sellers ${r.offered} | median price ${r.median_price ?? 'n/a'}`).join('\n') || '(no data collected yet)';
  const mine = (list) => arr(list).map((e) => `${e.label || [e.game, e.item_type].filter(Boolean).join(' ')}${e.price ? ` (price ${e.price})` : ''}`).join('; ') || 'nothing listed';
  return [
    `A person trades in-game goods (game accounts, boosting services, top-ups, currency, items). Over the last ${DAYS} days these public posts were collected (suspicious posts excluded):`,
    table,
    '',
    `They already sell: ${mine(trading.i_sell)}`,
    `They want to buy: ${mine(trading.i_want)}`,
    profile.notes ? `Their notes: ${String(profile.notes).slice(0, 300)}` : '',
    '',
    'Suggest 5 to 8 concrete things they could sell. Prefer rows with many buyers and few sellers. Plain words, no guarantees, no invented numbers.',
    'basis must be "observed" only when the table supports it, otherwise "general knowledge". Mention a real risk in "why" when relevant (publisher rules against selling accounts, scams, chargebacks).',
    'Return ONLY JSON: {"notes": "one or two sentences", "items": [{"title": "...", "why": "...", "game": "...", "item_type": "account|boosting|top-up|currency|items|keys|other", "basis": "observed|general knowledge", "confidence": "high|medium|low"}]}',
  ].filter(Boolean).join('\n');
}

export function normalizeSuggestions(obj) {
  const items = arr(obj?.items).map((i) => ({
    title: String(i?.title || '').trim().slice(0, 120),
    why: String(i?.why || '').trim().slice(0, 400),
    game: String(i?.game || '').trim().slice(0, 60),
    item_type: ITEM_TYPES.includes(i?.item_type) ? i.item_type : 'other',
    basis: i?.basis === 'observed' ? 'observed' : 'general knowledge',
    confidence: ['high', 'medium', 'low'].includes(i?.confidence) ? i.confidence : 'low',
  })).filter((i) => i.title && i.why).slice(0, 8);
  return { notes: String(obj?.notes || '').trim().slice(0, 400), items };
}

export async function generateSuggestions({ rows, trading, profile }) {
  if ((await claudeStatus()).available) {
    try {
      const out = normalizeSuggestions(extractJson(await runClaude(buildSuggestPrompt({ rows, trading, profile }), { system: 'You output only valid JSON.' })));
      if (out.items.length) return { mode: 'claude', ...out };
    } catch (e) {
      log('trade-insights', `AI suggestion failed, using the simple method: ${e.message}`);
    }
  }
  const items = heuristicSuggestions(rows);
  return { mode: 'heuristic', notes: rows.length ? 'Ranked by how many people want to buy compared with how many offers exist.' : 'No trade posts have been collected yet, so these are general ideas.', items };
}

async function loadTradeLeads() {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const all = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb.from('leads').select('game,item_type,trade_side,budget_amount,is_suspicious')
      .eq('lead_kind', 'trade').gte('created_at', since).range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

export async function saveMarket(market) {
  await setSetting('trade_market', { generated_at: new Date().toISOString(), days: DAYS, ...market });
}

export async function refreshMarket() {
  const market = aggregateMarket(await loadTradeLeads());
  await saveMarket(market);
  return market;
}

export async function suggestTrading() {
  const market = await refreshMarket();
  const [trading, profile] = await Promise.all([getSetting('trading'), getSetting('profile')]);
  const out = await generateSuggestions({ rows: market.rows, trading, profile });
  await patchSetting('trading', { suggestions: { generated_at: new Date().toISOString(), ...out } });
  return { mode: out.mode, items: out.items.length, rows: market.rows.length };
}

export const jobs = { suggest_trading: suggestTrading };
export const tasks = [{
  name: 'trade-market', everyMs: 6 * 3600 * 1000, initialDelayMs: 60000,
  async run() {
    const trading = await getSetting('trading');
    if (!trading.enabled) return;
    const m = await refreshMarket();
    log('trade-market', `${m.rows.length} market rows from ${m.totals.trade_leads} posts`);
  },
}];
