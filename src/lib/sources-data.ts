"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { sanitizeSetting } from './settings';
import { buildRows, n8nOnline, parseN8n, workerOnline, type LeadRow, type N8nStatus, type SourceContext, type SourceRow } from './sources-model';
import type { SettingsMap } from './types';

const KEYS = ['integrations', 'trade_state', 'trading', 'prospecting', 'worker_status', 'imap', 'sending', 'n8n_status'];

export type SourcesData = {
  loading: boolean;
  error: string | null;
  rows: SourceRow[];
  ctx: SourceContext;
  worker: SettingsMap['worker_status'];
  sendingPaused: boolean;
  leadCount: number;
  capped: boolean;
  keysMissing: string[];
  refresh: () => Promise<void>;
};

const emptyN8n: N8nStatus = { last_seen: null, errors_total: 0, last_error: null };

export function useSourcesData(): SourcesData {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [lr, sr] = await Promise.all([
      supabase.from('leads').select('source,source_detail,lead_kind,trust_score,created_at').order('created_at', { ascending: false }).limit(2000),
      supabase.from('app_settings').select('key,value').in('key', KEYS),
    ]);
    const err = lr.error?.message ?? sr.error?.message ?? null;
    if (err) {
      setError(err);
    } else {
      setError(null);
      setLeads((lr.data ?? []) as LeadRow[]);
      const m: Record<string, unknown> = {};
      for (const r of (sr.data ?? []) as { key: string; value: unknown }[]) m[r.key] = r.value;
      setRaw(m);
    }
    setNow(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  return useMemo(() => {
    const integrations = sanitizeSetting('integrations', raw.integrations);
    const trading = sanitizeSetting('trading', raw.trading);
    const prospecting = sanitizeSetting('prospecting', raw.prospecting);
    const worker = sanitizeSetting('worker_status', raw.worker_status);
    const imap = sanitizeSetting('imap', raw.imap);
    const sending = sanitizeSetting('sending', raw.sending);
    const tradeState = sanitizeSetting('trade_state', raw.trade_state);
    const n8n = raw.n8n_status ? parseN8n(raw.n8n_status) : emptyN8n;
    const ctx: SourceContext = {
      now,
      n8n,
      n8nOnline: n8nOnline(n8n, now),
      workerOnline: workerOnline(worker, now),
      integrations,
      trading,
      prospecting,
      imapReady: imap.enabled && !!imap.host && !!imap.user && !!imap.pass,
      tradeState,
    };
    const rows = buildRows(leads, ctx);
    return {
      loading,
      error,
      rows,
      ctx,
      worker,
      sendingPaused: sending.paused,
      leadCount: leads.length,
      capped: leads.length >= 2000,
      keysMissing: rows.filter((r) => r.status === 'needs_key').map((r) => r.def.name),
      refresh,
    };
  }, [leads, raw, now, loading, error, refresh]);
}
