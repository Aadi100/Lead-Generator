"use client";

// Data hooks and write actions for the stock manager and the price tracker.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { mergeRates, normalizeItemKey, pointFromStock, toUsd } from '../../worker/lib/price-market.mjs';
import { normalizePoint, normalizeStock, type PricePoint, type StockItem } from './types-stock';
import type { Rates } from './stock-stats';

/** Subscribes to one table and reloads (debounced) whenever it changes. */
function useLiveTable<T>(table: string, query: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, map: (r: Record<string, unknown>) => T) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  const mapRef = useRef(map);
  mapRef.current = map;

  const load = useCallback(async () => {
    const { data, error: err } = await queryRef.current();
    if (err) setError(err.message);
    else {
      setError(null);
      setRows(((data ?? []) as Record<string, unknown>[]).map((r) => mapRef.current(r)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`${table}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void load(), 400);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [load, table]);

  return { rows, loading, error, reload: load };
}

export function useStock() {
  const r = useLiveTable<StockItem>('stock_items', () => supabase.from('stock_items').select('*').order('created_at', { ascending: false }).limit(2000), normalizeStock);
  return { items: r.rows, loading: r.loading, error: r.error, reload: r.reload };
}

export function usePricePoints() {
  const r = useLiveTable<PricePoint>(
    'price_points',
    () => supabase.from('price_points').select('*').gte('captured_at', new Date(Date.now() - 365 * 86_400_000).toISOString()).order('captured_at', { ascending: false }).limit(5000),
    normalizePoint,
  );
  return { points: r.rows, loading: r.loading, error: r.error, reload: r.reload };
}

/** The editable USD rate table (app_settings.price_rates) merged over the built-in defaults. */
export function usePriceRates() {
  const [custom, setCustom] = useState<Record<string, number>>({});
  const reload = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'price_rates').maybeSingle();
    const v = (data?.value ?? {}) as { rates?: Record<string, number> };
    setCustom(v.rates ?? {});
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const rates = useMemo(() => mergeRates(custom) as Rates, [custom]);
  return { rates, custom, reload };
}

export async function saveRates(rates: Record<string, number>): Promise<string | null> {
  const { error } = await supabase.from('app_settings').upsert({ key: 'price_rates', value: { rates, updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() });
  return error?.message ?? null;
}

// ---- stock writes -------------------------------------------------------------------------------------------

export type StockDraft = Omit<StockItem, 'id' | 'created_at' | 'updated_at' | 'sold_price' | 'sold_at' | 'buyer_lead_id'> & Partial<Pick<StockItem, 'sold_price' | 'sold_at' | 'buyer_lead_id'>>;

export async function saveStock(id: string | null, draft: StockDraft): Promise<string | null> {
  const row = { ...draft, updated_at: new Date().toISOString() };
  const { error } = id ? await supabase.from('stock_items').update(row).eq('id', id) : await supabase.from('stock_items').insert(row);
  return error?.message ?? null;
}

export async function deleteStock(id: string): Promise<string | null> {
  const { error } = await supabase.from('stock_items').delete().eq('id', id);
  return error?.message ?? null;
}

export async function setStockStatus(item: StockItem, status: 'in_stock' | 'archived'): Promise<string | null> {
  const { error } = await supabase.from('stock_items').update({ status, buyer_lead_id: null, updated_at: new Date().toISOString() }).eq('id', item.id);
  return error?.message ?? null;
}

/** Holds an item for a buyer lead. The whole item is reserved. */
export async function reserveStock(item: StockItem, leadId: string): Promise<string | null> {
  const a = await supabase.from('stock_items').update({ status: 'reserved', buyer_lead_id: leadId, updated_at: new Date().toISOString() }).eq('id', item.id);
  if (a.error) return a.error.message;
  const b = await supabase.from('leads').update({ stock_item_id: item.id }).eq('id', leadId);
  return b.error?.message ?? null;
}

export async function releaseStock(item: StockItem): Promise<string | null> {
  const a = await supabase.from('stock_items').update({ status: 'in_stock', buyer_lead_id: null, updated_at: new Date().toISOString() }).eq('id', item.id);
  if (a.error) return a.error.message;
  if (item.buyer_lead_id) await supabase.from('leads').update({ stock_item_id: null }).eq('id', item.buyer_lead_id);
  return null;
}

export type SellInput = { price: number; quantity: number; soldAt?: string; buyerLeadId?: string | null };

/**
 * Marks units as sold. Selling fewer units than held splits the row: the sold units become a new sold row.
 * Records a sold price point (per unit, with a USD estimate) and, when a buyer lead is linked, sets that lead to Won.
 */
export async function sellStock(item: StockItem, input: SellInput, rates: Rates): Promise<{ error: string | null; leadClosed: boolean }> {
  const soldAt = input.soldAt ?? new Date().toISOString();
  const qty = Math.max(1, Math.min(item.quantity, Math.round(input.quantity)));
  const buyer = input.buyerLeadId ?? item.buyer_lead_id ?? null;
  const base = { status: 'sold' as const, sold_price: input.price, sold_at: soldAt, buyer_lead_id: buyer, updated_at: new Date().toISOString() };
  let soldRow: StockItem = { ...item, ...base, quantity: qty };

  if (qty < item.quantity) {
    const rest = await supabase.from('stock_items').update({ quantity: item.quantity - qty, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (rest.error) return { error: rest.error.message, leadClosed: false };
    const { id: _drop, created_at: _c, updated_at: _u, ...copy } = item; // eslint-disable-line @typescript-eslint/no-unused-vars
    const ins = await supabase.from('stock_items').insert({ ...copy, ...base, quantity: qty }).select('*').single();
    if (ins.error || !ins.data) return { error: ins.error?.message ?? 'Could not record the sale.', leadClosed: false };
    soldRow = normalizeStock(ins.data as Record<string, unknown>);
  } else {
    const upd = await supabase.from('stock_items').update({ ...base, quantity: qty }).eq('id', item.id);
    if (upd.error) return { error: upd.error.message, leadClosed: false };
  }

  const point = pointFromStock(soldRow, rates);
  if (point) await supabase.from('price_points').upsert(point, { onConflict: 'ref_key' });

  let leadClosed = false;
  if (buyer) {
    const { error } = await supabase.from('leads').update({ status: 'Won', stock_item_id: null }).eq('id', buyer);
    leadClosed = !error;
  }
  return { error: null, leadClosed };
}

// ---- price point writes -------------------------------------------------------------------------------------

export type PointDraft = {
  game: string;
  item_type: string;
  item_key: string;
  price: number;
  currency: string;
  kind: 'sold' | 'asking' | 'offer';
  source: string | null;
  captured_at: string;
  note: string | null;
};

export async function savePoint(id: string | null, d: PointDraft, rates: Rates): Promise<string | null> {
  const row = { ...d, item_key: normalizeItemKey(d.item_key), price_usd: toUsd(d.price, d.currency, rates), updated_at: new Date().toISOString() };
  const { error } = id ? await supabase.from('price_points').update(row).eq('id', id) : await supabase.from('price_points').insert({ ...row, origin: 'manual' });
  return error?.message ?? null;
}

export async function deletePoint(id: string): Promise<string | null> {
  const { error } = await supabase.from('price_points').delete().eq('id', id);
  return error?.message ?? null;
}
