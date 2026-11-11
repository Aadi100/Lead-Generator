"use client";

// Data hooks for the Game Trading module (leads with lead_kind = 'trade', trade deals, trading settings).
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { normalizeLead } from './format';
import { loadSettings } from './settings';
import { normalizeDeal, type Deal } from './types-platform';
import type { IntegrationsSettings, Lead, TradeMarket, TradeState, TradingSettings } from './types';

export const TRADE_DAYS = 90;
export const TRADE_LIMIT = 2000;

// Light columns for lists (no description or enrichment blobs); the full row is loaded for the open lead.
const LIST_COLUMNS =
  'id,title,url,source,source_detail,type,status,created_at,category,author,contact,budget,budget_amount,posted_at,trust_score,trust_level,is_suspicious,flags,notes,lead_kind,fit_score,trade_side,game,item_type,trade_match,pitched_at,replied_at,outcome_note,price_verdict,price_pct,market_median,market_samples,market_basis,stock_item_id';

export function useTradeLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - TRADE_DAYS * 86_400_000).toISOString();
    const { data, error: err } = await supabase
      .from('leads')
      .select(LIST_COLUMNS)
      .eq('lead_kind', 'trade')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(TRADE_LIMIT);
    if (err) setError(err.message);
    else {
      setError(null);
      setLeads(((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeLead));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`trade-leads-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void load(), 600);
      })
      .subscribe();
    const poll = setInterval(() => void load(), 60_000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const patchLocal = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  return { leads, loading, error, reload: load, patchLocal };
}

/** The full row of one lead (description, contact, flags ...). */
export function useFullLead(id: string | null) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setLead(null);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
    if (err) setError(err.message);
    else {
      setError(null);
      setLead(data ? normalizeLead(data as Record<string, unknown>) : null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLead(null);
    void load();
  }, [load]);

  return { lead, loading, error, reload: load, setLead };
}

export type TradeDeals = { deals: Deal[]; loading: boolean; error: string | null; reload: () => Promise<void> };

export function useTradeDeals(): TradeDeals {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('deals').select('*').eq('kind', 'trade').order('created_at', { ascending: false }).limit(TRADE_LIMIT);
    if (err) setError(err.message);
    else {
      setError(null);
      setDeals(((data ?? []) as Record<string, unknown>[]).map(normalizeDeal));
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { deals, loading, error, reload: load };
}

export type TradingBundle = {
  trading: TradingSettings;
  market: TradeMarket;
  state: TradeState;
  integrations: IntegrationsSettings;
};

/** trading, trade_market, trade_state and integrations settings in one go. */
export function useTradingSettings() {
  const [bundle, setBundle] = useState<TradingBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { values, error: err } = await loadSettings(['trading', 'trade_market', 'trade_state', 'integrations']);
    setBundle({ trading: values.trading, market: values.trade_market, state: values.trade_state, integrations: values.integrations });
    setError(err);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { bundle, loading: bundle === null, error, reload };
}
