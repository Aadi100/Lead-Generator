// Pure: which stock items can serve a buyer lead. Only in_stock items with quantity > 0 count.
import { buildGameIndex, sameGame } from './trade-games.mjs';
import { toUsd, normCurrency, currencyFromText, DEFAULT_RATES } from './price-market.mjs';

const lower = (v) => String(v || '').toLowerCase();
const normItem = (v) => lower(v).replace(/[^a-z]/g, '');
const numOrNull = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const STOP = new Set(['the', 'and', 'for', 'with', 'account', 'accounts', 'selling', 'sale', 'buy', 'buying', 'wtb', 'wts', 'need', 'want']);

export const isAvailable = (s) => !!s && s.status === 'in_stock' && Number(s.quantity) > 0;

/**
 * Matches a buyer lead against stock.
 * Returns [{ item, ask_usd, budget_usd, fits, diff_pct, score }] best first, [] when nothing in stock fits.
 * fits: the ask is at or under the buyer's budget (or either price is unknown).
 */
export function matchStock(lead, stockItems, { rates = DEFAULT_RATES, gameIndex } = {}) {
  if (!lead || lead.trade_side !== 'buyer') return [];
  const index = gameIndex || buildGameIndex([lead.game, ...(stockItems || []).map((s) => s.game)]);
  const text = lower(`${lead.title} ${lead.description}`);
  const budget = numOrNull(lead.budget_amount);
  const budgetUsd = budget === null ? null : toUsd(budget, currencyFromText(lead.budget), rates);
  const out = [];
  for (const item of stockItems || []) {
    if (!isAvailable(item)) continue;
    if (!lead.game || !sameGame(item.game, lead.game, index)) continue;
    if (item.item_type && lead.item_type && item.item_type !== 'other' && normItem(item.item_type) !== normItem(lead.item_type)) continue;
    const ask = numOrNull(item.ask_price);
    const askUsd = ask === null ? null : toUsd(ask, normCurrency(item.currency), rates);
    const words = lower(item.title).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    const hits = words.filter((w) => text.includes(w)).length;
    const fits = askUsd === null || budgetUsd === null || askUsd <= budgetUsd * 1.1;
    const diff = askUsd !== null && budgetUsd !== null && budgetUsd > 0 ? Math.round(((askUsd - budgetUsd) / budgetUsd) * 100) : null;
    out.push({ item, ask_usd: askUsd, budget_usd: budgetUsd, fits, diff_pct: diff, score: (fits ? 10 : 0) + Math.min(hits, 4) * 2 + (item.item_type === lead.item_type ? 1 : 0) });
  }
  return out.sort((a, b) => b.score - a.score || (a.ask_usd ?? Infinity) - (b.ask_usd ?? Infinity));
}
