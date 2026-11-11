"use client";

import { useState } from 'react';
import Link from 'next/link';
import type { OutreachWithLead, ReplyWithLead } from '@/lib/outreach';
import { OUTREACH_STATUS_LABEL, stepLabel } from '@/lib/outreach';
import { REPLY_CATEGORY, WARNING_STYLE, replyDisplayName, type OutboxTab } from '@/lib/outbox-model';
import { fmtDateTime, timeAgo, timeUntil } from '@/lib/format';
import type { Status } from '@/lib/types';
import { AlertIcon, ExternalIcon, MailIcon, PlusIcon, RefreshIcon } from '../Icons';
import { Badge, Button, StatusBadge, cx } from '../ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</h3>
      {children}
    </div>
  );
}

function LeadLink({ id, label = 'Open lead' }: { id: string | null | undefined; label?: string }) {
  if (!id) return null;
  return (
    <Link href={`/leads?lead=${id}`} className="btn inline-flex min-h-8 items-center gap-1.5 rounded-ctl px-2 text-sm font-medium text-primary-text hover:underline">
      {label}
      <ExternalIcon className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

export function OutreachPreview({
  row,
  tab,
  days,
  now,
  onReview,
  onCancel,
  onRetry,
  retrying,
}: {
  row: OutreachWithLead;
  tab: OutboxTab;
  days: number[];
  now: number;
  onReview: (leadId: string) => void;
  onCancel: (row: OutreachWithLead) => void;
  onRetry: (row: OutreachWithLead) => void;
  retrying: boolean;
}) {
  const failed = row.status === 'failed';
  const held = row.status === 'draft' && !!row.error;
  const cancellable = row.status === 'queued' || row.status === 'scheduled';
  let when: string | null = null;
  if (row.status === 'scheduled') when = row.due_at ? `Scheduled ${timeUntil(row.due_at, now)} (${fmtDateTime(row.due_at)})` : 'Scheduled for after the first email goes out';
  else if (row.status === 'sent' || row.status === 'replied') when = row.sent_at ? `Sent ${timeAgo(row.sent_at, now)} (${fmtDateTime(row.sent_at)})` : 'Sent';
  else if (row.status === 'queued' || row.status === 'sending') when = OUTREACH_STATUS_LABEL[row.status];

  return (
    <article className="flex min-h-0 flex-col gap-4" aria-label="Message preview">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold text-fg">{row.lead?.title ?? 'Lead removed'}</h2>
          <span className="shrink-0"><LeadLink id={row.lead?.id} /></span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {row.lead?.status && <StatusBadge status={row.lead.status} />}
          <Badge>{stepLabel(row.step, days, row.channel)}</Badge>
          {row.channel === 'manual' && <Badge>Paste yourself</Badge>}
          {when && <span className="text-xs text-fg-subtle">{when}</span>}
        </div>
      </header>

      {(failed || held) && (
        <div role="alert" className="flex items-start gap-2 rounded-card border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 break-words">
            <span className="font-semibold">{failed ? 'Failed: ' : 'Held back: '}</span>
            {row.error ?? 'No reason was recorded.'}
          </p>
        </div>
      )}

      {row.warnings.length > 0 && (
        <Section title="Safety checks">
          <ul className="grid gap-1.5">
            {row.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className={cx('flex items-start gap-2 rounded-ctl border px-3 py-2 text-sm', WARNING_STYLE[w.level].box)}>
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  <span className="font-semibold">{WARNING_STYLE[w.level].label}: </span>
                  {w.message}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={row.channel === 'email' ? 'To' : 'Message for'}>
        <p className="break-all text-sm text-fg">{row.to_email ? `${row.to_name ? `${row.to_name} · ` : ''}${row.to_email}` : 'No email address yet. You will paste this message yourself.'}</p>
      </Section>

      <Section title="Subject and message">
        <div className="rounded-card border border-border bg-surface-2/60 p-3.5">
          {row.subject && <p className="mb-2 break-words text-sm font-semibold text-fg">{row.subject}</p>}
          <p className="max-h-[360px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-muted">{row.body ?? 'Empty message.'}</p>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {tab === 'review' && (
          <Button variant="primary" size="lg" leftIcon={<MailIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onReview(row.lead_id)}>
            Review &amp; send
          </Button>
        )}
        {tab === 'problems' && failed && (
          <Button variant="primary" size="lg" loading={retrying} leftIcon={<RefreshIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onRetry(row)}>
            Retry sending
          </Button>
        )}
        {tab === 'problems' && held && (
          <Button variant="primary" size="lg" leftIcon={<MailIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onReview(row.lead_id)}>
            Review &amp; fix
          </Button>
        )}
        {tab === 'queue' && cancellable && (
          <Button variant="danger" size="lg" onClick={() => onCancel(row)}>
            Cancel this email
          </Button>
        )}
        {tab === 'sent' && (
          <Button variant="secondary" onClick={() => onReview(row.lead_id)}>
            Open conversation
          </Button>
        )}
      </div>
    </article>
  );
}

export function ReplyPreview({
  reply,
  now,
  busy,
  onHandled,
  onLeadStatus,
  onCreateTask,
}: {
  reply: ReplyWithLead;
  now: number;
  busy: boolean;
  onHandled: (reply: ReplyWithLead) => void;
  onLeadStatus: (reply: ReplyWithLead, status: Status) => void;
  onCreateTask: (reply: ReplyWithLead) => void;
}) {
  const [full, setFull] = useState(false);
  const cat = REPLY_CATEGORY[reply.category];
  const when = reply.received_at ?? reply.created_at;
  const leadStatus = reply.lead?.status;

  return (
    <article className="flex min-h-0 flex-col gap-4" aria-label="Reply">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold text-fg">{reply.lead?.title ?? reply.subject ?? 'Reply'}</h2>
          <span className="shrink-0"><LeadLink id={reply.lead_id} /></span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={cat.tone}>{cat.label}</Badge>
          {!reply.handled ? <Badge tone="primary" dot>New</Badge> : <Badge>Handled</Badge>}
          {leadStatus && <StatusBadge status={leadStatus} />}
          <span className="text-xs text-fg-subtle" title={fmtDateTime(when)}>
            {timeAgo(when, now)}
          </span>
        </div>
        <p className="mt-2 break-all text-sm text-fg-muted">
          {replyDisplayName(reply)}
          {reply.from_name && reply.from_email ? ` <${reply.from_email}>` : ''}
        </p>
      </header>

      {reply.summary && (
        <Section title="In short">
          <p className="break-words text-sm leading-relaxed text-fg">{reply.summary}</p>
        </Section>
      )}

      {reply.body && (
        <Section title="Their message">
          {reply.subject && <p className="mb-1.5 break-words text-sm font-medium text-fg">{reply.subject}</p>}
          <p className={cx('whitespace-pre-wrap break-words rounded-card border border-border bg-surface-2/60 p-3.5 text-sm leading-relaxed text-fg-muted', full ? 'max-h-[480px] overflow-y-auto' : 'line-clamp-4')}>{reply.body}</p>
          <button type="button" onClick={() => setFull((v) => !v)} aria-expanded={full} className="btn mt-1.5 min-h-8 rounded-ctl text-sm font-medium text-primary-text hover:underline">
            {full ? 'Hide the full reply' : 'Read the full reply'}
          </button>
        </Section>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {!reply.handled && (
          <Button variant="primary" size="lg" loading={busy} onClick={() => onHandled(reply)}>
            Mark handled
          </Button>
        )}
        <Button variant="secondary" size="lg" leftIcon={<PlusIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onCreateTask(reply)}>
          Create task
        </Button>
        {reply.lead && leadStatus !== 'Won' && (
          <Button variant="secondary" size="lg" disabled={busy} onClick={() => onLeadStatus(reply, 'Won')}>
            Lead is a win
          </Button>
        )}
        {reply.lead && leadStatus !== 'Lost' && (
          <Button variant="secondary" size="lg" disabled={busy} onClick={() => onLeadStatus(reply, 'Lost')}>
            Lead is lost
          </Button>
        )}
      </div>
    </article>
  );
}
