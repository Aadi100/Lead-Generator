"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { FeedItem, FeedKind } from '@/lib/activity-page';
import { fmtDateTime } from '@/lib/format';
import { ChevronRightIcon, DealsIcon, InboxIcon, LeadsIcon, SendIcon, TasksIcon } from '../Icons';
import { cx } from '../ui';

const KIND: Record<FeedKind, { icon: ReactNode; tone: string; label: string }> = {
  lead: { icon: <LeadsIcon className="h-4 w-4" aria-hidden="true" />, tone: 'bg-info-soft text-info', label: 'New lead found' },
  sent: { icon: <SendIcon className="h-4 w-4" aria-hidden="true" />, tone: 'bg-primary-soft text-primary-text', label: 'Message sent' },
  reply: { icon: <InboxIcon className="h-4 w-4" aria-hidden="true" />, tone: 'bg-success-soft text-success', label: 'Someone replied' },
  deal: { icon: <DealsIcon className="h-4 w-4" aria-hidden="true" />, tone: 'bg-warning-soft text-warning', label: 'Deal update' },
  task: { icon: <TasksIcon className="h-4 w-4" aria-hidden="true" />, tone: 'bg-surface-2 text-fg-muted', label: 'Task done' },
};

export function kindMeta(k: FeedKind) {
  return KIND[k];
}

export default function FeedItemRow({ item, fresh }: { item: FeedItem; fresh?: boolean }) {
  const meta = KIND[item.kind];
  const time = new Date(item.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <li className={cx(fresh && 'row-new')}>
      <Link
        href={item.href}
        className="btn group flex min-h-[3.25rem] items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5 transition-colors duration-fast hover:border-border-strong hover:bg-surface-2"
      >
        <span className={cx('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.tone)}>
          {meta.icon}
          <span className="sr-only">{meta.label}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{item.title}</span>
          <span className="block truncate text-[13px] text-fg-subtle">
            <span className="font-medium text-fg-muted">{meta.label}</span>
            {item.detail ? ` · ${item.detail}` : ''}
          </span>
        </span>
        <time dateTime={item.at} title={fmtDateTime(item.at)} className="font-num shrink-0 text-xs text-fg-subtle">
          {time}
        </time>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}
