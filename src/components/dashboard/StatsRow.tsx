"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CountUp, Sparkline, Stagger, cx } from '@/components/ui';
import type { DashModel, Stat } from '@/lib/dashboard-data';
import { TileSkeleton } from './Panel';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
const TEXT: Record<Tone, string> = { primary: 'text-primary-text', success: 'text-success', warning: 'text-warning', danger: 'text-danger', info: 'text-info', accent: 'text-accent-text' };

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function Tile({ className, label, stat, tone, href, sub, format, icon }: { className?: string; label: string; stat: Stat; tone: Tone; href: string; sub: string; format?: (n: number) => string; icon: ReactNode }) {
  const total = stat.series.reduce((s, v) => s + v, 0);
  return (
    <Link href={href} className={cx('glass lift group block h-full rounded-card p-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', className)} aria-label={`${label}: ${format ? format(stat.value) : stat.value}. ${sub}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-fg-muted">{label}</p>
        <span className={cx('shrink-0', TEXT[tone])}>{icon}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={cx('font-num text-[28px] font-semibold leading-none', stat.value === 0 ? 'text-fg' : TEXT[tone])}>
          <CountUp value={stat.value} format={format} />
        </p>
        {total !== 0 ? (
          <Sparkline values={stat.series} width={72} height={26} tone={tone} label={`${label}, last 14 days`} />
        ) : (
          <span className="mb-1 h-px w-[72px] bg-border-strong" aria-hidden="true" />
        )}
      </div>
      <p className="mt-2 truncate text-xs text-fg-subtle">{sub}</p>
    </Link>
  );
}

const ico = 'h-4 w-4';
const I = {
  leads: (
    <svg viewBox="0 0 24 24" className={ico} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" className={ico} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  ),
  draft: (
    <svg viewBox="0 0 24 24" className={ico} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  ),
  reply: (
    <svg viewBox="0 0 24 24" className={ico} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14 4 9l5-5M4 9h9a7 7 0 0 1 7 7v3" />
    </svg>
  ),
  deal: (
    <svg viewBox="0 0 24 24" className={ico} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  money: (
    <svg viewBox="0 0 24 24" className={ico} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v18M16 7.5C15 6.4 13.6 6 12 6c-2 0-3.5 1-3.5 2.5S10 11 12 11.5s3.5 1 3.5 2.5S14 18 12 18c-1.7 0-3.2-.5-4.2-1.6" />
    </svg>
  ),
  trend: (
    <svg viewBox="0 0 24 24" className={ico} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />
    </svg>
  ),
};

export function StatsRow({ model, loading }: { model: DashModel | null; loading: boolean }) {
  if (loading || !model) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7 [&>*:last-child]:col-span-2 2xl:[&>*:last-child]:col-span-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
    );
  }
  const s = model.stats;
  const dealSub = model.hasDeals ? 'Deals in progress' : 'No deals yet';
  return (
    <Stagger step={45} className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7 [&>*]:min-w-0 [&>*:last-child]:col-span-2 2xl:[&>*:last-child]:col-span-1 [&>*>a]:h-full">
      <Tile label="New leads (24 h)" stat={s.newLeads} tone="primary" href="/leads" sub="Found in the last day" icon={I.leads} />
      <Tile label="High-match leads" stat={s.highMatch} tone="success" href="/leads?status=New&sort=fit" sub="Fit 70+ and still new" icon={I.star} />
      <Tile label="Drafts to review" stat={s.drafts} tone="info" href="/outbox" sub="Messages waiting for you" icon={I.draft} />
      <Tile label="Replies waiting" stat={s.replies} tone={s.replies.value > 0 ? 'warning' : 'primary'} href="/outbox?tab=replies" sub="People who wrote back" icon={I.reply} />
      <Tile label="Open deals" stat={s.openDeals} tone="accent" href="/deals" sub={dealSub} icon={I.deal} />
      <Tile label="Revenue this month" stat={s.revenue} tone="success" href="/deals" sub="Finished deals" format={money} icon={I.money} />
      <Tile label="Profit this month" stat={s.profit} tone={s.profit.value < 0 ? 'danger' : 'success'} href="/deals" sub="Value minus cost" format={money} icon={I.trend} />
    </Stagger>
  );
}
