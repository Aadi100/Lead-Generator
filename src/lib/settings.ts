"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import type {
  FilterBucket,
  IntegrationName,
  IntegrationsSettings,
  SettingsMap,
  TradeEntry,
  TradingSuggestions,
} from './types';

type Raw = Record<string, unknown>;

const INTEGRATION_NAMES: IntegrationName[] = ['serper', 'x', 'reddit_api', 'discord', 'upwork_inbox'];

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const sn = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown, d: number): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : d;
};
const b = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const numList = (v: unknown, d: number[]): number[] =>
  Array.isArray(v) ? v.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : d;

const optNum = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};

function tradeEntries(v: unknown): TradeEntry[] {
  if (!Array.isArray(v)) return [];
  return v.map((x, i) => {
    const o = obj(x);
    return {
      id: s(o.id) || `entry-${i}`,
      label: s(o.label),
      game: s(o.game),
      item_type: s(o.item_type),
      keywords: list(o.keywords),
      price: optNum(o.price),
    };
  });
}

function tradingSuggestions(v: unknown): TradingSuggestions | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = obj(v);
  const items = Array.isArray(o.items)
    ? o.items.map((x) => {
        const it = obj(x);
        return {
          title: s(it.title),
          why: s(it.why),
          game: s(it.game),
          item_type: s(it.item_type),
          basis: it.basis === 'observed' ? ('observed' as const) : ('general knowledge' as const),
          confidence: it.confidence === 'high' ? ('high' as const) : it.confidence === 'low' ? ('low' as const) : ('medium' as const),
        };
      })
    : [];
  return { generated_at: sn(o.generated_at), mode: o.mode === 'claude' ? 'claude' : 'heuristic', notes: s(o.notes), items: items.filter((i) => i.title) };
}

function integrationStatus(v: unknown): IntegrationsSettings['status'] {
  const out: IntegrationsSettings['status'] = {};
  for (const [k, val] of Object.entries(obj(v))) {
    if (!INTEGRATION_NAMES.includes(k as IntegrationName)) continue;
    const o = obj(val);
    out[k as IntegrationName] = { ok: o.ok === true, checked_at: sn(o.checked_at), message: s(o.message) };
  }
  return out;
}

function buckets(v: unknown): Record<string, FilterBucket> {
  const out: Record<string, FilterBucket> = {};
  for (const [k, val] of Object.entries(obj(v))) {
    const o = obj(val);
    out[k] = {
      total: n(o.total, 0),
      pitched: n(o.pitched, 0),
      replied: n(o.replied, 0),
      won: n(o.won, 0),
      lost: n(o.lost, 0),
      ignored: n(o.ignored, 0),
      win_rate: n(o.win_rate, 0),
      ignore_rate: n(o.ignore_rate, 0),
      weight: n(o.weight, 0),
    };
  }
  return out;
}

const SANITIZERS: { [K in keyof SettingsMap]: (r: Raw) => SettingsMap[K] } = {
  profile: (r) => ({
    your_name: s(r.your_name),
    business_name: s(r.business_name),
    headline: s(r.headline),
    email: s(r.email),
    websites: list(r.websites),
    links: list(r.links),
    services: list(r.services),
    location: s(r.location),
    notes: s(r.notes),
    signature: s(r.signature),
  }),
  profile_summary: (r) => ({
    generated_at: sn(r.generated_at),
    mode: r.mode === 'claude' || r.mode === 'heuristic' ? r.mode : null,
    sources: Array.isArray(r.sources)
      ? r.sources.map((x) => {
          const o = obj(x);
          const status = o.status === 'ok' || o.status === 'blocked' ? o.status : 'failed';
          return { url: s(o.url), status, chars: typeof o.chars === 'number' ? o.chars : null };
        })
      : [],
    business_name: s(r.business_name),
    summary: s(r.summary),
    what_you_sell: list(r.what_you_sell),
    services: list(r.services),
    ideal_customers: list(r.ideal_customers),
    strengths: list(r.strengths),
    voice: s(r.voice),
    sample_phrases: list(r.sample_phrases),
    keywords_target: list(r.keywords_target),
    keywords_avoid: list(r.keywords_avoid),
    portfolio_highlights: list(r.portfolio_highlights),
  }),
  sending: (r) => ({
    provider: r.provider === 'smtp' || r.provider === 'resend' ? r.provider : 'none',
    paused: b(r.paused, false),
    daily_limit: n(r.daily_limit, 20),
    auto_followups: b(r.auto_followups, true),
    followup_days: numList(r.followup_days, [4, 9]),
    from_name: s(r.from_name),
    from_email: s(r.from_email),
    reply_to: s(r.reply_to),
    footer: s(r.footer, 'If this is not relevant, just reply "no thanks" and I will not contact you again.'),
    require_confirm_suspicious: b(r.require_confirm_suspicious, true),
    auto_draft: b(r.auto_draft, true),
    auto_draft_per_hour: n(r.auto_draft_per_hour, 6),
    min_trust_for_auto_draft: n(r.min_trust_for_auto_draft, 70),
    owned_domains: list(r.owned_domains),
  }),
  smtp: (r) => ({ host: s(r.host), port: n(r.port, 587), secure: b(r.secure, false), user: s(r.user), pass: s(r.pass) }),
  resend: (r) => ({ api_key: s(r.api_key) }),
  imap: (r) => ({
    enabled: b(r.enabled, false),
    host: s(r.host),
    port: n(r.port, 993),
    secure: b(r.secure, true),
    user: s(r.user),
    pass: s(r.pass),
    folder: s(r.folder, 'INBOX'),
  }),
  imap_state: (r) => ({ last_checked: sn(r.last_checked), last_error: sn(r.last_error) }),
  alerts: (r) => {
    const tg = obj(r.telegram);
    const em = obj(r.email);
    const wa = obj(r.whatsapp);
    const dc = obj(r.discord);
    return {
      enabled: b(r.enabled, false),
      min_trust: n(r.min_trust, 70),
      only_non_suspicious: b(r.only_non_suspicious, true),
      on_reply: b(r.on_reply, true),
      telegram: { bot_token: s(tg.bot_token), chat_id: s(tg.chat_id) },
      email: { to: s(em.to) },
      whatsapp: { phone: s(wa.phone), apikey: s(wa.apikey) },
      discord: { webhook_url: s(dc.webhook_url) },
    };
  },
  trading: (r) => {
    const dc = obj(r.discord);
    return {
      enabled: b(r.enabled, false),
      i_sell: tradeEntries(r.i_sell),
      i_want: tradeEntries(r.i_want),
      games: list(r.games),
      extra_subreddits: list(r.extra_subreddits),
      discord: {
        enabled: b(dc.enabled, false),
        channels: Array.isArray(dc.channels) ? dc.channels.map((c) => ({ id: s(obj(c).id), label: s(obj(c).label) })) : [],
      },
      suggestions: tradingSuggestions(r.suggestions),
      last_run: sn(r.last_run),
      last_result: typeof r.last_result === 'string' ? r.last_result : r.last_result && typeof r.last_result === 'object' ? (r.last_result as Raw) : null,
      updated_at: sn(r.updated_at),
    };
  },
  trade_market: (r) => ({
    generated_at: sn(r.generated_at),
    days: n(r.days, 30),
    rows: Array.isArray(r.rows)
      ? r.rows
          .map((x) => {
            const o = obj(x);
            return {
              game: s(o.game),
              item_type: s(o.item_type),
              wanted: n(o.wanted, 0),
              offered: n(o.offered, 0),
              median_price: optNum(o.median_price),
              ratio: optNum(o.ratio),
            };
          })
          .filter((row) => row.game)
      : [],
    totals: { trade_leads: n(obj(r.totals).trade_leads, 0) },
  }),
  trade_state: (r) => {
    const reddit = obj(r.reddit);
    const dc: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj(r.discord))) if (typeof v === 'string') dc[k] = v;
    return { discord: dc, reddit_last_run: sn(reddit.last_run), subs_ok: list(r.subs_ok) };
  },
  integrations: (r) => {
    const sp = obj(r.serper);
    const x = obj(r.x);
    const rd = obj(r.reddit_api);
    return {
      serper: { enabled: b(sp.enabled, false), api_key: s(sp.api_key), services: b(sp.services, true), trading: b(sp.trading, true) },
      x: { enabled: b(x.enabled, false), bearer_token: s(x.bearer_token) },
      reddit_api: { enabled: b(rd.enabled, false), client_id: s(rd.client_id), client_secret: s(rd.client_secret), username: s(rd.username) },
      discord: { bot_token: s(obj(r.discord).bot_token) },
      upwork_inbox: { enabled: b(obj(r.upwork_inbox).enabled, false) },
      status: integrationStatus(r.status),
    };
  },
  prospecting: (r) => ({
    enabled: b(r.enabled, false),
    cities: list(r.cities),
    business_types: Array.isArray(r.business_types) ? list(r.business_types) : [],
    per_run_limit: n(r.per_run_limit, 30),
    interval_hours: n(r.interval_hours, 24),
    last_run: sn(r.last_run),
    last_result: typeof r.last_result === 'string' ? r.last_result : r.last_result && typeof r.last_result === 'object' ? (r.last_result as Raw) : null,
  }),
  targeting: (r) => {
    const sg = r.suggested && typeof r.suggested === 'object' && !Array.isArray(r.suggested) ? obj(r.suggested) : null;
    const budget = typeof r.min_budget === 'number' || (typeof r.min_budget === 'string' && r.min_budget.trim() !== '') ? Number(r.min_budget) : NaN;
    return {
      keywords: list(r.keywords),
      topics: list(r.topics),
      exclude: list(r.exclude),
      min_budget: Number.isFinite(budget) && budget >= 0 ? budget : null,
      work_description: s(r.work_description),
      job_description: s(r.job_description),
      suggested: sg
        ? {
            generated_at: s(sg.generated_at),
            keywords: list(sg.keywords),
            topics: list(sg.topics),
            exclude: list(sg.exclude),
            mode: sg.mode === 'claude' ? 'claude' : 'heuristic',
          }
        : null,
      updated_at: sn(r.updated_at),
    };
  },
  writing_rules: (r) => ({
    source: r.source === 'learned' || r.source === 'manual' ? r.source : 'default',
    updated_at: sn(r.updated_at),
    last_learned_at: sn(r.last_learned_at),
    markdown: s(r.markdown),
    history: Array.isArray(r.history)
      ? r.history.map((x) => {
          const o = obj(x);
          return { at: s(o.at), source: s(o.source), markdown: s(o.markdown) };
        })
      : [],
  }),
  filter_learning: (r) => ({
    generated_at: sn(r.generated_at),
    total: n(r.total, 0),
    by_source: buckets(r.by_source),
    by_category: buckets(r.by_category),
    by_detail: buckets(r.by_detail),
    by_tag: buckets(r.by_tag),
    insights: list(r.insights),
    suggested_hide: Array.isArray(r.suggested_hide)
      ? r.suggested_hide.map((x) => {
          const o = obj(x);
          return { kind: s(o.kind), value: s(o.value), reason: s(o.reason) };
        })
      : [],
  }),
  fit_state: (r) => ({ profile_at: sn(r.profile_at), filters_at: sn(r.filters_at) }),
  worker_status: (r) => {
    const c = obj(r.claude);
    return {
      last_seen: sn(r.last_seen),
      started_at: sn(r.started_at),
      pid: typeof r.pid === 'number' ? r.pid : null,
      claude: { available: b(c.available, false), version: sn(c.version), bin: sn(c.bin) },
      handlers: list(r.handlers),
      jobs: list(r.jobs),
    };
  },
};

export function sanitizeSetting<K extends keyof SettingsMap>(key: K, raw: unknown): SettingsMap[K] {
  const fn = SANITIZERS[key] as (r: Raw) => SettingsMap[K];
  return fn(obj(raw));
}

export function defaultSetting<K extends keyof SettingsMap>(key: K): SettingsMap[K] {
  return sanitizeSetting(key, {});
}

export async function loadSetting<K extends keyof SettingsMap>(
  key: K,
): Promise<{ value: SettingsMap[K]; error: string | null }> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) return { value: defaultSetting(key), error: error.message };
  return { value: sanitizeSetting(key, data?.value), error: null };
}

export async function loadSettings<K extends keyof SettingsMap>(
  keys: K[],
): Promise<{ values: { [P in K]: SettingsMap[P] }; error: string | null }> {
  const values = {} as { [P in K]: SettingsMap[P] };
  keys.forEach((k) => {
    values[k] = defaultSetting(k);
  });
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', keys as string[]);
  if (error) return { values, error: error.message };
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    if ((keys as string[]).includes(row.key)) {
      const k = row.key as K;
      values[k] = sanitizeSetting(k, row.value);
    }
  }
  return { values, error: null };
}

// Reads the freshest stored value and merges only the given fields, so values the worker writes in between are kept.
export async function patchSetting<K extends keyof SettingsMap>(
  key: K,
  patch: Partial<SettingsMap[K]>,
): Promise<{ value: SettingsMap[K] | null; error: string | null }> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) return { value: null, error: error.message };
  const next = { ...obj(data?.value), ...(patch as Raw) };
  const { error: upErr } = await supabase
    .from('app_settings')
    .upsert({ key, value: next, updated_at: new Date().toISOString() });
  if (upErr) return { value: null, error: upErr.message };
  return { value: sanitizeSetting(key, next), error: null };
}

type FormKey = 'profile' | 'sending' | 'smtp' | 'resend' | 'imap' | 'alerts' | 'prospecting' | 'targeting' | 'trading' | 'integrations';

export function useSettingForm<K extends FormKey>(key: K, owned?: (keyof SettingsMap[K])[]) {
  const [saved, setSaved] = useState<SettingsMap[K]>(() => defaultSetting(key));
  const [draft, setDraft] = useState<SettingsMap[K]>(() => defaultSetting(key));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownedRef = useRef(owned);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await loadSetting(key);
    setSaved(res.value);
    setDraft(res.value);
    setError(res.error);
    setLoading(false);
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const patch = useCallback((p: Partial<SettingsMap[K]>) => {
    setDraft((d) => ({ ...d, ...p }));
  }, []);

  const save = useCallback(
    async (extra?: Partial<SettingsMap[K]>): Promise<string | null> => {
      setSaving(true);
      const merged = { ...draft, ...(extra ?? {}) } as SettingsMap[K];
      const fields = ownedRef.current;
      const payload = fields
        ? (Object.fromEntries(fields.map((f) => [f, merged[f]])) as Partial<SettingsMap[K]>)
        : merged;
      const res = await patchSetting(key, payload);
      setSaving(false);
      if (res.error || !res.value) {
        setError(res.error ?? 'Could not save.');
        return res.error ?? 'Could not save.';
      }
      setError(null);
      setSaved(res.value);
      setDraft(res.value);
      return null;
    },
    [draft, key],
  );

  const reset = useCallback(() => setDraft(saved), [saved]);

  return { draft, saved, patch, setDraft, dirty, loading, saving, error, save, reset, reload };
}
