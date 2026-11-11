// Types and row normalisers for the price tracker and stock manager (schema-v8).
import { mergeRates, normCurrency } from '../../worker/lib/price-market.mjs';

export const STOCK_STATUSES = ['in_stock', 'reserved', 'sold', 'archived'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];
export const STOCK_STATUS_LABEL: Record<StockStatus, string> = { in_stock: 'In stock', reserved: 'Reserved', sold: 'Sold', archived: 'Archived' };

export const PRICE_KINDS = ['sold', 'asking', 'offer'] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];
export const PRICE_KIND_LABEL: Record<PriceKind, string> = { sold: 'Sold', asking: 'Asking', offer: 'Buyer offer' };

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BRL', 'TRY', 'PHP', 'INR', 'IDR', 'RUB', 'PLN'];
export const PLATFORMS = ['Discord', 'Reddit', 'Eldorado', 'G2G', 'PlayerAuctions', 'U7Buy', 'Z2U', 'Facebook', 'Telegram', 'Direct'];

export type StockItem = {
  id: string;
  game: string;
  item_type: string;
  title: string;
  description: string | null;
  quantity: number;
  ask_price: number | null;
  currency: string;
  cost: number | null;
  status: StockStatus;
  listed_on: string[];
  notes: string | null;
  sold_price: number | null;
  sold_at: string | null;
  buyer_lead_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PricePoint = {
  id: string;
  game: string;
  item_type: string;
  item_key: string;
  price: number;
  currency: string;
  price_usd: number | null;
  kind: PriceKind;
  source: string | null;
  origin: 'manual' | 'stock' | 'deal' | 'lead';
  lead_id: string | null;
  stock_item_id: string | null;
  captured_at: string;
  note: string | null;
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

export function normalizeStock(raw: Record<string, unknown>): StockItem {
  const status = STOCK_STATUSES.includes(raw.status as StockStatus) ? (raw.status as StockStatus) : 'in_stock';
  return {
    id: String(raw.id ?? ''),
    game: String(raw.game ?? ''),
    item_type: String(raw.item_type ?? 'other'),
    title: String(raw.title ?? ''),
    description: str(raw.description),
    quantity: Math.max(0, Math.round(num(raw.quantity) ?? 1)),
    ask_price: num(raw.ask_price),
    currency: normCurrency(raw.currency),
    cost: num(raw.cost),
    status,
    listed_on: Array.isArray(raw.listed_on) ? raw.listed_on.filter((x): x is string => typeof x === 'string') : [],
    notes: str(raw.notes),
    sold_price: num(raw.sold_price),
    sold_at: str(raw.sold_at),
    buyer_lead_id: str(raw.buyer_lead_id),
    created_at: String(raw.created_at ?? new Date().toISOString()),
    updated_at: String(raw.updated_at ?? new Date().toISOString()),
  };
}

export function normalizePoint(raw: Record<string, unknown>): PricePoint {
  const kind = PRICE_KINDS.includes(raw.kind as PriceKind) ? (raw.kind as PriceKind) : 'sold';
  const origin = raw.origin === 'stock' || raw.origin === 'deal' || raw.origin === 'lead' ? raw.origin : 'manual';
  return {
    id: String(raw.id ?? ''),
    game: String(raw.game ?? ''),
    item_type: String(raw.item_type ?? 'other'),
    item_key: String(raw.item_key ?? ''),
    price: num(raw.price) ?? 0,
    currency: normCurrency(raw.currency),
    price_usd: num(raw.price_usd),
    kind,
    source: str(raw.source),
    origin,
    lead_id: str(raw.lead_id),
    stock_item_id: str(raw.stock_item_id),
    captured_at: String(raw.captured_at ?? new Date().toISOString()),
    note: str(raw.note),
  };
}

export { mergeRates };
