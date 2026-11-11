// Outbox helpers: tab model, row buckets and labels. Pure functions, no database access.
import type { OutreachWithLead, ReplyWithLead } from './outreach';
import type { ReplyCategory, Warning } from './types';
import type { Tone } from '@/components/ui';

export type OutboxTab = 'review' | 'queue' | 'sent' | 'replies' | 'problems';
export const OUTBOX_TABS: OutboxTab[] = ['review', 'queue', 'sent', 'replies', 'problems'];

export function parseTab(v: string | null): OutboxTab {
  return OUTBOX_TABS.includes(v as OutboxTab) ? (v as OutboxTab) : 'review';
}

export type OutboxBuckets = {
  review: OutreachWithLead[];
  queue: OutreachWithLead[];
  sent: OutreachWithLead[];
  problems: OutreachWithLead[];
};

export function bucketOutreach(rows: OutreachWithLead[]): OutboxBuckets {
  const sentTime = (r: OutreachWithLead) => new Date(r.sent_at ?? r.updated_at).getTime();
  return {
    review: rows.filter((r) => r.step === 1 && r.status === 'draft' && !r.error),
    queue: rows.filter((r) => r.status === 'queued' || r.status === 'sending' || r.status === 'scheduled'),
    sent: rows.filter((r) => r.status === 'sent' || r.status === 'replied').sort((a, b) => sentTime(b) - sentTime(a)),
    problems: rows.filter((r) => r.status === 'failed' || (r.step === 1 && r.status === 'draft' && !!r.error)),
  };
}

/** Which tab an outreach row lives in (used to open a linked item on the right tab). */
export function tabOfOutreach(r: OutreachWithLead): OutboxTab | null {
  if (r.status === 'failed' || (r.step === 1 && r.status === 'draft' && r.error)) return 'problems';
  if (r.step === 1 && r.status === 'draft') return 'review';
  if (r.status === 'queued' || r.status === 'sending' || r.status === 'scheduled') return 'queue';
  if (r.status === 'sent' || r.status === 'replied') return 'sent';
  return null;
}

export const REPLY_CATEGORY: Record<ReplyCategory, { label: string; tone: Tone }> = {
  interested: { label: 'Interested', tone: 'success' },
  question: { label: 'Has a question', tone: 'info' },
  not_interested: { label: 'Not interested', tone: 'neutral' },
  out_of_office: { label: 'Out of office', tone: 'neutral' },
  bounce: { label: 'Email bounced', tone: 'danger' },
  other: { label: 'Other', tone: 'neutral' },
};

export function sortReplies(rows: ReplyWithLead[]): ReplyWithLead[] {
  const t = (r: ReplyWithLead) => new Date(r.received_at ?? r.created_at).getTime();
  return [...rows].sort((a, b) => Number(a.handled) - Number(b.handled) || t(b) - t(a));
}

export const WARNING_STYLE: Record<Warning['level'], { box: string; label: string }> = {
  hard: { box: 'border-danger-border bg-danger-soft text-danger', label: 'Cannot send' },
  hold: { box: 'border-warning-border bg-warning-soft text-warning', label: 'Needs your OK' },
  warn: { box: 'border-border bg-surface-2 text-fg-muted', label: 'Heads up' },
};

export type TaskDue = 'none' | 'today' | 'tomorrow' | 'in3' | 'nextweek';

export function dueIso(due: TaskDue): string | null {
  if (due === 'none') return null;
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  if (due === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (due === 'in3') d.setDate(d.getDate() + 3);
  else if (due === 'nextweek') d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export function replyDisplayName(r: ReplyWithLead): string {
  return r.from_name ?? r.from_email ?? r.lead?.title ?? 'someone';
}
