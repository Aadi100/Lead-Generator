// Pure helpers for the Game Trading module: aggregates, weekly price medians, catalog matching, price comparison.
import type { Lead, TradeEntry, TradeMarketRow, TradingSettings } from './types';

export const DAY_MS = 86_400_000;

export const leadTime = (l: Lead): number => {
  const t = Date.parse(l.posted_at ?? l.created_at);
  return Number.isNaN(t) ? Date.parse(l.created_at) || 0 : t;
};

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  return `$${abs >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(abs >= 10 ? 0 : 2).replace(/\.00$/, '')}`;
}

export const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

/** Demand (buyer posts) and supply (seller posts) per game and item type over the last `days` days. */
export function aggregateMarket(leads: Lead[], days = 30, now = Date.now()): TradeMarketRow[] {
  const since = now - days * DAY_MS;
  const map = new Map<string, { game: string; item_type: string; wanted: number; offered: number; prices: number[] }>();
  for (const l of leads) {
    if (!l.trade_side || !l.game || leadTime(l) < since) continue;
    const item = l.item_type ?? 'other';
    const key = `${norm(l.game)}|${item}`;
    let r = map.get(key);
    if (!r) {
      r = { game: l.game, item_type: item, wanted: 0, offered: 0, prices: [] };
      map.set(key, r);
    }
    if (l.trade_side === 'buyer') r.wanted += 1;
    else r.offered += 1;
    if (l.budget_amount !== null && l.budget_amount > 0) r.prices.push(l.budget_amount);
  }
  return Array.from(map.values()).map((r) => ({
    game: r.game,
    item_type: r.item_type,
    wanted: r.wanted,
    offered: r.offered,
    median_price: median(r.prices),
    ratio: r.wanted / Math.max(r.offered, 1),
  }));
}

export type HotRow = TradeMarketRow & { newBuyers7d: number };

/** Market rows (computed live from leads, else the stored ones) with this week's buyer count added. */
export function hotDemand(stored: TradeMarketRow[], leads: Lead[], now = Date.now()): { rows: HotRow[]; source: 'live' | 'stored' } {
  const live = aggregateMarket(leads, 30, now);
  const base = live.length > 0 ? live : stored;
  const week = now - 7 * DAY_MS;
  const fresh = new Map<string, number>();
  for (const l of leads) {
    if (l.trade_side === 'buyer' && l.game && leadTime(l) >= week) {
      const k = `${norm(l.game)}|${l.item_type ?? 'other'}`;
      fresh.set(k, (fresh.get(k) ?? 0) + 1);
    }
  }
  const score = (r: TradeMarketRow) => (r.ratio ?? 0) * Math.log2(2 + r.wanted);
  const rows = base.map((r) => ({ ...r, newBuyers7d: fresh.get(`${norm(r.game)}|${r.item_type}`) ?? 0 })).sort((a, b) => score(b) - score(a));
  return { rows, source: live.length > 0 ? 'live' : 'stored' };
}

export type WeeklySeries = { game: string; values: (number | null)[]; posts: number };
export type WeeklyTrend = { weeks: string[]; series: WeeklySeries[] };

function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** Weekly median price per game for the games with the most priced posts (last `days` days). */
export function weeklyTrend(leads: Lead[], days = 90, top = 4, now = Date.now()): WeeklyTrend {
  const since = now - days * DAY_MS;
  const start = weekStart(since);
  const weeks: number[] = [];
  for (let w = start; w <= now; w += 7 * DAY_MS) weeks.push(w);
  const byGame = new Map<string, { name: string; perWeek: number[][]; posts: number }>();
  for (const l of leads) {
    if (!l.game || l.budget_amount === null || l.budget_amount <= 0) continue;
    const t = leadTime(l);
    if (t < since) continue;
    const idx = Math.floor((weekStart(t) - start) / (7 * DAY_MS) + 0.01);
    if (idx < 0 || idx >= weeks.length) continue;
    const k = norm(l.game);
    let g = byGame.get(k);
    if (!g) {
      g = { name: l.game, perWeek: weeks.map(() => []), posts: 0 };
      byGame.set(k, g);
    }
    g.perWeek[idx].push(l.budget_amount);
    g.posts += 1;
  }
  const series = Array.from(byGame.values())
    .sort((a, b) => b.posts - a.posts)
    .slice(0, top)
    .map((g) => ({ game: g.name, posts: g.posts, values: g.perWeek.map((p) => (p.length >= 1 ? median(p) : null)) }));
  return { weeks: weeks.map((w) => new Date(w).toISOString().slice(0, 10)), series };
}

// ---- catalog matching -------------------------------------------------------------------------------------------

export const buyerLabel = (entryLabel: string) => `Buyer for your ${entryLabel}`;
export const sellerLabel = (entryLabel: string) => `Seller for your wish: ${entryLabel}`;

/** The catalog entry the worker matched this lead to (by its trade_match label, else by game and item type). */
export function entryForLead(lead: Lead, trading: TradingSettings): TradeEntry | null {
  const list = lead.trade_side === 'seller' ? trading.i_want : lead.trade_side === 'buyer' ? trading.i_sell : [];
  const tm = norm(lead.trade_match);
  if (tm) {
    const hit = list.find((e) => e.label.trim() && (tm === norm(buyerLabel(e.label)) || tm === norm(sellerLabel(e.label)) || tm.endsWith(norm(e.label))));
    if (hit) return hit;
  }
  return list.find((e) => norm(e.game) && norm(e.game) === norm(lead.game) && (!e.item_type || e.item_type === lead.item_type)) ?? null;
}

/** How many leads the worker matched to an entry; "open" = still New. */
export function entryCounts(entry: TradeEntry, kind: 'sell' | 'want', leads: Lead[]): { matched: number; open: number } {
  const label = kind === 'sell' ? norm(buyerLabel(entry.label)) : norm(sellerLabel(entry.label));
  let matched = 0;
  let open = 0;
  for (const l of leads) {
    if (!l.trade_match || norm(l.trade_match) !== label) continue;
    matched += 1;
    if (l.status === 'New') open += 1;
  }
  return { matched, open };
}

export function marketMedian(rows: TradeMarketRow[], game: string | null, itemType: string | null): number | null {
  if (!game) return null;
  const hit = rows.find((r) => norm(r.game) === norm(game) && r.item_type === (itemType ?? 'other'));
  return hit?.median_price ?? null;
}

export type PriceNote = { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' };

/** "18% under your limit" for a seller's ask against the highest price the user will pay. */
export function priceVsLimit(price: number | null, entry: TradeEntry | null): PriceNote | null {
  if (price === null || price <= 0 || !entry) return null;
  if (entry.price === null || entry.price <= 0) return { text: 'You have not set a price limit for this wish.', tone: 'neutral' };
  const diff = ((entry.price - price) / entry.price) * 100;
  const r = Math.abs(Math.round(diff));
  if (r === 0) return { text: `Right at your limit of ${money(entry.price)}`, tone: 'warning' };
  return diff > 0
    ? { text: `${r}% under your limit of ${money(entry.price)}`, tone: 'success' }
    : { text: `${r}% over your limit of ${money(entry.price)}`, tone: 'danger' };
}

export function priceVsMarket(price: number | null, med: number | null): PriceNote | null {
  if (price === null || price <= 0 || med === null || med <= 0) return null;
  const diff = ((price - med) / med) * 100;
  const r = Math.abs(Math.round(diff));
  if (r < 3) return { text: `About the usual price (${money(med)})`, tone: 'neutral' };
  return diff < 0
    ? { text: `${r}% cheaper than the usual ${money(med)}`, tone: 'success' }
    : { text: `${r}% above the usual ${money(med)}`, tone: 'warning' };
}

const SCAM_WORDS = /stolen|hacked|cracked|too good to be true|pay first|no middleman|no refund|crypto|gift card|telegram|whatsapp|scam/i;
export const isScamFlag = (f: string): boolean => SCAM_WORDS.test(f);

export const COMMON_GAMES = [
  'Fortnite', 'Valorant', 'League of Legends', 'CS2', 'Genshin Impact', 'Honkai Star Rail', 'Roblox', 'Minecraft', 'GTA Online',
  'Rocket League', 'Apex Legends', 'Call of Duty', 'EA FC (FIFA)', 'Clash of Clans', 'Clash Royale', 'Brawl Stars', 'Mobile Legends',
  'PUBG Mobile', 'Free Fire', 'Diablo', 'World of Warcraft', 'RuneScape', 'Rainbow Six Siege', 'Overwatch', 'Destiny 2', 'Pokemon Go',
  'Dota 2', 'Steam', 'Epic Games',
];

export function newEntryId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    // simple id below
  }
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankEntry(partial?: Partial<TradeEntry>): TradeEntry {
  return { id: newEntryId(), label: '', game: '', item_type: 'account', keywords: [], price: null, ...partial };
}
