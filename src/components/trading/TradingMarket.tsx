"use client";

import { useMemo } from 'react';
import { InfoIcon, MarketIcon, SparklesIcon } from '@/components/Icons';
import { PageHeader } from '@/components/shell';
import { Badge, Banner, Button, Card, EmptyState, Reveal, Skeleton, Table, THead, Td, Th, Tr } from '@/components/ui';
import { fmtDateTime, itemLabel } from '@/lib/format';
import { useTradeLeads, useTradingSettings } from '@/lib/trading-data';
import { hotDemand, leadTime, money, weeklyTrend } from '@/lib/trading-stats';
import { useUrlParams } from '@/lib/trading-url';
import JobAction from './JobAction';
import { SuggestionGrid, useCatalogAdder } from './Suggestions';
import { PairedBars, TrendLines } from './TradeCharts';
import PriceTracker from './PriceTracker';
import TradingNav from './TradingNav';
import Advanced from '@/components/settings/Advanced';

type Col = 'game' | 'item' | 'wanted' | 'offered' | 'ratio' | 'price';

function ratioLabel(wanted: number, offered: number): string {
  if (offered === 0) return wanted > 0 ? 'No sellers' : '-';
  if (wanted === 0) return 'Only sellers';
  const r = wanted / offered;
  return r >= 1 ? `${r.toFixed(1)}x buyers` : `${(1 / r).toFixed(1)}x sellers`;
}

export default function TradingMarket() {
  const { leads, loading, error, reload } = useTradeLeads();
  const { bundle, reload: reloadSettings } = useTradingSettings();
  const { get, set } = useUrlParams();
  const sortCol = (['game', 'item', 'wanted', 'offered', 'ratio', 'price'].includes(get('sort')) ? get('sort') : 'ratio') as Col;
  const dir = get('dir') === 'asc' ? 'asc' : 'desc';

  const hot = useMemo(() => hotDemand(bundle?.market.rows ?? [], leads), [bundle, leads]);
  const trend = useMemo(() => weeklyTrend(leads, 90, 4), [leads]);
  const rows = useMemo(() => {
    const val = (r: (typeof hot.rows)[number]): string | number =>
      sortCol === 'game' ? r.game.toLowerCase() : sortCol === 'item' ? itemLabel(r.item_type) : sortCol === 'wanted' ? r.wanted : sortCol === 'offered' ? r.offered : sortCol === 'price' ? r.median_price ?? -1 : r.ratio ?? 0;
    const out = [...hot.rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y);
      return dir === 'asc' ? c : -c;
    });
    return out;
  }, [hot, sortCol, dir]);
  const chartRows = useMemo(() => [...hot.rows].sort((a, b) => b.wanted + b.offered - (a.wanted + a.offered)).slice(0, 8), [hot]);

  const coverage = useMemo(() => {
    const bySource = new Map<string, number>();
    let oldest = Infinity;
    for (const l of leads) {
      bySource.set(l.source_detail ?? l.source, (bySource.get(l.source_detail ?? l.source) ?? 0) + 1);
      oldest = Math.min(oldest, leadTime(l));
    }
    const days = Number.isFinite(oldest) ? Math.max(1, Math.ceil((Date.now() - oldest) / 86_400_000)) : 0;
    return { days, sources: Array.from(bySource, ([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 8), total: leads.length };
  }, [leads]);

  const games = bundle?.trading.games ?? [];
  const adder = useCatalogAdder(() => void reloadSettings(), games);

  const sortBy = (c: Col) => set(sortCol === c ? { dir: dir === 'asc' ? 'desc' : 'asc' } : { sort: c, dir: c === 'game' || c === 'item' ? 'asc' : 'desc' });
  const aria = (c: Col) => (sortCol === c ? dir : null);

  return (
    <div>
      <PageHeader
        title="Market"
        subtitle="Typical prices for each game item, and how many people want or sell it."
        actions={<JobAction type="suggest_trading" label="Refresh market" variant="primary" runningText="Updating the numbers" icon={<MarketIcon className="h-4 w-4" />} successText={() => 'Market numbers and ideas are updated.'} onDone={() => { void reloadSettings(); void reload(); }} />}
      />
      <TradingNav />

      {error && (
        <Banner tone="danger" title="Could not load trade leads" className="mb-4" action={<Button size="sm" onClick={() => void reload()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
      ) : hot.rows.length === 0 ? (
        <EmptyState
          icon={<MarketIcon className="h-5 w-5" />}
          title="No market data yet"
          text="Prices build up over a few days as trade posts are found. Run a search to get started."
          action={<JobAction type="trade_scan" label="Find leads now" runningText="Searching" variant="primary" successText={(r) => `Found ${Number(r?.inserted ?? 0)} new trade leads.`} onDone={() => void reload()} />}
        />
      ) : (
        <>
          <Reveal>
            <Card title="All games and items" subtitle="Click a column heading to sort" padding="none">
              <Table caption="Buyers, sellers, demand and typical price by game and item" className="!rounded-t-none !border-0">
                <THead>
                  <tr>
                    <Th sort={aria('game')} onSort={() => sortBy('game')}>Game</Th>
                    <Th sort={aria('item')} onSort={() => sortBy('item')}>Item</Th>
                    <Th align="right" sort={aria('wanted')} onSort={() => sortBy('wanted')}>Buyers</Th>
                    <Th align="right" sort={aria('offered')} onSort={() => sortBy('offered')}>Sellers</Th>
                    <Th align="right" sort={aria('ratio')} onSort={() => sortBy('ratio')}>Demand</Th>
                    <Th align="right" sort={aria('price')} onSort={() => sortBy('price')}>Typical price</Th>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((r) => (
                    <Tr key={`${r.game}|${r.item_type}`}>
                      <Td className="font-medium text-fg">{r.game}</Td>
                      <Td className="text-fg-muted">{itemLabel(r.item_type)}</Td>
                      <Td numeric>{r.wanted}</Td>
                      <Td numeric>{r.offered}</Td>
                      <Td align="right">
                        <Badge tone={r.offered === 0 || (r.ratio ?? 0) >= 2 ? 'accent' : r.wanted >= r.offered ? 'primary' : 'neutral'}>{ratioLabel(r.wanted, r.offered)}</Badge>
                      </Td>
                      <Td numeric>{money(r.median_price)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </Reveal>
          <Advanced id="market-charts" title="Show charts" hint="Buyers versus sellers, and the weekly price trend.">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Reveal>
              <Card title="Demand and supply" subtitle="People who want to buy versus people selling, last 30 days" >
                <PairedBars rows={chartRows} label="Buyers and sellers by game and item" />
              </Card>
            </Reveal>
            <Reveal delay={60}>
              <Card title="Price trend" subtitle="Typical (median) price per week, last 90 days" className="h-full">
                {trend.series.length === 0 ? (
                  <EmptyState icon={<MarketIcon className="h-5 w-5" />} title="Not enough prices yet" text="Lines appear once posts that state a price have been found over a few weeks." className="border-0 py-8" />
                ) : (
                  <TrendLines trend={trend} />
                )}
              </Card>
            </Reveal>
          </div>

          </Advanced>
        </>
      )}

      <PriceTracker />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Reveal>
          <Card title="What you could sell" subtitle="Ideas from what people ask for, plus general knowledge" className="h-full">
            {!bundle ? (
              <Skeleton className="h-40" />
            ) : bundle.trading.suggestions && bundle.trading.suggestions.items.length > 0 ? (
              <SuggestionGrid suggestions={bundle.trading.suggestions} trading={bundle.trading} onAdd={adder.start} />
            ) : (
              <EmptyState icon={<SparklesIcon className="h-5 w-5" />} title="No ideas yet" text="Press Refresh market. It works best after a few days of collected leads." className="border-0 py-8" />
            )}
          </Card>
        </Reveal>
        <Reveal delay={60}>
          <Card title="How much data is behind this" className="h-full" >
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Posts counted</dt>
                <dd className="font-num font-semibold text-fg">{coverage.total}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Days of data</dt>
                <dd className="font-num font-semibold text-fg">{coverage.days}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Market updated</dt>
                <dd className="text-right text-fg">{bundle?.market.generated_at ? fmtDateTime(bundle.market.generated_at) : 'Not yet'}</dd>
              </div>
            </dl>
            {coverage.sources.length > 0 && (
              <>
                <p className="mb-1.5 mt-3 text-xs font-medium text-fg-subtle">Where the posts came from</p>
                <ul className="flex flex-wrap gap-1.5">
                  {coverage.sources.map((s) => (
                    <li key={s.name}>
                      <Badge>
                        {s.name} <span className="font-num opacity-80">{s.n}</span>
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-3 flex items-start gap-2 text-xs text-fg-subtle">
              <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Only public Reddit posts and trade leads you captured by hand are counted, so treat this as a hint, not the whole market. Prices are guesses taken from the post text.
            </p>
          </Card>
        </Reveal>
      </div>
      {adder.drawer}
    </div>
  );
}
