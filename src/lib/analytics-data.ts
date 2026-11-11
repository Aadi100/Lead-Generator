import { supabase } from './supabaseClient';
import { STATUSES, type Status } from './types';

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];
export const ROW_CAP = 2000;

export type ALead = {
  status: Status;
  source: string;
  category: string;
  kind: string;
  trust: number | null;
  created: string;
};
export type ASent = { sent: string };
export type AReply = { at: string; category: string };

export type AnalyticsData = {
  leads: ALead[];
  leadsCapped: boolean;
  sent: ASent[];
  replies: AReply[];
  events: Record<string, number>;
  errors: string[];
};

export function parseRange(raw: string | null): RangeDays {
  const n = Number(raw);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

export function sinceDate(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

export async function fetchAnalytics(days: number): Promise<AnalyticsData> {
  const since = sinceDate(days).toISOString();
  const errors: string[] = [];
  const [l, o, r, ev] = await Promise.all([
    supabase.from('leads').select('status,source,category,lead_kind,trust_score,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(ROW_CAP),
    supabase.from('outreach').select('sent_at').eq('status', 'sent').gte('sent_at', since).limit(ROW_CAP),
    supabase.from('replies').select('received_at,created_at,category').gte('created_at', since).limit(ROW_CAP),
    supabase.from('learning_events').select('kind').limit(5000),
  ]);
  if (l.error) errors.push(`Leads: ${l.error.message}`);
  if (o.error) errors.push(`Messages sent: ${o.error.message}`);
  if (r.error) errors.push(`Replies: ${r.error.message}`);
  const leadRows = (l.data ?? []) as Record<string, unknown>[];
  const leads: ALead[] = leadRows.map((x) => {
    const raw = x.status === 'Closed' ? 'Won' : x.status;
    return {
      status: STATUSES.includes(raw as Status) ? (raw as Status) : 'New',
      source: typeof x.source === 'string' && x.source ? x.source : 'Unknown',
      category: typeof x.category === 'string' && x.category ? x.category : 'No category',
      kind: typeof x.lead_kind === 'string' ? x.lead_kind : 'request',
      trust: typeof x.trust_score === 'number' ? x.trust_score : null,
      created: String(x.created_at ?? ''),
    };
  });
  const sent = ((o.data ?? []) as { sent_at: string | null }[]).filter((x) => x.sent_at).map((x) => ({ sent: x.sent_at as string }));
  const replies = ((r.data ?? []) as { received_at: string | null; created_at: string; category: string }[]).map((x) => ({ at: x.received_at ?? x.created_at, category: x.category }));
  const events: Record<string, number> = {};
  ((ev.data ?? []) as { kind: string }[]).forEach((e) => {
    events[e.kind] = (events[e.kind] ?? 0) + 1;
  });
  return { leads, leadsCapped: leadRows.length >= ROW_CAP, sent, replies, events, errors };
}

export const isContacted = (s: Status) => s === 'Pitched' || s === 'Replied' || s === 'Won' || s === 'Lost';
export const isReplied = (s: Status) => s === 'Replied' || s === 'Won';

export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 100) : null);
export const pctText = (v: number | null) => (v === null ? 'n/a' : `${v}%`);

// ---------- performance rows ----------
export type PerfRow = { name: string; leads: number; pitched: number; replied: number; won: number; winRate: number | null; avgTrust: number | null };
export type PerfKey = keyof PerfRow;

export function buildPerf(leads: ALead[], key: (l: ALead) => string): PerfRow[] {
  const map = new Map<string, { r: PerfRow; trustSum: number; trustN: number }>();
  for (const l of leads) {
    const name = key(l);
    const e = map.get(name) ?? { r: { name, leads: 0, pitched: 0, replied: 0, won: 0, winRate: null, avgTrust: null }, trustSum: 0, trustN: 0 };
    e.r.leads += 1;
    if (isContacted(l.status)) e.r.pitched += 1;
    if (isReplied(l.status)) e.r.replied += 1;
    if (l.status === 'Won') e.r.won += 1;
    if (l.trust !== null) {
      e.trustSum += l.trust;
      e.trustN += 1;
    }
    map.set(name, e);
  }
  return Array.from(map.values()).map(({ r, trustSum, trustN }) => ({
    ...r,
    winRate: pct(r.won, r.pitched),
    avgTrust: trustN ? Math.round(trustSum / trustN) : null,
  }));
}

export function sortPerf(rows: PerfRow[], key: PerfKey, dir: 'asc' | 'desc'): PerfRow[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * m;
    const an = av === null ? -1 : (av as number);
    const bn = bv === null ? -1 : (bv as number);
    return (an - bn) * m || b.leads - a.leads;
  });
}

// ---------- time series ----------
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type Bucket = { label: string; a: number; b: number };

/** Day buckets for 7 and 30 days, week buckets for 90. Series a and b are counted separately. */
export function bucketize(days: number, items: { at: string; series: 'a' | 'b' }[]): { buckets: Bucket[]; unit: 'day' | 'week' } {
  const start = sinceDate(days);
  const step = days > 30 ? 7 : 1;
  const count = Math.ceil(days / step);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const buckets: Bucket[] = Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i * step);
    return { label: step === 1 ? fmt.format(d) : `Week of ${fmt.format(d)}`, a: 0, b: 0 };
  });
  const startMs = new Date(dayKey(start)).getTime();
  for (const it of items) {
    const t = new Date(it.at);
    if (Number.isNaN(t.getTime())) continue;
    const idx = Math.floor((new Date(dayKey(t)).getTime() - startMs) / 86400000 / step);
    if (idx >= 0 && idx < count) buckets[idx][it.series] += 1;
  }
  return { buckets, unit: step === 1 ? 'day' : 'week' };
}

export const TRUST_BANDS = [
  { label: '80 to 100 (high)', min: 80, max: 100 },
  { label: '60 to 79', min: 60, max: 79 },
  { label: '40 to 59', min: 40, max: 59 },
  { label: '0 to 39 (low)', min: 0, max: 39 },
] as const;

export function trustBands(leads: ALead[]) {
  const rows = TRUST_BANDS.map((b) => ({ label: b.label, value: leads.filter((l) => l.trust !== null && l.trust >= b.min && l.trust <= b.max).length }));
  const none = leads.filter((l) => l.trust === null).length;
  return { rows, none };
}

// ---------- CSV ----------
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    let s = v === null ? '' : String(v);
    if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
