"use client";

import type { OutreachWithLead, ReplyWithLead } from '@/lib/outreach';
import { REPLY_CATEGORY, replyDisplayName } from '@/lib/outbox-model';
import { ASSIST_CATEGORY } from '@/lib/reply-assist';
import { fmtDateTime, timeAgo, timeUntil, truncate } from '@/lib/format';
import { Badge, cx } from '../ui';

const ROW_BASE =
  'btn block w-full cursor-pointer rounded-card border p-3 text-left transition-colors duration-fast focus-visible:outline-none';

function rowClass(selected: boolean, emphasis = false) {
  return cx(
    ROW_BASE,
    selected ? 'border-primary-border bg-primary-soft ring-1 ring-primary-border' : emphasis ? 'border-primary-border bg-surface hover:bg-surface-2' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2',
  );
}

export function OutreachListItem({
  row,
  now,
  selected,
  onSelect,
}: {
  row: OutreachWithLead;
  days: number[];
  now: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const holds = row.warnings.filter((w) => w.level !== 'warn').length;
  let status: { label: string; tone: 'info' | 'primary' | 'success' | 'danger' | 'warning' | 'neutral' } | null = null;
  if (row.status === 'sending') status = { label: 'Sending now', tone: 'info' };
  else if (row.status === 'queued') status = { label: 'Waiting to send', tone: 'primary' };
  else if (row.status === 'scheduled') status = { label: row.due_at ? `Goes out ${timeUntil(row.due_at, now)}` : 'Scheduled', tone: 'primary' };
  else if (row.status === 'replied') status = { label: 'They replied', tone: 'success' };
  else if (row.status === 'sent') status = { label: 'Sent', tone: 'neutral' };
  else if (row.status === 'failed') status = { label: 'Did not send', tone: 'danger' };
  else if (row.status === 'draft' && row.error) status = { label: 'Held back', tone: 'warning' };
  else if (row.status === 'draft' && holds > 0) status = { label: 'Needs a look', tone: 'warning' };
  else if (row.status === 'draft') status = { label: row.channel === 'manual' ? 'Ready to copy' : 'Ready to review', tone: 'info' };
  const when = row.sent_at ?? row.updated_at;
  const showTime = row.status === 'sent' || row.status === 'replied';
  const preview = row.subject ? truncate(row.subject, 100) : row.body ? truncate(row.body, 100) : '';

  return (
    <button type="button" onClick={() => onSelect(row.id)} aria-current={selected ? 'true' : undefined} className={rowClass(selected)}>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-semibold text-fg">{row.lead?.title ?? 'Lead removed'}</span>
        {showTime && (
          <span className="shrink-0 text-xs text-fg-subtle" title={fmtDateTime(when)}>
            {timeAgo(when, now)}
          </span>
        )}
      </span>
      {preview && <span className="mt-1 line-clamp-2 block break-words text-sm text-fg-muted">{preview}</span>}
      {status && (
        <span className="mt-2 flex">
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
      )}
      {row.error && row.status !== 'draft' && <span className="mt-1.5 line-clamp-1 block text-xs text-danger">{row.error}</span>}
    </button>
  );
}

export function ReplyListItem({ reply, now, selected, onSelect }: { reply: ReplyWithLead; now: number; selected: boolean; onSelect: (id: string) => void }) {
  const cat = REPLY_CATEGORY[reply.category];
  const chip = reply.assist && reply.assist.classification !== 'out_of_office' ? ASSIST_CATEGORY[reply.assist.classification] : cat;
  const when = reply.received_at ?? reply.created_at;
  return (
    <button type="button" onClick={() => onSelect(reply.id)} aria-current={selected ? 'true' : undefined} className={rowClass(selected, !reply.handled)}>
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {!reply.handled && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
          <span className={cx('min-w-0 break-words text-sm', reply.handled ? 'font-medium text-fg-muted' : 'font-semibold text-fg')}>{reply.lead?.title ?? reply.subject ?? 'Reply'}</span>
        </span>
        <span className="shrink-0 text-xs text-fg-subtle" title={fmtDateTime(when)}>
          {timeAgo(when, now)}
        </span>
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={chip.tone}>{chip.label}</Badge>
        {reply.assist?.draft_outreach_id && !reply.handled && <Badge tone="primary">Reply drafted</Badge>}
      </span>
      <span className="mt-1 block truncate text-[13px] text-fg-subtle">{replyDisplayName(reply)}</span>
      {reply.summary && <span className="line-clamp-2 mt-0.5 block break-words text-[13px] text-fg-muted">{reply.summary}</span>}
    </button>
  );
}
