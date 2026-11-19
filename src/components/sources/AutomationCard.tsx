"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import Advanced from '@/components/settings/Advanced';
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
      label: 'Background helper',
      value: ctx.workerOnline ? 'Running' : 'Offline',
      tone: ctx.workerOnline ? 'success' : 'danger',
      detail: ctx.workerOnline ? `Last check-in ${worker.last_seen ? timeAgo(worker.last_seen, ctx.now) : 'just now'}. It writes, sends and searches for you.` : worker.last_seen ? `Last seen ${timeAgo(worker.last_seen, ctx.now)}. Start it so sending and writing work.` : 'It has never checked in. Start it so sending and writing work.',
    },
    {
      label: 'AI writer',
      value: !ctx.workerOnline ? 'Unknown' : worker.claude.available ? 'Ready' : 'Missing',
      tone: !ctx.workerOnline ? 'neutral' : worker.claude.available ? 'success' : 'warning',
      detail: worker.claude.available ? `Writes emails for you${worker.claude.version ? ` (${worker.claude.version})` : ''}.` : 'Without it, messages are written from simple templates.',
    },
    {
      label: 'Lead finders',
      value: ctx.n8nOnline ? (errRecent ? 'Online, 1 failing' : 'Online') : 'Offline',
      tone: !ctx.n8nOnline ? 'danger' : errRecent ? 'warning' : 'success',
      detail: ctx.n8nOnline
        ? `Last check-in ${n8nSeen}.${errRecent && err ? ` ${err.workflow || 'A workflow'} failed${err.node ? ` at "${err.node}"` : ''}.` : ''}`
        : n8nSeen
          ? `Last check-in ${n8nSeen}. Start the lead finders so new leads arrive.`
          : 'No check-in yet. Start the lead finders (n8n).',
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
      title="Is everything running?"
      subtitle={allGood ? 'Everything that finds and sends leads is running.' : 'Something needs a look before leads can flow normally.'}
      actions={<Badge tone={allGood ? 'success' : 'warning'} dot>{allGood ? 'All good' : 'Needs a look'}</Badge>}
    >
      <Advanced id="sources-health" title="Show details" className="mt-0 border-t-0 pt-0">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((it) => (
          <Cell key={it.label} item={it} />
        ))}
      </div>
      </Advanced>
      {errRecent && err && (
        <div role="alert" className="mt-3 rounded-card border border-danger-border bg-danger-soft px-3.5 py-2.5 text-[13px] text-fg">
          <p className="font-semibold">
            Last lead finder failure: {err.workflow || 'unknown workflow'}
            {err.node ? ` / ${err.node}` : ''} <span className="font-normal text-fg-muted">({timeAgo(err.at as string, ctx.now)}, {ctx.n8n.errors_total} in total)</span>
          </p>
          <p className="mt-0.5 break-words text-fg-muted">{err.message}</p>
        </div>
      )}
    </Card>
  );
}
