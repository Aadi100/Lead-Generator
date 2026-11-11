"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Card, cx, type Tone } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import type { SourcesData } from '@/lib/sources-data';

type Item = { label: string; value: string; tone: Tone; detail: ReactNode; href?: string };

function Cell({ item }: { item: Item }) {
  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="text-[13px] whitespace-nowrap font-medium text-fg-subtle">{item.label}</p>
        <Badge tone={item.tone} dot>
          {item.value}
        </Badge>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{item.detail}</p>
    </>
  );
  const cls = 'block rounded-card border border-border bg-surface-2/60 p-3.5';
  return item.href ? (
    <Link href={item.href} className={cx(cls, 'transition-colors duration-fast hover:border-border-strong')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Top card: one glance at worker, Claude CLI, n8n, sending and missing keys. */
export function AutomationCard({ data }: { data: SourcesData }) {
  const { ctx, worker, sendingPaused, keysMissing } = data;
  const err = ctx.n8n.last_error;
  const errAt = err?.at ? Date.parse(err.at) : NaN;
  const errRecent = Number.isFinite(errAt) && ctx.now - errAt <= 24 * 3_600_000;
  const n8nSeen = ctx.n8n.last_seen ? timeAgo(ctx.n8n.last_seen, ctx.now) : null;

  const items: Item[] = [
    {
      label: 'Worker',
      value: ctx.workerOnline ? 'Online' : 'Offline',
      tone: ctx.workerOnline ? 'success' : 'danger',
      detail: ctx.workerOnline ? `Last check-in ${worker.last_seen ? timeAgo(worker.last_seen, ctx.now) : 'just now'}. Runs enrichment, drafts, sending and scans.` : worker.last_seen ? `Last seen ${timeAgo(worker.last_seen, ctx.now)}. Run npm run worker in the project folder.` : 'It has never checked in. Run npm run worker in the project folder.',
    },
    {
      label: 'Claude CLI',
      value: !ctx.workerOnline ? 'Unknown' : worker.claude.available ? 'Ready' : 'Missing',
      tone: !ctx.workerOnline ? 'neutral' : worker.claude.available ? 'success' : 'warning',
      detail: worker.claude.available ? `Writes emails with your Claude plan${worker.claude.version ? ` (${worker.claude.version})` : ''}.` : 'Without it, pitches are written from simple templates.',
    },
    {
      label: 'n8n scrapers',
      value: ctx.n8nOnline ? (errRecent ? 'Online, 1 failing' : 'Online') : 'Offline',
      tone: !ctx.n8nOnline ? 'danger' : errRecent ? 'warning' : 'success',
      detail: ctx.n8nOnline
        ? `Last heartbeat ${n8nSeen}.${errRecent && err ? ` ${err.workflow || 'A workflow'} failed${err.node ? ` at "${err.node}"` : ''}.` : ''}`
        : n8nSeen
          ? `Last heartbeat ${n8nSeen}. Start n8n so Reddit, Freelancer and other feeds run.`
          : 'No heartbeat yet. Start n8n and switch the Heartbeat workflow on.',
    },
    {
      label: 'Sending',
      value: sendingPaused ? 'Paused' : 'Active',
      tone: sendingPaused ? 'warning' : 'success',
      detail: sendingPaused ? 'Approved emails are held until you resume sending.' : 'Approved emails go out within your daily limit.',
      href: '/settings?tab=safety',
    },
    {
      label: 'Keys missing',
      value: String(keysMissing.length),
      tone: keysMissing.length ? 'warning' : 'success',
      detail: keysMissing.length ? keysMissing.join(', ') : 'Every source that needs a key has one.',
      href: '/settings?tab=connections',
    },
  ];

  const allGood = ctx.workerOnline && ctx.n8nOnline && !errRecent && !sendingPaused && keysMissing.length === 0;

  return (
    <Card
      title="Automation health"
      subtitle={allGood ? 'Everything that finds and sends leads is running.' : 'Something needs a look before leads can flow normally.'}
      actions={<Badge tone={allGood ? 'success' : 'warning'} dot>{allGood ? 'All systems go' : 'Needs attention'}</Badge>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((it) => (
          <Cell key={it.label} item={it} />
        ))}
      </div>
      {errRecent && err && (
        <div role="alert" className="mt-3 rounded-card border border-danger-border bg-danger-soft px-3.5 py-2.5 text-[13px] text-fg">
          <p className="font-semibold">
            Last n8n failure: {err.workflow || 'unknown workflow'}
            {err.node ? ` / ${err.node}` : ''} <span className="font-normal text-fg-muted">({timeAgo(err.at as string, ctx.now)}, {ctx.n8n.errors_total} in total)</span>
          </p>
          <p className="mt-0.5 break-words text-fg-muted">{err.message}</p>
        </div>
      )}
    </Card>
  );
}
