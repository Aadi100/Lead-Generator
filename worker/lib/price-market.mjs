// Pure price-tracker logic (no I/O). Used by the worker and, via import, by the dashboard.
// Honest by design: fewer than MIN_SAMPLES usable prices means "not enough data", never an invented market.

export const MIN_SAMPLES = 3;
export const MAX_AGE_DAYS = 180;
export const FAIR_PCT = 10; // within +/-10% of the median is "fair"

// USD value of one unit of each currency. Rough defaults; the user can edit them (app_settings.price_rates).
/** @type {Record<string, number>} */
export const DEFAULT_RATES = { USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.73, AUD: 0.65, BRL: 0.18, TRY: 0.03, PHP: 0.017, INR: 0.012, IDR: 0.000062, RUB: 0.011, PLN: 0.25 };
export const KINDS = ['sold', 'asking', 'offer'];

const SYMBOLS = [['us$', 'USD'], ['usd', 'USD'], ['$', 'USD'], ['€', 'EUR'], ['eur', 'EUR'], ['£', 'GBP'], ['gbp', 'GBP'], ['cad', 'CAD'], ['aud', 'AUD'], ['brl', 'BRL'], ['r$', 'BRL'], ['try', 'TRY'], ['₺', 'TRY'], ['php', 'PHP'], ['₱', 'PHP'], ['inr', 'INR'], ['₹', 'INR'], ['idr', 'IDR'], ['rub', 'RUB'], ['₽', 'RUB'], ['pln', 'PLN']];

/** "eur", "EUR", "€" -> "EUR". Unknown or empty values become "USD" only when empty; unknown codes are kept upper-cased. */
export function normCurrency(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 'USD';
  const hit = SYMBOLS.find(([sym]) => sym === s);
  if (hit) return hit[1];
  return /^[a-z]{3}$/.test(s) ? s.toUpperCase() : 'USD';
}

/** Finds a currency in free text such as "$50", "50 eur", "£20". Defaults to USD. */
export function currencyFromText(text) {
  const t = String(text ?? '').toLowerCase();
  for (const [sym, code] of SYMBOLS) {
    if (sym.length === 3 && /^[a-z]+$/.test(sym)) { if (new RegExp(`\\b${sym}\\b`).test(t)) return code; }
    else if (t.includes(sym)) return code;
  }
  return 'USD';
}

export function mergeRates(custom) {
  const out = { ...DEFAULT_RATES };
  const src = custom && typeof custom === 'object' ? custom : {};
  for (const [k, v] of Object.entries(src)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[normCurrency(k)] = n;
  }
  return out;
}

/** USD estimate of `amount` in `currency`, or null when the amount is unusable or the currency has no rate. */
export function toUsd(amount, currency, rates = DEFAULT_RATES) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rate = rates[normCurrency(currency)];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(n * rate * 100) / 100;
}

const RANKS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'grandmaster', 'champion', 'immortal', 'ascendant', 'radiant', 'challenger', 'unreal', 'elite', 'legend', 'mythic', 'epic', 'unranked'];

/** Normalises a detail such as "Diamond 2", "10K v-bucks", "EU server" to a short comparable key. */
export function normalizeItemKey(text) {
  let s = String(text ?? '').toLowerCase().trim();
  if (!s) return '';
  s = s.replace(/(\d+(?:\.\d+)?)\s?k\b/g, (_, n) => String(Math.round(parseFloat(n) * 1000)));
  s = s.replace(/(\d+(?:\.\d+)?)\s?m\b/g, (_, n) => String(Math.round(parseFloat(n) * 1000000)));
  s = s.replace(/(\d),(\d{3})/g, '$1$2');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return s.slice(0, 40);
}

/** Best-effort detail from a post: a rank word or a number with a unit. Empty when nothing clear. */
export function itemKeyFromText(text) {
  const t = String(text ?? '').toLowerCase();
  const rank = RANKS.find((r) => new RegExp(`\\b${r}\\b`).test(t));
  if (rank) return rank;
  const amt = /(\d+(?:[.,]\d+)?\s?[kmb]?)\s?(v-?bucks|robux|gold|gp|coins|diamonds|gems|uc|vp|credits|primogems|crystals|level|lvl)\b/.exec(t);
  if (amt) return normalizeItemKey(`${amt[1]} ${amt[2].replace('-', '')}`);
  return '';
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const round2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

/** Drops extreme values (Tukey fences) once there are enough samples to tell. */
export function trimOutliers(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 5) return v;
  const q1 = percentile(v, 0.25);
  const q3 = percentile(v, 0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) {
    // most values identical: only drop values wildly away from the median
    const med = percentile(v, 0.5);
    return v.filter((x) => x <= med * 5 && x >= med / 5);
  }
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return v.filter((x) => x >= lo && x <= hi);
}

function summarise(values) {
  const v = trimOutliers(values);
  return {
    n: v.length,
    median: round2(percentile(v, 0.5)),
    p25: round2(percentile(v, 0.25)),
    p75: round2(percentile(v, 0.75)),
    min: v.length ? round2(v[0]) : null,
    max: v.length ? round2(v[v.length - 1]) : null,
  };
}

/**
 * Market statistics for one group.
 * points: [{game,item_type,item_key,price_usd,kind,captured_at,lead_id}]
 * target: {game, item_type, item_key?}   opts: {minSamples, now, maxAgeDays, excludeLeadId}
 * Sold prices are used first; asking/offer prices are only a fallback and always labelled as such.
 * If item_key is given and has enough samples it is used, otherwise the whole game+item type is.
 */
export function marketStats(points, target, opts = {}) {
  const min = opts.minSamples ?? MIN_SAMPLES;
  const now = opts.now ?? Date.now();
  const since = now - (opts.maxAgeDays ?? MAX_AGE_DAYS) * 86400000;
  const game = norm(target.game);
  const type = String(target.item_type || 'other');
  const key = normalizeItemKey(target.item_key);
  const pool = (points || []).filter((p) => {
    const usd = Number(p.price_usd);
    if (!Number.isFinite(usd) || usd <= 0) return false;
    if (norm(p.game) !== game || String(p.item_type || 'other') !== type) return false;
    if (opts.excludeLeadId && p.lead_id === opts.excludeLeadId) return false;
    const t = Date.parse(p.captured_at);
    return Number.isNaN(t) ? true : t >= since;
  });
  const none = (reason) => ({ enough: false, basis: null, scope: null, confidence: null, n: 0, n_sold: 0, n_asking: 0, median: null, p25: null, p75: null, min: null, max: null, reason });
  if (!game) return none('No game.');

  const split = (list) => ({
    sold: list.filter((p) => p.kind === 'sold').map((p) => Number(p.price_usd)),
    soft: list.filter((p) => p.kind === 'asking' || p.kind === 'offer').map((p) => Number(p.price_usd)),
  });
  const typeSplit = split(pool);
  const scopes = [];
  if (key) scopes.push(['item', split(pool.filter((p) => normalizeItemKey(p.item_key) === key))]);
  scopes.push(['type', typeSplit]);

  for (const [scope, s] of scopes) {
    if (s.sold.length >= min) {
      const sum = summarise(s.sold);
      if (sum.n >= min) return { enough: true, basis: 'sold', scope, confidence: sum.n >= 7 ? 'high' : 'medium', ...sum, n_sold: s.sold.length, n_asking: s.soft.length, reason: null };
    }
  }
  for (const [scope, s] of scopes) {
    if (s.soft.length >= min) {
      const sum = summarise(s.soft);
      if (sum.n >= min) return { enough: true, basis: 'asking', scope, confidence: 'low', ...sum, n_sold: s.sold.length, n_asking: s.soft.length, reason: null };
    }
  }
  const total = typeSplit.sold.length + typeSplit.soft.length;
  return { ...none(total === 0 ? 'No prices saved for this yet.' : `Only ${total} price${total === 1 ? '' : 's'} saved; at least ${min} are needed.`), n: total, n_sold: typeSplit.sold.length, n_asking: typeSplit.soft.length };
}

/** below / fair / above with the % difference from the median. Never guesses without stats.enough. */
export function verdict(price, stats, opts = {}) {
  const tol = opts.fairPct ?? FAIR_PCT;
  const p = Number(price);
  if (!stats || !stats.enough || !Number.isFinite(p) || p <= 0 || !stats.median) return { verdict: null, pct: null };
  const pct = Math.round(((p - stats.median) / stats.median) * 1000) / 10;
  return { verdict: Math.abs(pct) <= tol ? 'fair' : pct < 0 ? 'below' : 'above', pct };
}

/** One honest sentence: "18% below market, based on 7 sales". */
export function verdictText(v, stats) {
  if (!v || !v.verdict || !stats) return 'No market data yet';
  const what = stats.basis === 'sold' ? (stats.n === 1 ? 'sale' : 'sales') : stats.n === 1 ? 'asking price' : 'asking prices';
  const base = `based on ${stats.n} ${what}`;
  const abs = Math.abs(Math.round(v.pct));
  if (v.verdict === 'fair') return `About market price, ${base}`;
  return `${abs}% ${v.verdict} market, ${base}`;
}

// ---- turning leads, deals and stock into price points ------------------------------------------------------

/** An automatic price point from a trade lead (asking for sellers, offer for buyers, sold when the lead was Won). */
export function pointFromLead(lead, rates = DEFAULT_RATES) {
  if (!lead || lead.lead_kind !== 'trade' || !lead.game || lead.is_suspicious) return null;
  if (lead.trade_side !== 'seller' && lead.trade_side !== 'buyer') return null;
  const amount = Number(lead.budget_amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = currencyFromText(lead.budget);
  const usd = toUsd(amount, currency, rates);
  if (usd === null) return null;
  const won = lead.status === 'Won';
  return {
    game: lead.game, item_type: lead.item_type || 'other', item_key: itemKeyFromText(`${lead.title || ''}`),
    price: amount, currency, price_usd: usd,
    kind: won ? 'sold' : lead.trade_side === 'seller' ? 'asking' : 'offer',
    source: lead.source_detail || lead.source || null, origin: 'lead', ref_key: won ? `lead-won:${lead.id}` : `lead-ask:${lead.id}`,
    lead_id: lead.id, captured_at: lead.posted_at || lead.created_at || new Date().toISOString(), note: null,
  };
}

const WON_STAGES = ['agreed', 'paid', 'delivered', 'done'];
/** A sold price point from a finished trade deal when it has a value. */
export function pointFromDeal(deal, rates = DEFAULT_RATES) {
  if (!deal || deal.kind !== 'trade' || !WON_STAGES.includes(deal.stage) || !deal.game) return null;
  const value = Number(deal.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const currency = normCurrency(deal.currency);
  const usd = toUsd(value, currency, rates);
  if (usd === null) return null;
  return {
    game: deal.game, item_type: deal.item_type || 'other', item_key: itemKeyFromText(deal.title || ''),
    price: value, currency, price_usd: usd, kind: 'sold', source: deal.platform || null, origin: 'deal', ref_key: `deal:${deal.id}`,
    lead_id: deal.lead_id || null, captured_at: deal.closed_at || deal.updated_at || deal.created_at || new Date().toISOString(), note: null,
  };
}

/** The sold price point for a stock item that was sold (per unit). */
export function pointFromStock(item, rates = DEFAULT_RATES) {
  if (!item || !item.game || !(Number(item.sold_price) > 0)) return null;
  const currency = normCurrency(item.currency);
  const usd = toUsd(item.sold_price, currency, rates);
  if (usd === null) return null;
  return {
    game: item.game, item_type: item.item_type || 'other', item_key: itemKeyFromText(item.title || ''),
    price: Number(item.sold_price), currency, price_usd: usd, kind: 'sold', source: Array.isArray(item.listed_on) && item.listed_on[0] ? item.listed_on[0] : null,
    origin: 'stock', ref_key: `stock:${item.id}`, lead_id: item.buyer_lead_id || null, stock_item_id: item.id, captured_at: item.sold_at || new Date().toISOString(), note: item.title || null,
  };
}

/** Cached verdict for one lead against the grouped points. Returns the columns to store. */
export function leadVerdict(lead, points, rates = DEFAULT_RATES, now = Date.now()) {
  const empty = { price_verdict: null, price_pct: null, market_median: null, market_samples: null, market_basis: null };
  if (!lead || !lead.game) return empty;
  const amount = Number(lead.budget_amount);
  if (!Number.isFinite(amount) || amount <= 0) return empty;
  const usd = toUsd(amount, currencyFromText(lead.budget), rates);
  if (usd === null) return empty;
  const stats = marketStats(points, { game: lead.game, item_type: lead.item_type || 'other', item_key: itemKeyFromText(lead.title || '') }, { excludeLeadId: lead.id, now });
  const v = verdict(usd, stats);
  if (!v.verdict) return empty;
  return { price_verdict: v.verdict, price_pct: v.pct, market_median: stats.median, market_samples: stats.n, market_basis: stats.basis };
}

/** Weekly median of sold prices (USD), for the chart. Returns [{week:'YYYY-MM-DD', median, n}] oldest first. */
export function weeklySeries(points, { game, item_type, kinds = ['sold'], weeks = 26, now = Date.now() } = {}) {
  const g = norm(game);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
  const buckets = new Map();
  for (const p of points || []) {
    if (!kinds.includes(p.kind)) continue;
    if (g && norm(p.game) !== g) continue;
    if (item_type && p.item_type !== item_type) continue;
    const t = Date.parse(p.captured_at);
    const usd = Number(p.price_usd);
    if (Number.isNaN(t) || !(usd > 0) || t < start.getTime()) continue;
    const idx = Math.floor((t - start.getTime()) / (7 * 86400000));
    if (idx >= weeks) continue;
    (buckets.get(idx) || buckets.set(idx, []).get(idx)).push(usd);
  }
  const out = [];
  for (const [idx, vals] of [...buckets].sort((a, b) => a[0] - b[0])) {
    const d = new Date(start.getTime() + idx * 7 * 86400000);
    out.push({ week: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, median: round2(percentile(vals.sort((a, b) => a - b), 0.5)), n: vals.length });
  }
  return out;
}
