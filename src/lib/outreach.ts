"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { normalizeLead, num, str } from './format';
import type {
  Lead,
  OutreachRow,
  OutreachStatus,
  ReplyCategory,
  ReplyRow,
  Status,
  Warning,
} from './types';

const OUTREACH_STATUSES: OutreachStatus[] = ['draft', 'queued', 'sending', 'scheduled', 'sent', 'failed', 'cancelled', 'replied'];
const REPLY_CATEGORIES: ReplyCategory[] = ['interested', 'question', 'not_interested', 'out_of_office', 'bounce', 'other'];

function parseWarnings(v: unknown): Warning[] {
  let value = v;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: Warning[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const message = str(o.message);
    if (!message) continue;
    const level = o.level === 'hard' || o.level === 'hold' ? o.level : 'warn';
    out.push({ level, code: str(o.code) ?? 'note', message });
  }
  return out;
}

export function normalizeOutreach(raw: Record<string, unknown>): OutreachRow {
  const status = OUTREACH_STATUSES.includes(raw.status as OutreachStatus) ? (raw.status as OutreachStatus) : 'draft';
  return {
    id: String(raw.id ?? ''),
    lead_id: String(raw.lead_id ?? ''),
    step: num(raw.step) ?? 1,
    channel: raw.channel === 'manual' ? 'manual' : 'email',
    to_email: str(raw.to_email),
    to_name: str(raw.to_name),
    subject: typeof raw.subject === 'string' ? raw.subject : null,
    body: typeof raw.body === 'string' ? raw.body : null,
    original_subject: typeof raw.original_subject === 'string' ? raw.original_subject : null,
    original_body: typeof raw.original_body === 'string' ? raw.original_body : null,
    status,
    due_at: str(raw.due_at),
    sent_at: str(raw.sent_at),
    message_id: str(raw.message_id),
    provider: str(raw.provider),
    error: str(raw.error),
    warnings: parseWarnings(raw.warnings),
    confirmed_suspicious: raw.confirmed_suspicious === true,
    override_warnings: raw.override_warnings === true,
    rating: raw.rating === 'good' || raw.rating === 'bad' ? raw.rating : null,
    feedback_note: str(raw.feedback_note),
    created_at: str(raw.created_at) ?? new Date().toISOString(),
    updated_at: str(raw.updated_at) ?? new Date().toISOString(),
  };
}

export function normalizeReply(raw: Record<string, unknown>): ReplyRow {
  return {
    id: String(raw.id ?? ''),
    outreach_id: str(raw.outreach_id),
    lead_id: str(raw.lead_id),
    from_email: str(raw.from_email),
    from_name: str(raw.from_name),
    subject: typeof raw.subject === 'string' ? raw.subject : null,
    body: typeof raw.body === 'string' ? raw.body : null,
    message_id: str(raw.message_id),
    received_at: str(raw.received_at),
    category: REPLY_CATEGORIES.includes(raw.category as ReplyCategory) ? (raw.category as ReplyCategory) : 'other',
    summary: str(raw.summary),
    handled: raw.handled === true,
    created_at: str(raw.created_at) ?? new Date().toISOString(),
  };
}

export type OutreachWithLead = OutreachRow & { lead: Lead | null };
export type ReplyWithLead = ReplyRow & { lead: Lead | null };

function embeddedLead(raw: Record<string, unknown>): Lead | null {
  const l = raw.lead;
  return l && typeof l === 'object' && !Array.isArray(l) ? normalizeLead(l as Record<string, unknown>) : null;
}

function useLiveTable<T>(
  table: string,
  select: string,
  order: string,
  map: (raw: Record<string, unknown>) => T,
  limit: number,
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef(map);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from(table)
      .select(select)
      .order(order, { ascending: false })
      .limit(limit);
    if (err) {
      setError(err.message);
    } else {
      setError(null);
      setRows(((data ?? []) as unknown as Record<string, unknown>[]).map((r) => mapRef.current(r)));
    }
    setLoading(false);
  }, [table, select, order, limit]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`${table}-live-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => void load(), 400);
      })
      .subscribe();
    const poll = setInterval(() => void load(), 30_000);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [table, load]);

  return { rows, loading, error, reload: load };
}

export function useOutreach() {
  const res = useLiveTable<OutreachWithLead>(
    'outreach',
    '*, lead:leads(*)',
    'created_at',
    (raw) => ({ ...normalizeOutreach(raw), lead: embeddedLead(raw) }),
    2000,
  );
  return res;
}

export function useReplies() {
  return useLiveTable<ReplyWithLead>(
    'replies',
    '*, lead:leads(*)',
    'received_at',
    (raw) => ({ ...normalizeReply(raw), lead: embeddedLead(raw) }),
    300,
  );
}

export function groupByLead<T extends { lead_id: string; step: number }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.lead_id);
    if (list) list.push(r);
    else map.set(r.lead_id, [r]);
  }
  map.forEach((list) => list.sort((a, b) => a.step - b.step));
  return map;
}

export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sentTodayCount(rows: OutreachRow[]): number {
  const since = startOfToday();
  return rows.filter(
    (r) => r.channel === 'email' && (r.status === 'sent' || r.status === 'replied') && r.sent_at && new Date(r.sent_at).getTime() >= since,
  ).length;
}

export const OUTREACH_STATUS_LABEL: Record<OutreachStatus, string> = {
  draft: 'Draft',
  queued: 'Waiting to send',
  sending: 'Sending',
  scheduled: 'Scheduled',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
  replied: 'Replied',
};

export function stepLabel(step: number, days: number[], channel: 'email' | 'manual' = 'email'): string {
  if (step <= 1) return channel === 'manual' ? 'Message' : 'Email';
  const day = days[step - 2];
  return `Follow-up ${step - 1}${day ? ` (day ${day})` : ''}`;
}

export function outreachChip(rows: OutreachRow[]): { label: string; tone: string } | null {
  const first = rows.find((r) => r.step === 1) ?? rows[0];
  if (!first) return null;
  const hasScheduled = rows.some((r) => r.status === 'scheduled');
  switch (first.status) {
    case 'draft':
      return { label: first.error ? 'Held: needs a look' : 'Draft ready', tone: first.error ? 'bg-warning-soft text-warning ring-warning-border' : 'bg-primary-soft text-primary-text ring-primary-border' };
    case 'queued':
    case 'sending':
      return { label: 'Sending now', tone: 'bg-info-soft text-info ring-info-border' };
    case 'sent':
      return { label: hasScheduled ? 'Sent, follow-up scheduled' : 'Sent', tone: 'bg-cat-app-soft text-cat-app ring-cat-app/30' };
    case 'replied':
      return { label: 'They replied', tone: 'bg-success-soft text-success ring-success-border' };
    case 'failed':
      return { label: 'Send failed', tone: 'bg-danger-soft text-danger ring-danger-border' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'bg-surface-2 text-fg-subtle ring-border' };
    default:
      return { label: OUTREACH_STATUS_LABEL[first.status], tone: 'bg-surface-2 text-fg-muted ring-border' };
  }
}

// Best effort: the worker learns from outcomes, so a failure here must never block the user.
export async function recordOutcome(leadId: string, status: Status): Promise<void> {
  if (status !== 'Won' && status !== 'Lost' && status !== 'Ignored') return;
  await supabase.from('learning_events').insert({ kind: 'outcome', lead_id: leadId, data: { status } });
}
