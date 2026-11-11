"use client";

import type { OutreachWithLead, ReplyWithLead } from '@/lib/outreach';
import { OUTREACH_STATUS_LABEL, stepLabel } from '@/lib/outreach';
import { REPLY_CATEGORY, replyDisplayName } from '@/lib/outbox-model';
import { ASSIST_CATEGORY } from '@/lib/reply-assist';
import { fmtDateTime, timeAgo, timeUntil, truncate } from '@/lib/format';
import { AlertIcon } from '../Icons';
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
  days,
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
  if (row.status === 'sending') status = { label: 'Sending', tone: 'info' };
  else if (row.status === 'queued') status = { label: OUTREACH_STATUS_LABEL.queued, tone: 'primary' };
  else if (row.status === 'scheduled') status = { label: row.due_at ? `Scheduled ${timeUntil(row.due_at, now)}` : 'Scheduled', tone: 'primary' };
  else if (row.status === 'replied') status = { label: 'They replied', tone: 'success' };
  else if (row.status === 'sent') status = { label: 'Sent', tone: 'neutral' };
  else if (row.status === 'failed') status = { label: 'Failed', tone: 'danger' };
  else if (row.status === 'draft' && row.error) status = { label: 'Held back', tone: 'warning' };
  const when = row.sent_at ?? row.updated_at;
  const showTime = row.status === 'sent' || row.status === 'replied';

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
      <span className="mt-1 flex flex-wrap items-center gap-1.5">
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
        <Badge>{stepLabel(row.step, days, row.channel)}</Badge>
        {row.channel === 'manual' && <Badge>Paste yourself</Badge>}
      </span>
      {row.subject && <span className="mt-1.5 block truncate text-[13px] font-medium text-fg-muted">{truncate(row.subject, 100)}</span>}
      {row.body && <span className="mt-0.5 line-clamp-1 block break-words text-[13px] text-fg-subtle">{row.body}</span>}
      {holds > 0 && row.status === 'draft' && (
        <span className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-warning">
          <AlertIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {holds} {holds === 1 ? 'thing needs' : 'things need'} a look
        </span>
      )}
      {row.error && row.status !== 'draft' && <span className="mt-1.5 line-clamp-1 block text-xs text-danger">{row.error}</span>}
    </button>
  );
}

export function ReplyListItem({ reply, now, selected, onSelect }: { reply: ReplyWithLead; now: number; selected: boolean; onSelect: (id: string) => void }) {
  const cat = REPLY_CATEGORY[reply.category];
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
      <span className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge tone={cat.tone}>{cat.label}</Badge>
        {reply.assist && reply.assist.classification !== 'out_of_office' && (
          <Badge tone={ASSIST_CATEGORY[reply.assist.classification].tone} title="What the reply assistant thinks they want">
            {ASSIST_CATEGORY[reply.assist.classification].label}
          </Badge>
        )}
        {reply.assist?.draft_outreach_id && <Badge tone="primary">Draft ready</Badge>}
        {reply.handled && <Badge>Handled</Badge>}
      </span>
      <span className="mt-1 block truncate text-[13px] text-fg-subtle">{replyDisplayName(reply)}</span>
      {reply.summary && <span className="line-clamp-2 mt-0.5 block break-words text-[13px] text-fg-muted">{reply.summary}</span>}
    </button>
  );
}
