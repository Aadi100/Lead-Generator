import { sb } from './db.mjs';
import { getSetting } from './settings.mjs';
import { mergeRates } from './price-market.mjs';

let cache = null;

// Stock as the matcher wants it: {any, items (in_stock only), rates}. any=false means "no stock rows yet", so the catalog is used.
export async function loadStockForMatch(maxAgeMs = 15000) {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.value;
  const [{ data, error }, ratesSetting] = await Promise.all([
    sb.from('stock_items').select('id,game,item_type,title,quantity,ask_price,currency,status').neq('status', 'archived').limit(2000),
    getSetting('price_rates'),
  ]);
  // Before schema-v8 is applied the table does not exist: behave as "no stock".
  const rows = error ? [] : data || [];
  const value = { any: rows.length > 0, items: rows.filter((r) => r.status === 'in_stock' && Number(r.quantity) > 0), rates: mergeRates(ratesSetting.rates) };
  cache = { at: Date.now(), value };
  return value;
}
