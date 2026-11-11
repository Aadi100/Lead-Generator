"use client";

import Link from 'next/link';
import { ActivityIcon, TradingIcon } from '@/components/Icons';
import { buttonClass, cx } from '@/components/ui';
import type { ActivityItem } from '@/lib/activity';
import type { DashModel, DashRaw } from '@/lib/dashboard-data';
import { timeAgo } from '@/lib/format';
import { Panel, PanelEmpty } from './Panel';

const KIND: Record<ActivityItem['kind'], { dot: string; label: string }> = {
  lead: { dot: 'bg-primary', label: 'Lead' },
  sent: { dot: 'bg-info-solid', label: 'Sent' },
  reply: { dot: 'bg-warning-solid', label: 'Reply' },
  deal: { dot: 'bg-success-solid', label: 'Deal' },
};

export function ActivityCard({ items, loading, error }: { items: ActivityItem[]; loading: boolean; error: string | null }) {
  return (
    <Panel title="Recent activity" subtitle="Latest leads, messages, replies and deals" href="/activity" linkLabel="Activity">
      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-ctl bg-surface-2" />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <PanelEmpty icon={<ActivityIcon className="h-5 w-5" />} title="Could not load activity" text={error} />
      ) : items.length === 0 ? (
        <PanelEmpty icon={<ActivityIcon className="h-5 w-5" />} title="Nothing has happened yet" text="New leads, sent messages and replies will line up here." />
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={it.href} className="flex items-start gap-3 rounded-ctl px-2 py-1.5 transition-colors duration-fast hover:bg-surface-2/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND[it.kind].dot)} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">
                    <span className="sr-only">{KIND[it.kind].label}: </span>
                    {it.title}
                  </span>
                  {it.detail && <span className="block truncate text-xs text-fg-subtle">{it.detail}</span>}
                </span>
                <span className="shrink-0 pt-0.5 text-xs text-fg-subtle">{timeAgo(it.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Num({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-ctl bg-surface-2/60 px-3 py-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <p className="font-num text-xl font-semibold leading-tight text-accent-text">{value}</p>
      <p className="text-xs text-fg-muted">{label}</p>
    </Link>
  );
}

export function TradingCard({ raw, trading }: { raw: DashRaw; trading: DashModel['trading'] }) {
  const enabled = raw.settings.trading.enabled;
  return (
    <Panel title="Game trading" subtitle="Buyers and sellers for what you trade" href={enabled ? '/trading' : undefined} linkLabel="Trading" tone="accent">
      {!enabled ? (
        <PanelEmpty
          icon={<TradingIcon className="h-5 w-5" />}
          title="Trading is switched off"
          text="Tell Lead Radar what you sell or want and it will find game buyers and sellers for you."
          action={
            <Link href="/trading/catalog" className={buttonClass('primary', 'sm')}>
              Set up trading
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Num label="Buyers waiting" value={trading.buyersWaiting} href="/trading/buyers" />
            <Num label="Sellers found" value={trading.sellers} href="/trading/sellers" />
            <Num label="Matched" value={trading.matched} href="/trading/buyers" />
          </div>
          <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">Hot games</h3>
          {trading.hot.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">No demand data yet. Run a market refresh from the Market page.</p>
          ) : (
            <ul className="space-y-1.5">
              {trading.hot.map((g) => (
                <li key={g.game} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-fg">{g.game}</span>
                  <span className="shrink-0 text-xs text-fg-muted">
                    <span className="font-num font-semibold text-fg">{g.wanted}</span> want · <span className="font-num font-semibold text-fg">{g.offered}</span> offer
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
