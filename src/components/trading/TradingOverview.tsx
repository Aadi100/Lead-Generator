"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRightIcon, BuyersIcon, CatalogIcon, CheckCircleIcon, DealsIcon, MarketIcon, SellersIcon, SparklesIcon, SearchIcon } from '@/components/Icons';
import { PageHeader } from '@/components/shell';
import { Badge, Banner, Button, Card, CountUp, EmptyState, Reveal, Skeleton, Stagger, StatTile, TrustBadge } from '@/components/ui';
import { budgetLabel, itemLabel, timeAgo } from '@/lib/format';
import { useTradeDeals, useTradeLeads, useTradingSettings } from '@/lib/trading-data';
import { DAY_MS, hotDemand, leadTime, money, weeklyTrend } from '@/lib/trading-stats';
import { OPEN_DEAL_STAGES } from '@/lib/types-platform';
import type { Lead } from '@/lib/types';
import JobAction from './JobAction';
import { SuggestionGrid, useCatalogAdder } from './Suggestions';
import { TrendLines } from './TradeCharts';
import TradingNav from './TradingNav';

function perDay(leads: Lead[], pick: (l: Lead) => boolean, days = 14, now = Date.now()): number[] {
  const out = Array.from({ length: days }, () => 0);
  const startDay = new Date(now);
  startDay.setHours(0, 0, 0, 0);
  const base = startDay.getTime() - (days - 1) * DAY_MS;
  for (const l of leads) {
    if (!pick(l)) continue;
    const i = Math.floor((leadTime(l) - base) / DAY_MS);
    if (i >= 0 && i < days) out[i] += 1;
  }
  return out;
}

function ratioText(wanted: number, offered: number): string {
  if (offered === 0) return wanted > 0 ? 'No sellers' : 'No posts';
  if (wanted === 0) return 'Only sellers';
  const r = wanted / offered;
  return r >= 1 ? `${r.toFixed(1)}x more buyers` : `${(1 / r).toFixed(1)}x more sellers`;
}

export default function TradingOverview() {
  const { leads, loading, error, reload } = useTradeLeads();
  const { deals, loading: dealsLoading } = useTradeDeals();
  const { bundle, reload: reloadSettings } = useTradingSettings();

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const buyersWaiting = leads.filter((l) => l.trade_side === 'buyer' && l.status === 'New' && l.trade_match).length;
    const sellers = leads.filter((l) => l.trade_side === 'seller').length;
    const matches = leads.filter((l) => l.trade_match && l.status === 'New').length;
    const open = deals.filter((d) => (OPEN_DEAL_STAGES as string[]).includes(d.stage)).length;
    const done = deals.filter((d) => d.stage === 'done' && Date.parse(d.closed_at ?? d.updated_at) >= monthStart);
    const revenue = done.reduce((s, d) => s + (d.value ?? 0), 0);
    const profit = done.reduce((s, d) => s + (d.value ?? 0) - (d.cost ?? 0), 0);
    return {
      buyersWaiting,
      sellers,
      matches,
      open,
      revenue,
      profit,
      doneCount: done.length,
      buyerTrend: perDay(leads, (l) => l.trade_side === 'buyer' && !!l.trade_match),
      sellerTrend: perDay(leads, (l) => l.trade_side === 'seller'),
      matchTrend: perDay(leads, (l) => !!l.trade_match),
    };
  }, [leads, deals]);

  const hot = useMemo(() => hotDemand(bundle?.market.rows ?? [], leads), [bundle, leads]);
  const trend = useMemo(() => weeklyTrend(leads, 90, 4), [leads]);
  const matchFeed = useMemo(() => leads.filter((l) => l.trade_match && l.status === 'New').sort((a, b) => leadTime(b) - leadTime(a)).slice(0, 6), [leads]);

  const trading = bundle?.trading;
  const games = trading?.games ?? [];
  const adder = useCatalogAdder(() => void reloadSettings(), games);
  const hotRows = hot.rows.slice(0, 6);
  const tilesLoading = loading || dealsLoading;

  const entries = (trading?.i_sell.length ?? 0) + (trading?.i_want.length ?? 0);
  const subs = bundle?.state.subs_ok.length ?? 0;
  const discordOn = !!trading?.discord.enabled && trading.discord.channels.length > 0;
  const discordStatus = bundle?.integrations.status.discord;

  return (
    <div>
      <PageHeader
        title="Game Trading"
        subtitle="Buyers for what you sell, sellers of what you want, and how the market is moving."
        actions={
          <>
            <JobAction type="suggest_trading" label="Suggest what I can sell" runningText="Thinking it through" icon={<SparklesIcon className="h-4 w-4" />} successText={() => 'New ideas are ready.'} onDone={() => void reloadSettings()} />
            <JobAction type="trade_scan" label="Find trade leads now" runningText="Searching Reddit and Discord" variant="primary" icon={<SearchIcon className="h-4 w-4" />} successText={(r) => `Found ${Number(r?.inserted ?? 0)} new trade leads.`} onDone={() => void reload()} />
          </>
        }
      />
      <TradingNav />

      {error && (
        <Banner tone="danger" title="Could not load trade leads" className="mb-4" action={<Button size="sm" onClick={() => void reload()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      {/* Setup status strip */}
      {bundle && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-3.5 py-2.5 text-[13px]" aria-label="Setup status" role="group">
          <span className="font-medium text-fg">Setup</span>
          <Link href="/trading/catalog" className="rounded-full">
            <Badge tone={trading?.enabled ? 'success' : 'warning'} dot>
              {trading?.enabled ? 'Searching is on' : 'Searching is off'}
            </Badge>
          </Link>
          <Link href="/trading/catalog" className="rounded-full">
            <Badge tone={entries > 0 ? 'success' : 'warning'} dot>
              {entries > 0 ? `${entries} in my catalog` : 'Catalog is empty'}
            </Badge>
          </Link>
          <Badge tone={subs > 0 ? 'success' : 'neutral'} dot>
            {subs > 0 ? `${subs} Reddit communities` : 'Reddit not checked yet'}
          </Badge>
          <Badge tone={discordOn ? (discordStatus && !discordStatus.ok ? 'danger' : 'success') : 'neutral'} dot title={discordStatus?.message}>
            {discordOn ? (discordStatus && !discordStatus.ok ? 'Discord has a problem' : `Discord: ${trading?.discord.channels.length} channels`) : 'Discord is off'}
          </Badge>
          {(!trading?.enabled || entries === 0) && (
            <Link href="/trading/catalog" className="ml-auto inline-flex items-center gap-1 font-medium text-primary-text hover:underline">
              Finish setup <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {/* KPI tiles */}
      {tilesLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-card" />
          ))}
        </div>
      ) : (
        <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" step={35}>
          <StatTile label="Buyers waiting" value={<CountUp value={stats.buyersWaiting} />} sub="Match what you sell" tone="accent" trend={stats.buyerTrend} href="/trading/buyers?matched=1&status=New" icon={<BuyersIcon className="h-4 w-4" />} />
          <StatTile label="Sellers found" value={<CountUp value={stats.sellers} />} sub="Last 90 days" tone="info" trend={stats.sellerTrend} href="/trading/sellers" icon={<SellersIcon className="h-4 w-4" />} />
          <StatTile label="New matches" value={<CountUp value={stats.matches} />} sub="Fit your catalog" tone="primary" trend={stats.matchTrend} icon={<CheckCircleIcon className="h-4 w-4" />} />
          <StatTile label="Open trade deals" value={<CountUp value={stats.open} />} sub="Talking to paid" href="/deals" icon={<DealsIcon className="h-4 w-4" />} />
          <StatTile label="Revenue this month" value={<CountUp value={stats.revenue} format={(n) => money(n)} />} sub={`${stats.doneCount} finished ${stats.doneCount === 1 ? 'deal' : 'deals'}`} tone="success" href="/deals" />
          <StatTile label="Profit this month" value={<CountUp value={stats.profit} format={(n) => money(n)} />} sub="Revenue minus costs" tone={stats.profit < 0 ? 'danger' : 'success'} href="/deals" />
        </Stagger>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Hot demand */}
        <Reveal>
          <Card
            title="Hot demand"
            subtitle={hot.source === 'live' ? 'Games and items where many people want to buy and few sell (last 30 days)' : 'From the last market refresh'}
            actions={
              <Link href="/trading/market" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-text hover:underline">
                Full market <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : hotRows.length === 0 ? (
              <EmptyState icon={<MarketIcon className="h-5 w-5" />} title="No market data yet" text="It builds up over a few days as trade posts are found. Run a search to get started." className="border-0 py-8" />
            ) : (
              <>
                <p className="sr-only">
                  Hottest right now: {hotRows.slice(0, 3).map((r) => `${r.game} ${itemLabel(r.item_type)}, ${r.wanted} buyers and ${r.offered} sellers`).join('; ')}.
                </p>
                <ul aria-label="Hot demand by game and item" className="divide-y divide-border">
                  {hotRows.map((r) => (
                    <li key={`${r.game}|${r.item_type}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">{r.game}</p>
                        <p className="text-xs text-fg-subtle">
                          {itemLabel(r.item_type)}
                          {r.newBuyers7d > 0 && <span className="ml-1.5 font-medium text-accent-text">+{r.newBuyers7d} new buyers this week</span>}
                        </p>
                      </div>
                      <dl className="flex items-center gap-4 text-right text-[13px]">
                        <div>
                          <dt className="text-[11px] text-fg-subtle">Buyers</dt>
                          <dd className="font-num font-semibold text-fg">{r.wanted}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-fg-subtle">Sellers</dt>
                          <dd className="font-num font-semibold text-fg">{r.offered}</dd>
                        </div>
                        <div className="hidden sm:block">
                          <dt className="text-[11px] text-fg-subtle">Typical price</dt>
                          <dd className="font-num font-semibold text-fg">{money(r.median_price)}</dd>
                        </div>
                        <div className="min-w-[6.5rem]">
                          <dt className="sr-only">Balance</dt>
                          <dd>
                            <Badge tone={r.offered === 0 || (r.ratio ?? 0) >= 2 ? 'accent' : r.wanted >= r.offered ? 'primary' : 'neutral'}>{ratioText(r.wanted, r.offered)}</Badge>
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </Reveal>

        {/* New matches */}
        <Reveal delay={60}>
          <Card title="New matches" subtitle="Posts that fit something in your catalog" padding="md">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : matchFeed.length === 0 ? (
              <EmptyState
                icon={<CatalogIcon className="h-5 w-5" />}
                title="No new matches"
                text={entries === 0 ? 'List what you sell or want to buy and I will point out the posts that fit.' : 'Nothing new fits your catalog right now. Run a search to check again.'}
                action={
                  <Link href="/trading/catalog" className="btn inline-flex min-h-8 items-center rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2">
                    Open my catalog
                  </Link>
                }
                className="border-0 py-8"
              />
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {matchFeed.map((l) => (
                  <li key={l.id}>
                    <Link href={`/trading/${l.trade_side === 'seller' ? 'sellers' : 'buyers'}?lead=${l.id}`} className="flex items-start justify-between gap-3 rounded-ctl px-2 py-2.5 transition-colors duration-fast hover:bg-surface-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-medium text-fg">{l.title}</p>
                        <p className="truncate text-xs font-medium text-accent-text">{l.trade_match}</p>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          {l.trade_side === 'seller' ? 'Selling' : 'Wants to buy'} · {timeAgo(l.posted_at ?? l.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-num text-sm font-semibold text-fg">{budgetLabel(l) ?? '-'}</span>
                        <TrustBadge level={l.trust_level} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Reveal>
          <Card title="Price trend" subtitle="Typical (median) price per week for the busiest games, last 90 days" className="h-full">
            {loading ? (
              <Skeleton className="h-48" />
            ) : trend.series.length === 0 ? (
              <EmptyState icon={<MarketIcon className="h-5 w-5" />} title="Not enough prices yet" text="Lines appear once posts that state a price have been found over a few weeks." className="border-0 py-8" />
            ) : (
              <TrendLines trend={trend} />
            )}
          </Card>
        </Reveal>

        <Reveal delay={60}>
          <Card
            title="What you could sell"
            subtitle="Ideas based on what people ask for"
            className="h-full"
            actions={
              <Link href="/trading/market" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-text hover:underline">
                More ideas <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {!bundle ? (
              <Skeleton className="h-40" />
            ) : bundle.trading.suggestions && bundle.trading.suggestions.items.length > 0 ? (
              <SuggestionGrid suggestions={bundle.trading.suggestions} trading={bundle.trading} onAdd={adder.start} limit={2} />
            ) : (
              <EmptyState icon={<SparklesIcon className="h-5 w-5" />} title="No ideas yet" text="Press Suggest what I can sell. It works best after a few days of collected leads." className="border-0 py-8" />
            )}
          </Card>
        </Reveal>
      </div>

      {bundle && !bundle.trading.enabled && (
        <Banner tone="warning" className="mt-4" title="Game trading searching is off">
          <span className="inline-flex flex-wrap items-center gap-1">
            Switch it on in <Link href="/trading/catalog" className="font-medium text-primary-text hover:underline">My catalog</Link> so new posts are collected.
          </span>
        </Banner>
      )}
      {adder.drawer}
    </div>
  );
}
