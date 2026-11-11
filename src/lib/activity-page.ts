"use client";

// Data layer for the Activity page: a unified, cursor-paged feed built from the timestamps of
// leads, outreach, replies, deals and tasks. (src/lib/activity.ts powers the small bell feed.)
import { supabase } from './supabaseClient';

export type FeedKind = 'lead' | 'sent' | 'reply' | 'deal' | 'task';
export const FEED_KINDS: FeedKind[] = ['lead', 'sent', 'reply', 'deal', 'task'];
export const FEED_LABEL: Record<FeedKind, string> = {
  lead: 'New leads',
  sent: 'Messages sent',
  reply: 'Replies',
  deal: 'Deals',
  task: 'Tasks done',
};

export type FeedItem = {
  id: string;
  kind: FeedKind;
  at: string;
  title: string;
  detail: string | null;
  href: string;
};

export const FEED_PAGE = 30;

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export function parseKinds(v: string | null): FeedKind[] {
  if (!v) return [];
  return v.split(',').filter((k): k is FeedKind => FEED_KINDS.includes(k as FeedKind));
}

function leadHref(r: Row): string {
  const id = String(r.id ?? '');
  if (r.lead_kind === 'trade') return `/trading/${r.trade_side === 'seller' ? 'sellers' : 'buyers'}?lead=${id}`;
  return `/leads?lead=${id}`;
}

function oneLead(v: unknown): string | null {
  const l = Array.isArray(v) ? v[0] : v;
  return l && typeof l === 'object' ? str((l as Row).title) : null;
}

/** Items of the chosen kinds strictly older than `before` (ISO), newest first, at most `limit`. */
export async function fetchFeedPage(kinds: FeedKind[], before: string | null, limit = FEED_PAGE): Promise<{ items: FeedItem[]; hasMore: boolean; error: string | null }> {
  const want = (k: FeedKind) => kinds.length === 0 || kinds.includes(k);
  const errors: string[] = [];
  const tasks: Promise<FeedItem[]>[] = [];

  const run = (label: string, q: PromiseLike<{ data: unknown; error: { message: string } | null }>, map: (r: Row) => FeedItem | null) =>
    tasks.push(
      Promise.resolve(q).then(({ data, error }) => {
        if (error) {
          errors.push(`${label}: ${error.message}`);
          return [];
        }
        return ((data ?? []) as Row[]).map(map).filter((x): x is FeedItem => !!x);
      }),
    );

  if (want('lead')) {
    let q = supabase.from('leads').select('id,title,source,source_detail,lead_kind,trade_side,created_at').order('created_at', { ascending: false }).limit(limit);
    if (before) q = q.lt('created_at', before);
    run('leads', q, (r) => ({
      id: `lead-${r.id}`,
      kind: 'lead',
      at: String(r.created_at ?? ''),
      title: str(r.title) ?? 'Untitled lead',
      detail: [str(r.source), str(r.source_detail)].filter(Boolean).join(' · ') || null,
      href: leadHref(r),
    }));
  }
  if (want('sent')) {
    let q = supabase.from('outreach').select('id,step,to_email,subject,sent_at,leads(title)').in('status', ['sent', 'replied']).not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(limit);
    if (before) q = q.lt('sent_at', before);
    run('messages', q, (r) => ({
      id: `sent-${r.id}`,
      kind: 'sent',
      at: String(r.sent_at ?? ''),
      title: oneLead(r.leads) ?? str(r.subject) ?? 'A message',
      detail: `${Number(r.step) > 1 ? 'Follow-up' : 'Email'} sent${str(r.to_email) ? ` to ${str(r.to_email)}` : ''}`,
      href: `/outbox?tab=sent&item=${r.id}`,
    }));
  }
  if (want('reply')) {
    let q = supabase.from('replies').select('id,from_name,from_email,subject,category,summary,received_at,created_at,leads(title)').order('received_at', { ascending: false }).limit(limit);
    if (before) q = q.lt('received_at', before);
    run('replies', q, (r) => ({
      id: `reply-${r.id}`,
      kind: 'reply',
      at: String(r.received_at ?? r.created_at ?? ''),
      title: oneLead(r.leads) ?? str(r.subject) ?? 'A reply',
      detail: `Reply from ${str(r.from_name) ?? str(r.from_email) ?? 'someone'}${str(r.category) ? ` · ${String(r.category).replace(/_/g, ' ')}` : ''}`,
      href: `/outbox?tab=replies&item=${r.id}`,
    }));
  }
  if (want('deal')) {
    let created = supabase.from('deals').select('id,title,stage,value,currency,created_at').order('created_at', { ascending: false }).limit(limit);
    if (before) created = created.lt('created_at', before);
    run('deals', created, (r) => ({
      id: `deal-new-${r.id}`,
      kind: 'deal',
      at: String(r.created_at ?? ''),
      title: str(r.title) ?? 'Untitled deal',
      detail: 'Deal started',
      href: `/deals?deal=${r.id}`,
    }));
    let closed = supabase.from('deals').select('id,title,stage,value,currency,closed_at').not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(limit);
    if (before) closed = closed.lt('closed_at', before);
    run('deals', closed, (r) => ({
      id: `deal-end-${r.id}`,
      kind: 'deal',
      at: String(r.closed_at ?? ''),
      title: str(r.title) ?? 'Untitled deal',
      detail: `Deal closed (${str(r.stage) ?? 'done'})`,
      href: `/deals?deal=${r.id}`,
    }));
  }
  if (want('task')) {
    let q = supabase.from('tasks').select('id,title,done_at').not('done_at', 'is', null).order('done_at', { ascending: false }).limit(limit);
    if (before) q = q.lt('done_at', before);
    run('tasks', q, (r) => ({
      id: `task-${r.id}`,
      kind: 'task',
      at: String(r.done_at ?? ''),
      title: str(r.title) ?? 'Untitled task',
      detail: 'Task completed',
      href: '/tasks',
    }));
  }

  const lists = await Promise.all(tasks);
  const all = lists
    .flat()
    .filter((i) => i.at && !Number.isNaN(new Date(i.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const items = all.slice(0, limit);
  const anySourceFull = lists.some((l) => l.length >= limit);
  const failedAll = tasks.length > 0 && errors.length >= tasks.length;
  return { items, hasMore: all.length > limit || anySourceFull, error: failedAll ? errors[0] : null };
}

export const FEED_TABLES = ['leads', 'outreach', 'replies', 'deals', 'tasks'];

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabel(key: string, now = new Date()): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
