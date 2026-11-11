"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRightIcon } from '@/components/Icons';
import { cx, Skeleton } from '@/components/ui';

/** Glass panel used by every dashboard widget: title, optional count/link, body. */
export function Panel({
  title,
  subtitle,
  href,
  linkLabel,
  aside,
  children,
  className,
  tone,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'accent';
}) {
  return (
    <section aria-label={title} className={cx('glass rounded-card p-4 sm:p-5', tone === 'accent' && 'border-l-2 !border-l-accent', className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-fg-subtle">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {aside}
          {href && (
            <Link href={href} className="inline-flex min-h-[28px] items-center gap-1 rounded-ctl px-1.5 text-[13px] font-medium text-primary-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [@media(pointer:coarse)]:min-h-[44px]">
              {linkLabel ?? 'View all'}
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Quiet empty state inside a panel. */
export function PanelEmpty({ icon, title, text, action }: { icon?: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="glass-subtle flex flex-col items-center rounded-card border-dashed px-4 py-7 text-center">
      {icon && <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-fg-subtle ring-1 ring-inset ring-border">{icon}</span>}
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mt-0.5 max-w-xs text-[13px] text-fg-subtle">{text}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('glass rounded-card p-4 sm:p-5', className)} aria-hidden="true">
      <Skeleton className="h-5 w-36" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export function TileSkeleton() {
  return (
    <div className="glass rounded-card p-3.5" aria-hidden="true">
      <Skeleton className="h-3.5 w-24" />
      <div className="mt-3 flex items-end justify-between">
        <Skeleton className="h-7 w-14" />
        <Skeleton className="h-6 w-[72px]" />
      </div>
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}
