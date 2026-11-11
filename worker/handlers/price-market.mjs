import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting, setSetting } from '../lib/settings.mjs';
import { mergeRates, pointFromLead, pointFromDeal, leadVerdict } from '../lib/price-market.mjs';
import { matchTrade } from '../lib/trade-match.mjs';
import { loadStockForMatch } from '../lib/stock-db.mjs';
import { gameIndexFor } from '../lib/trade-feed.mjs';

const DAYS = 90;
const POINT_DAYS = 180;
const LEAD_COLS = 'id,title,description,budget,budget_amount,source,source_detail,game,item_type,trade_side,status,is_suspicious,lead_kind,posted_at,created_at,trade_match,price_verdict,price_pct,market_median,market_samples,market_basis,price_checked_at';
const nowIso = () => new Date().toISOString();
let busy = false;

async function pageAll(build, size = 1000) {
  const out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}

const ratesFrom = async () => mergeRates((await getSetting('price_rates')).rates);

// Saves prices that appear on their own: asking prices on trade leads, and sold prices from won leads and finished deals.
async function ingest(leads, rates) {
  const deals = await pageAll(() => sb.from('deals').select('id,lead_id,kind,stage,title,game,item_type,platform,value,currency,closed_at,updated_at,created_at').eq('kind', 'trade').in('stage', ['agreed', 'paid', 'delivered', 'done']).order('created_at'));
  const dealPoints = deals.map((d) => pointFromDeal(d, rates)).filter(Boolean);
  const dealLeadIds = new Set(dealPoints.map((p) => p.lead_id).filter(Boolean));
  const leadPoints = [];
  const dropAsk = [];
  for (const l of leads) {
    const p = pointFromLead(l, rates);
    if (!p) continue;
    if (p.kind === 'sold') {
      dropAsk.push(`lead-ask:${l.id}`);
      if (dealLeadIds.has(l.id)) continue; // the deal already recorded the real price
    }
    leadPoints.push(p);
  }
  const rows = [...dealPoints, ...leadPoints];
  let saved = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await sb.from('price_points').upsert(rows.slice(i, i + 200), { onConflict: 'ref_key', ignoreDuplicates: true }).select('id');
    if (error) throw new Error(`price points: ${error.message}`);
    saved += (data || []).length;
  }
  for (let i = 0; i < dropAsk.length; i += 100) await sb.from('price_points').delete().in('ref_key', dropAsk.slice(i, i + 100));
  return saved;
}

const same = (a, b) => (a ?? null) === (b ?? null);

export async function recomputePriceMarket() {
  if (busy) return { skipped: 'already running' };
  busy = true;
  try {
    const rates = await ratesFrom();
    const since = new Date(Date.now() - DAYS * 86400000).toISOString();
    const leads = await pageAll(() => sb.from('leads').select(LEAD_COLS).eq('lead_kind', 'trade').gte('created_at', since).order('created_at', { ascending: false }));
    const added = await ingest(leads, rates);
    const pointSince = new Date(Date.now() - POINT_DAYS * 86400000).toISOString();
    const points = await pageAll(() => sb.from('price_points').select('game,item_type,item_key,price_usd,kind,captured_at,lead_id').gte('captured_at', pointSince).order('captured_at'));

    const [trading, stock] = await Promise.all([getSetting('trading'), loadStockForMatch(0)]);
    const gameIndex = gameIndexFor(trading);
    let verdicts = 0;
    let matched = 0;
    const stamp = nowIso();
    const todo = [];
    for (const l of leads) {
      const v = leadVerdict(l, points, rates);
      const patch = {};
      if (!same(v.price_verdict, l.price_verdict) || !same(v.price_pct, l.price_pct) || !same(v.market_median !== null ? Number(v.market_median) : null, l.market_median !== null ? Number(l.market_median) : null)
        || !same(v.market_samples, l.market_samples) || !same(v.market_basis, l.market_basis)) Object.assign(patch, v);
      if (Object.keys(patch).length) verdicts++;
      if (!l.price_checked_at || Object.keys(patch).length) patch.price_checked_at = stamp;
      // Buyer matches follow stock: only in-stock items count while stock rows exist, otherwise the catalog applies.
      if (l.trade_side === 'buyer') {
        const label = matchTrade(l, trading, gameIndex, stock)?.label ?? null;
        const stockLabelNow = (l.trade_match || '').startsWith('Buyer for your stock:');
        if (!same(label, l.trade_match) && (stock.any || stockLabelNow)) { patch.trade_match = label; matched++; }
      }
      if (Object.keys(patch).length) todo.push([l.id, patch]);
    }
    for (let i = 0; i < todo.length; i += 10) {
      await Promise.all(todo.slice(i, i + 10).map(([id, patch]) => sb.from('leads').update(patch).eq('id', id)));
    }
    const result = { points: points.length, added, leads: leads.length, verdicts, buyer_matches_updated: matched };
    await setSetting('price_market_state', { last_run: nowIso(), last_result: result });
    log('price-market', `${points.length} points (+${added}), ${verdicts} verdicts changed, ${matched} buyer matches updated`);
    return result;
  } finally {
    busy = false;
  }
}

export const jobs = {
  recompute_price_market: () => recomputePriceMarket(),
};

async function latest(table, col) {
  const { data, error } = await sb.from(table).select(col).order(col, { ascending: false }).limit(1);
  return error ? null : data?.[0]?.[col] ?? null;
}

export const tasks = [
  {
    name: 'price-market', everyMs: 5 * 60 * 1000, initialDelayMs: 50000,
    async run() {
      const state = await getSetting('price_market_state');
      const last = state.last_run ? Date.parse(state.last_run) : 0;
      let due = !last || Date.now() - last > 60 * 60 * 1000;
      if (!due) {
        const [p, s] = await Promise.all([latest('price_points', 'updated_at'), latest('stock_items', 'updated_at')]);
        due = [p, s].some((t) => t && Date.parse(t) > last);
      }
      if (!due) {
        const { count } = await sb.from('leads').select('id', { count: 'exact', head: true }).eq('lead_kind', 'trade').is('price_checked_at', null);
        due = (count || 0) > 0;
      }
      if (due) await recomputePriceMarket();
    },
  },
];
