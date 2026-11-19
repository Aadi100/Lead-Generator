"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { loadSettings } from './settings';
import { normalizeLead } from './format';
import { normalizeDeal, normalizeTask, OPEN_DEAL_STAGES, type Deal, type Task } from './types-platform';
import type { Lead, OutreachRow, ReplyRow, SettingsMap } from './types';

export const DAYS = 14;
export const CHART_DAYS = 30;
const DAY_MS = 86_400_000;

export type DashSettings = Pick<
  SettingsMap,
  'profile' | 'profile_summary' | 'sending' | 'smtp' | 'resend' | 'imap' | 'alerts' | 'trading' | 'trade_market' | 'trade_state' | 'integrations' | 'worker_status'
>;

export type N8nStatus = { last_seen: string | null; last_error: { workflow: string; message: string; at: string | null } | null; errors_total: number };

export type DashRaw = {
  leads: Lead[];
  outreach: OutreachRow[];
  replies: ReplyRow[];
  deals: Deal[];
  tasks: Task[];
  funnel: { found: number; pitched: number; replied: number; won: number };
  /** Exact totals from count queries (the row lists below are only what the page needs, never the whole table). */
  counts: { newLeads24: number; highMatch: number; drafts: number; replies: number; buyersWaiting: number; sellers: number; matched: number; leadsTotal: number };
  hotLeads: Lead[];
  settings: DashSettings;
  n8n: N8nStatus;
  tablesMissing: { deals: boolean; tasks: boolean };
};

type Row = Record<string, unknown>;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function endOfDay(t: number): number {
  return startOfDay(t) + DAY_MS - 1;
}
const ms = (iso: string | null | undefined): number => {
  if (!iso) return NaN;
  return new Date(iso).getTime();
};

/** Daily buckets for the last `days` days, oldest first; `pick` returns the amount an item contributes (0 to skip) and its time. */
export function dailySeries<T>(items: T[], days: number, when: (x: T) => string | null | undefined, amount: (x: T) => number = () => 1, now = Date.now()): number[] {
  const today = startOfDay(now);
  const out = new Array<number>(days).fill(0);
  for (const it of items) {
    const t = ms(when(it));
    if (Number.isNaN(t)) continue;
    const idx = days - 1 - Math.floor((today - startOfDay(t)) / DAY_MS);
    if (idx >= 0 && idx < days) out[idx] += amount(it);
  }
  return out;
}

export const isTrade = (l: Lead) => l.lead_kind === 'trade';

export type Stat = { value: number; series: number[] };

export type TodayData = {
  tasks: Task[];
  drafts: OutreachRow[];
  replies: ReplyRow[];
  followups: OutreachRow[];
  hot: Lead[];
  draftsCount: number;
  repliesCount: number;
  total: number;
};

export type SourceHealth = {
  name: string;
  last: string | null;
  count24h: number;
  count7d: number;
  hoursAgo: number | null;
  state: 'fresh' | 'slow' | 'stale' | 'manual';
};

export type DashModel = {
  stats: { newLeads: Stat; highMatch: Stat; drafts: Stat; replies: Stat; openDeals: Stat; revenue: Stat; profit: Stat };
  today: TodayData;
  funnel: DashRaw['funnel'];
  perDay: { label: string; services: number; trading: number }[];
  topSources: { name: string; count: number; avgTrust: number | null }[];
  health: SourceHealth[];
  trading: { buyersWaiting: number; sellers: number; matched: number; hot: { game: string; wanted: number; offered: number }[] };
  hasDeals: boolean;
  leadsTotal: number;
};

const MANUAL_SOURCES = /capture|manual|website form|upwork|quick/i;

export function prettySource(s: string): string {
  return s.trim() || 'Unknown';
}

export function computeModel(raw: DashRaw, now = Date.now()): DashModel {
  const { leads, outreach, replies, deals, tasks, counts } = raw;
  const today0 = startOfDay(now);
  const eod = endOfDay(now);
  const services = leads.filter((l) => !isTrade(l));

  // Stats
  const drafts = outreach.filter((o) => o.status === 'draft');
  const unhandled = replies.filter((r) => !r.handled);
  const openDeals = deals.filter((d) => OPEN_DEAL_STAGES.includes(d.stage));
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const doneThisMonth = deals.filter((d) => d.stage === 'done' && ms(d.closed_at ?? d.updated_at) >= monthStart.getTime());
  const revenue = doneThisMonth.reduce((s, d) => s + (d.value ?? 0), 0);
  const profit = doneThisMonth.reduce((s, d) => s + ((d.value ?? 0) - (d.cost ?? 0)), 0);
  const doneDeals = deals.filter((d) => d.stage === 'done');

  const stats = {
    newLeads: { value: counts.newLeads24, series: dailySeries(services, DAYS, (l) => l.created_at, () => 1, now) },
    highMatch: { value: counts.highMatch, series: dailySeries(services.filter((l) => (l.fit_score ?? 0) >= 70), DAYS, (l) => l.created_at, () => 1, now) },
    drafts: { value: counts.drafts, series: dailySeries(outreach.filter((o) => o.status === 'draft' || o.status === 'sent'), DAYS, (o) => o.created_at, () => 1, now) },
    replies: { value: counts.replies, series: dailySeries(replies, DAYS, (r) => r.received_at ?? r.created_at, () => 1, now) },
    openDeals: { value: openDeals.length, series: dailySeries(deals, DAYS, (d) => d.opened_at ?? d.created_at, () => 1, now) },
    revenue: { value: revenue, series: dailySeries(doneDeals, DAYS, (d) => d.closed_at ?? d.updated_at, (d) => d.value ?? 0, now) },
    profit: { value: profit, series: dailySeries(doneDeals, DAYS, (d) => d.closed_at ?? d.updated_at, (d) => (d.value ?? 0) - (d.cost ?? 0), now) },
  };

  // Today
  const dueTasks = tasks
    .filter((t) => !t.done && t.due_at && ms(t.due_at) <= eod)
    .sort((a, b) => ms(a.due_at) - ms(b.due_at));
  const followups = outreach.filter((o) => o.status === 'scheduled' && o.due_at && ms(o.due_at) <= eod).sort((a, b) => ms(a.due_at) - ms(b.due_at));
  const hot = raw.hotLeads;
  const todayData: TodayData = {
    tasks: dueTasks,
    drafts,
    replies: unhandled,
    followups,
    hot,
    draftsCount: counts.drafts,
    repliesCount: counts.replies,
    total: dueTasks.length + counts.drafts + counts.replies + followups.length + hot.length,
  };

  // Leads per day (30)
  const perDay: DashModel['perDay'] = [];
  const svc = dailySeries(services, CHART_DAYS, (l) => l.created_at, () => 1, now);
  const trd = dailySeries(leads.filter(isTrade), CHART_DAYS, (l) => l.created_at, () => 1, now);
  for (let i = 0; i < CHART_DAYS; i++) {
    const d = new Date(today0 - (CHART_DAYS - 1 - i) * DAY_MS);
    perDay.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), services: svc[i], trading: trd[i] });
  }

  // Top sources (7 days) and health
  const bySource = new Map<string, Lead[]>();
  for (const l of leads) {
    const k = prettySource(l.source);
    const arr = bySource.get(k);
    if (arr) arr.push(l);
    else bySource.set(k, [l]);
  }
  const topSources = Array.from(bySource.entries())
    .map(([name, ls]) => {
      const week = ls.filter((l) => now - ms(l.created_at) <= 7 * DAY_MS);
      const scored = week.filter((l) => l.trust_score != null);
      return { name, count: week.length, avgTrust: scored.length ? Math.round(scored.reduce((s, l) => s + (l.trust_score ?? 0), 0) / scored.length) : null };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const health: SourceHealth[] = Array.from(bySource.entries()).map(([name, ls]) => {
    const last = ls.reduce<string | null>((m, l) => (!m || ms(l.created_at) > ms(m) ? l.created_at : m), null);
    const hoursAgo = last ? Math.max(0, (now - ms(last)) / 3_600_000) : null;
    const manual = MANUAL_SOURCES.test(name);
    const state: SourceHealth['state'] = manual ? 'manual' : hoursAgo == null || hoursAgo > 72 ? 'stale' : hoursAgo > 24 ? 'slow' : 'fresh';
    return {
      name,
      last,
      hoursAgo,
      count24h: ls.filter((l) => now - ms(l.created_at) <= DAY_MS).length,
      count7d: ls.filter((l) => now - ms(l.created_at) <= 7 * DAY_MS).length,
      state,
    };
  });
  const order = { stale: 0, slow: 1, fresh: 2, manual: 3 } as const;
  health.sort((a, b) => order[a.state] - order[b.state] || b.count24h - a.count24h || a.name.localeCompare(b.name));

  // Trading
  const trading = {
    buyersWaiting: counts.buyersWaiting,
    sellers: counts.sellers,
    matched: counts.matched,
    hot: [...raw.settings.trade_market.rows]
      .sort((a, b) => b.wanted - a.wanted)
      .filter((r) => r.wanted > 0)
      .slice(0, 3)
      .map((r) => ({ game: r.game || 'Other', wanted: r.wanted, offered: r.offered })),
  };

  return { stats, today: todayData, funnel: raw.funnel, perDay, topSources, health, trading, hasDeals: deals.length > 0, leadsTotal: counts.leadsTotal };
}

function n8nFrom(v: unknown): N8nStatus {
  const o = v && typeof v === 'object' ? (v as Row) : {};
  const e = o.last_error && typeof o.last_error === 'object' ? (o.last_error as Row) : null;
  return {
    last_seen: typeof o.last_seen === 'string' ? o.last_seen : null,
    last_error: e && (e.workflow || e.message) ? { workflow: String(e.workflow ?? ''), message: String(e.message ?? ''), at: typeof e.at === 'string' ? e.at : null } : null,
    errors_total: typeof o.errors_total === 'number' ? o.errors_total : 0,
  };
}

const PAGE = 1000;

/** Supabase returns at most 1000 rows per request, so read in pages with .range() until a short page or the cap. */
async function allRows(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, cap = 5000): Promise<{ rows: Row[]; error: string | null }> {
  const rows: Row[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return { rows, error: null };
}

const dedupe = <T extends { id: string }>(rows: T[]): T[] => {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};

export async function fetchDashboard(): Promise<{ raw: DashRaw | null; error: string | null }> {
  const keys = ['profile', 'profile_summary', 'sending', 'smtp', 'resend', 'imap', 'alerts', 'trading', 'trade_market', 'trade_state', 'integrations', 'worker_status'] as const;
  const leadCols = 'id,title,url,source,source_detail,status,created_at,lead_kind,trade_side,trade_match,game,item_type,fit_score,trust_score,trust_level,pitched_at,replied_at,category,budget_amount';
  const outCols = 'id,lead_id,step,channel,to_email,to_name,subject,status,due_at,sent_at,created_at,updated_at,leads(title)';
  const repCols = 'id,outreach_id,lead_id,from_email,from_name,subject,summary,category,handled,received_at,created_at';
  const now = Date.now();
  const since30 = new Date(startOfDay(now) - (CHART_DAYS - 1) * DAY_MS).toISOString();
  const since14 = new Date(startOfDay(now) - (DAYS - 1) * DAY_MS).toISOString();
  const since24h = new Date(now - DAY_MS).toISOString();
  const eod = new Date(endOfDay(now)).toISOString();
  const head = { count: 'exact' as const, head: true };
  const svc = () => supabase.from('leads').select('id', head).neq('lead_kind', 'trade');
  const liveTrade = () => supabase.from('leads').select('id', head).eq('lead_kind', 'trade').eq('status', 'New');

  const [leadsQ, outRecent, outDrafts, outDue, repRecent, repOpen, dealsQ, tasksQ, hotQ, settingsQ, n8nQ, ...c] = await Promise.all([
    allRows((f, t) => supabase.from('leads').select(leadCols).gte('created_at', since30).order('created_at', { ascending: false }).range(f, t)),
    allRows((f, t) => supabase.from('outreach').select(outCols).gte('created_at', since14).order('created_at', { ascending: false }).range(f, t)),
    supabase.from('outreach').select(outCols).eq('status', 'draft').order('created_at', { ascending: false }).limit(50),
    supabase.from('outreach').select(outCols).eq('status', 'scheduled').lte('due_at', eod).limit(50),
    allRows((f, t) => supabase.from('replies').select(repCols).gte('created_at', since14).order('created_at', { ascending: false }).range(f, t)),
    supabase.from('replies').select(repCols).eq('handled', false).order('created_at', { ascending: false }).limit(100),
    allRows((f, t) => supabase.from('deals').select('*').order('updated_at', { ascending: false }).range(f, t)),
    allRows((f, t) => supabase.from('tasks').select('*').eq('done', false).order('due_at', { ascending: true, nullsFirst: false }).range(f, t)),
    supabase.from('leads').select(leadCols).neq('lead_kind', 'trade').eq('status', 'New').gte('fit_score', 80).order('fit_score', { ascending: false }).limit(5),
    loadSettings([...keys]),
    supabase.from('app_settings').select('value').eq('key', 'n8n_status').maybeSingle(),
    svc().neq('status', 'Ignored'), // 0 found
    svc().not('pitched_at', 'is', null), // 1 pitched
    svc().not('replied_at', 'is', null), // 2 replied
    svc().eq('status', 'Won'), // 3 won
    svc().gte('created_at', since24h), // 4 new in 24h
    svc().eq('status', 'New').gte('fit_score', 70), // 5 high match
    supabase.from('outreach').select('id', head).eq('status', 'draft'), // 6 drafts
    supabase.from('replies').select('id', head).eq('handled', false), // 7 replies
    liveTrade().eq('trade_side', 'buyer').not('trade_match', 'is', null), // 8
    liveTrade().eq('trade_side', 'seller'), // 9
    liveTrade().not('trade_match', 'is', null), // 10
    supabase.from('leads').select('id', head), // 11 all leads
  ]);

  if (leadsQ.error && leadsQ.rows.length === 0) return { raw: null, error: leadsQ.error };
  const n = (i: number) => c[i].count ?? 0;

  const outreach = dedupe([...(outDrafts.data ?? []), ...(outDue.data ?? []), ...outRecent.rows] as unknown as OutreachRow[]);
  const replies = dedupe([...(repOpen.data ?? []), ...repRecent.rows] as unknown as ReplyRow[]);

  return {
    error: null,
    raw: {
      leads: leadsQ.rows.map(normalizeLead),
      outreach,
      replies,
      deals: dealsQ.rows.map(normalizeDeal),
      tasks: tasksQ.rows.map(normalizeTask),
      funnel: { found: n(0), pitched: n(1), replied: n(2), won: n(3) },
      counts: { newLeads24: n(4), highMatch: n(5), drafts: n(6), replies: n(7), buyersWaiting: n(8), sellers: n(9), matched: n(10), leadsTotal: n(11) },
      hotLeads: ((hotQ.data ?? []) as Row[]).map(normalizeLead),
      settings: settingsQ.values as DashSettings,
      n8n: n8nFrom(n8nQ.data?.value),
      tablesMissing: { deals: !!dealsQ.error, tasks: !!tasksQ.error },
    },
  };
}

/** Title of the lead an outreach row belongs to (joined select). */
export function outreachLeadTitle(o: OutreachRow): string {
  const j = (o as unknown as { leads?: { title?: string } | { title?: string }[] | null }).leads;
  const t = Array.isArray(j) ? j[0]?.title : j?.title;
  return t || o.subject || 'a lead';
}

export function useDashboard(pollMs = 60_000) {
  const [raw, setRaw] = useState<DashRaw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const res = await fetchDashboard();
    if (!alive.current) return;
    if (res.raw) {
      setRaw(res.raw);
      setError(null);
    } else setError(res.error ?? 'Could not load the dashboard.');
    setLoading(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    const t = setInterval(() => void reload(), pollMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive.current = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload, pollMs]);

  const patchRaw = useCallback((fn: (r: DashRaw) => DashRaw) => setRaw((r) => (r ? fn(r) : r)), []);
  return { raw, loading, error, reload, patchRaw };
}

export type SetupStep = { id: string; title: string; text: string; href?: string; done: boolean; optional?: boolean };

/** Same checklist as the Leads onboarding card, computed from already loaded settings. */
export function setupSteps(s: DashSettings, workerOnline: boolean): SetupStep[] {
  const { profile, profile_summary: summary, sending, smtp, resend, imap, alerts, trading } = s;
  const hasLinks = profile.websites.some((w) => w.trim()) || profile.links.some((l) => l.trim());
  const emailReady = sending.from_email.trim() !== '' && ((sending.provider === 'smtp' && smtp.host.trim() !== '') || (sending.provider === 'resend' && resend.api_key.trim() !== ''));
  const alertsReady = alerts.enabled && !!(alerts.email.to || (alerts.whatsapp.phone && alerts.whatsapp.apikey));
  return [
    { id: 'profile', title: 'Tell me about you', text: 'Add your name and links, then press "Learn from my links".', href: '/settings#profile', done: !!profile.your_name.trim() && hasLinks && !!summary.generated_at },
    { id: 'trading', title: 'Say what you sell or want', text: 'Optional. Finds game buyers and sellers.', href: '/trading/catalog', done: trading.enabled && trading.i_sell.length + trading.i_want.length > 0, optional: true },
    { id: 'email', title: 'Connect email sending', text: 'Add SMTP details or a Resend key.', href: '/settings#email', done: emailReady },
    { id: 'inbox', title: 'Connect your inbox', text: 'Optional. Spots replies for you.', href: '/settings#replies', done: imap.enabled && imap.host.trim() !== '' && imap.user.trim() !== '', optional: true },
    { id: 'alerts', title: 'Turn on instant alerts', text: 'Optional. A message when a strong lead arrives.', href: '/settings#alerts', done: alertsReady, optional: true },
    { id: 'worker', title: 'Start the background helper', text: 'Run npm run worker and leave it open.', done: workerOnline },
  ];
}
