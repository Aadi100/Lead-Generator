"use client";

import { useState } from 'react';
import Link from 'next/link';
import type { OutreachWithLead, ReplyWithLead } from '@/lib/outreach';
import { OUTREACH_STATUS_LABEL, stepLabel } from '@/lib/outreach';
import { REPLY_CATEGORY, WARNING_STYLE, replyDisplayName, type OutboxTab } from '@/lib/outbox-model';
import { fmtDateTime, timeAgo, timeUntil } from '@/lib/format';
import type { Status } from '@/lib/types';
import { ASSIST_CATEGORY } from '@/lib/reply-assist';
import { AlertIcon, ChevronIcon, ExternalIcon, MailIcon, MoreIcon, PlusIcon, RefreshIcon } from '../Icons';
import { Badge, Button, MenuItem, Popover, cx } from '../ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[13px] font-semibold text-fg-subtle">{title}</h3>
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
        <p className="mt-1 text-sm text-fg-subtle">
          {stepLabel(row.step, days, row.channel)}
          {when ? ` · ${when}` : ''}
        </p>
      </header>

      {(failed || held) && (
        <div role="alert" className="flex items-start gap-2 rounded-card border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 break-words">
            <span className="font-semibold">{failed ? 'This email did not go out. ' : 'This email was held back. '}</span>
            {row.error ?? 'No reason was recorded.'}
            <span className="mt-0.5 block text-[13px] opacity-90">{failed ? 'What to do: press Retry sending. If it fails again, check your Email account in Settings.' : 'What to do: press Review & fix, check the points above, then send again.'}</span>
          </p>
        </div>
      )}

      {row.warnings.length > 0 && (
        <Section title="Before you send">
          <ul className="grid gap-1.5">
            {row.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className={cx('flex items-start gap-2 rounded-ctl border px-3 py-2 text-sm', WARNING_STYLE[w.level].box)}>
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  <span className="font-semibold">{WARNING_STYLE[w.level].label}: </span>
                  {w.message}
                  <span className="mt-0.5 block text-[13px] opacity-90">What to do: {WARNING_STYLE[w.level].advice}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={row.channel === 'email' ? 'Going to' : 'Message for'}>
        <p className="break-all text-sm text-fg">{row.to_email ? `${row.to_name ? `${row.to_name} · ` : ''}${row.to_email}` : 'No email address yet. Copy the message and send it yourself (for example in a DM).'}</p>
      </Section>

      <Section title="What it says">
        <div className="rounded-card border border-border bg-surface-2/60 p-3.5">
          {row.subject && <p className="mb-2 break-words text-sm font-semibold text-fg">{row.subject}</p>}
          <p className="max-h-[360px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-muted">{row.body ?? 'Empty message.'}</p>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {tab === 'review' && (
          <Button variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-[200px]" leftIcon={<MailIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => onReview(row.lead_id)}>
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
  assist,
}: {
  reply: ReplyWithLead;
  now: number;
  busy: boolean;
  onHandled: (reply: ReplyWithLead) => void;
  onLeadStatus: (reply: ReplyWithLead, status: Status) => void;
  onCreateTask: (reply: ReplyWithLead) => void;
  /** The reply assistant card (classification, next step, drafted answer). */
  assist?: React.ReactNode;
}) {
  const [full, setFull] = useState(false);
  const cat = REPLY_CATEGORY[reply.category];
  const chip = reply.assist && reply.assist.classification !== 'out_of_office' ? ASSIST_CATEGORY[reply.assist.classification] : cat;
  const when = reply.received_at ?? reply.created_at;
  const leadStatus = reply.lead?.status;

  return (
    <article className="flex min-h-0 flex-col gap-4" aria-label="Reply">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold text-fg">{reply.lead?.title ?? reply.subject ?? 'Reply'}</h2>
          <span className="shrink-0"><LeadLink id={reply.lead_id} /></span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={chip.tone}>{chip.label}</Badge>
          {!reply.handled && <span className="text-xs font-medium text-primary-text">New</span>}
          {reply.handled && <span className="text-xs text-fg-subtle">Handled</span>}
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
        <Section title="What they said, in short">
          <p className="break-words text-sm leading-relaxed text-fg">{reply.summary}</p>
        </Section>
      )}

      {reply.body && (
        <Section title="Their full message">
          {reply.subject && <p className="mb-1.5 break-words text-sm font-medium text-fg">{reply.subject}</p>}
          <p className={cx('whitespace-pre-wrap break-words rounded-card border border-border bg-surface-2/60 p-3.5 text-sm leading-relaxed text-fg-muted', full ? 'max-h-[480px] overflow-y-auto' : 'line-clamp-4')}>{reply.body}</p>
          <button type="button" onClick={() => setFull((v) => !v)} aria-expanded={full} className="btn mt-1.5 min-h-8 rounded-ctl text-sm font-medium text-primary-text hover:underline">
            {full ? 'Hide the full reply' : 'Read the full reply'}
          </button>
        </Section>
      )}

      {assist}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {!reply.handled && (
          <Button variant="primary" size="lg" loading={busy} onClick={() => onHandled(reply)}>
            Mark as handled
          </Button>
        )}
        <Popover
          role="menu"
          align="start"
          width="w-56"
          label="More actions for this reply"
          trigger={({ open: _o, ...p }) => (
            <Button {...p} variant="ghost" size="lg" leftIcon={<MoreIcon className="h-4 w-4" />} rightIcon={<ChevronIcon className="h-4 w-4" />}>
              More
            </Button>
          )}
        >
          {(close) => (
            <div className="p-1.5">
              <MenuItem icon={<PlusIcon className="h-4 w-4" />} onClick={() => { onCreateTask(reply); close(); }}>
                Add a follow-up task
              </MenuItem>
              {reply.lead && leadStatus !== 'Won' && (
                <MenuItem disabled={busy} onClick={() => { onLeadStatus(reply, 'Won'); close(); }}>
                  Mark lead as won
                </MenuItem>
              )}
              {reply.lead && leadStatus !== 'Lost' && (
                <MenuItem disabled={busy} onClick={() => { onLeadStatus(reply, 'Lost'); close(); }}>
                  Mark lead as lost
                </MenuItem>
              )}
            </div>
          )}
        </Popover>
      </div>
    </article>
  );
}
