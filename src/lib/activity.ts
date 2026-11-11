"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

export type ActivityKind = 'lead' | 'sent' | 'reply' | 'deal';

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  /** ISO time of the event. */
  at: string;
  title: string;
  detail: string | null;
  /** Where clicking the item goes. */
  href: string;
};

export const ACTIVITY_SEEN_KEY = 'lr:activity-seen';

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function leadHref(row: Row): string {
  const id = String(row.id ?? '');
  if (row.lead_kind === 'trade') return `/trading/${row.trade_side === 'seller' ? 'sellers' : 'buyers'}?lead=${id}`;
  return `/leads?lead=${id}`;
}

/** Latest events from leads, sent mail, replies and deals, newest first. A source that fails (for example a missing table) is skipped. */
export async function fetchActivity(limit = 10): Promise<{ items: ActivityItem[]; error: string | null }> {
  const [leads, sent, replies, deals] = await Promise.all([
    supabase.from('leads').select('id,title,source,source_detail,lead_kind,trade_side,created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('outreach').select('id,lead_id,step,to_email,subject,sent_at,leads(title)').eq('status', 'sent').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(limit),
    supabase.from('replies').select('id,lead_id,from_email,from_name,subject,category,received_at,created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('deals').select('id,title,stage,updated_at,opened_at').order('updated_at', { ascending: false }).limit(limit),
  ]);

  const items: ActivityItem[] = [];

  for (const r of (leads.data ?? []) as Row[]) {
    items.push({
      id: `lead-${r.id}`,
      kind: 'lead',
      at: String(r.created_at ?? ''),
      title: `New lead: ${str(r.title) ?? 'Untitled'}`,
      detail: [str(r.source), str(r.source_detail)].filter(Boolean).join(' · ') || null,
      href: leadHref(r),
    });
  }
  for (const r of (sent.data ?? []) as Row[]) {
    const lead = r.leads as { title?: string } | { title?: string }[] | null;
    const leadTitle = Array.isArray(lead) ? lead[0]?.title : lead?.title;
    items.push({
      id: `sent-${r.id}`,
      kind: 'sent',
      at: String(r.sent_at ?? ''),
      title: `${Number(r.step) > 1 ? 'Follow-up' : 'Email'} sent to ${str(r.to_email) ?? 'a lead'}`,
      detail: str(leadTitle) ?? str(r.subject),
      href: '/outbox',
    });
  }
  for (const r of (replies.data ?? []) as Row[]) {
    items.push({
      id: `reply-${r.id}`,
      kind: 'reply',
      at: String(r.received_at ?? r.created_at ?? ''),
      title: `Reply from ${str(r.from_name) ?? str(r.from_email) ?? 'someone'}`,
      detail: [str(r.category)?.replace('_', ' '), str(r.subject)].filter(Boolean).join(' · ') || null,
      href: '/outbox',
    });
  }
  for (const r of (deals.data ?? []) as Row[]) {
    items.push({
      id: `deal-${r.id}`,
      kind: 'deal',
      at: String(r.updated_at ?? r.opened_at ?? ''),
      title: `Deal: ${str(r.title) ?? 'Untitled'}`,
      detail: str(r.stage),
      href: `/deals?deal=${r.id}`,
    });
  }

  const valid = items.filter((i) => i.at && !Number.isNaN(new Date(i.at).getTime()));
  valid.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const allFailed = [leads, sent, replies, deals].every((q) => q.error);
  return { items: valid.slice(0, limit), error: allFailed ? (leads.error?.message ?? 'Could not load activity.') : null };
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(ACTIVITY_SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Activity feed for the bell and the Activity page.
 * unread = items newer than localStorage 'lr:activity-seen'. The first ever visit starts with nothing unread.
 */
export function useActivityFeed({ limit = 10, pollMs = 60_000, enabled = true }: { limit?: number; pollMs?: number; enabled?: boolean } = {}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let stored = readSeen();
    if (!stored) {
      stored = new Date().toISOString();
      try {
        localStorage.setItem(ACTIVITY_SEEN_KEY, stored);
      } catch {
        // seen state just stays in memory
      }
    }
    setSeen(stored);
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const res = await fetchActivity(limit);
    if (!alive.current) return;
    setItems(res.items);
    setError(res.error);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const timer = setInterval(() => void reload(), pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, reload, pollMs]);

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setSeen(now);
    try {
      localStorage.setItem(ACTIVITY_SEEN_KEY, now);
    } catch {
      // not persisted
    }
  }, []);

  const unread = seen ? items.filter((i) => new Date(i.at).getTime() > new Date(seen).getTime()).length : 0;
  return { items, unread, seen, loading, error, markSeen, reload };
}
