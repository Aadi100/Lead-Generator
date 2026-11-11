// Pure helpers for the stock page.
import { toUsd } from '../../worker/lib/price-market.mjs';
import type { StockItem } from './types-stock';

export type Rates = Record<string, number>;

/** "$1,250", "EUR 40", "-". Prices are kept in their own currency and shown that way. */
export function fmtMoney(n: number | null | undefined, currency = 'USD'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2, minimumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

export type StockSummary = { inStock: number; reserved: number; askValueUsd: number; unpriced: number; profitMonthUsd: number; soldMonth: number; profitKnown: number };

const startOfMonth = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

/** Counts are in units. Ask value only counts in-stock items with an ask price; profit only counts sold rows that have a cost. */
export function summarizeStock(items: StockItem[], rates: Rates, now = Date.now()): StockSummary {
  const s: StockSummary = { inStock: 0, reserved: 0, askValueUsd: 0, unpriced: 0, profitMonthUsd: 0, soldMonth: 0, profitKnown: 0 };
  const from = startOfMonth(now);
  for (const i of items) {
    if (i.status === 'in_stock') {
      s.inStock += i.quantity;
      const usd = i.ask_price === null ? null : toUsd(i.ask_price, i.currency, rates);
      if (usd === null) s.unpriced += 1;
      else s.askValueUsd += usd * i.quantity;
    } else if (i.status === 'reserved') s.reserved += i.quantity;
    else if (i.status === 'sold' && i.sold_at && Date.parse(i.sold_at) >= from) {
      s.soldMonth += i.quantity;
      if (i.sold_price !== null && i.cost !== null) {
        const sold = toUsd(i.sold_price, i.currency, rates);
        const cost = toUsd(i.cost, i.currency, rates);
        if (sold !== null && cost !== null) {
          s.profitMonthUsd += (sold - cost) * i.quantity;
          s.profitKnown += 1;
        }
      }
    }
  }
  return s;
}

/** Profit of one sold row in its own currency (per unit price x quantity), or null when the cost is unknown. */
export function rowProfit(i: StockItem): number | null {
  if (i.status !== 'sold' || i.sold_price === null || i.cost === null) return null;
  return Math.round((i.sold_price - i.cost) * i.quantity * 100) / 100;
}
