import { buildGameIndex, sameGame } from './trade-games.mjs';

const lower = (v) => String(v || '').toLowerCase();
const arr = (v) => (Array.isArray(v) ? v : []);
const normItem = (v) => lower(v).replace(/[^a-z]/g, '');
const numOrNull = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Which of the user's entries does this trade lead satisfy? buyer leads match "what I sell", seller leads match "what I want".
export function matchTrade(lead, trading = {}, gameIndex) {
  if (!lead || (lead.trade_side !== 'buyer' && lead.trade_side !== 'seller')) return null;
  const entries = arr(lead.trade_side === 'buyer' ? trading.i_sell : trading.i_want);
  if (!entries.length) return null;
  const index = gameIndex || buildGameIndex(entries.map((e) => e.game));
  const text = lower(`${lead.title} ${lead.description}`);
  const amount = numOrNull(lead.budget_amount);
  let best = null;
  for (const entry of entries) {
    const keywords = arr(entry.keywords).map(lower).filter(Boolean);
    const hasGame = !!String(entry.game || '').trim();
    if (!hasGame && !keywords.length) continue;
    if (hasGame && !sameGame(entry.game, lead.game, index)) continue;
    if (entry.item_type && normItem(entry.item_type) !== normItem(lead.item_type)) continue;
    const keywordHit = keywords.some((k) => text.includes(k));
    if (keywords.length && !keywordHit) continue;
    const price = numOrNull(entry.price);
    if (lead.trade_side === 'seller' && price !== null && amount !== null && amount > price) continue;
    if (lead.trade_side === 'buyer' && price !== null && amount !== null && amount < price * 0.7) continue;
    const specificity = (hasGame ? 1 : 0) + (entry.item_type ? 1 : 0) + (keywordHit ? 2 : 0);
    if (!best || specificity > best.specificity) best = { entry, specificity };
  }
  if (!best) return null;
  const name = String(best.entry.label || '').trim() || [best.entry.game, best.entry.item_type].filter(Boolean).join(' ') || 'item';
  return { entry: best.entry, label: lead.trade_side === 'buyer' ? `Buyer for your ${name}` : `Seller for your wish: ${name}` };
}

export function tradingHash(trading = {}) {
  const pick = (e) => [e.game, e.item_type, arr(e.keywords).join(','), e.price, e.label].join('|');
  return [arr(trading.i_sell).map(pick).join(';'), arr(trading.i_want).map(pick).join(';'), arr(trading.games).join(',')].join('#');
}
