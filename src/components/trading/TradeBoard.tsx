"use client";

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { PageHeader } from '@/components/shell';
import { BuyersIcon, FilterIcon, SearchIcon, SellersIcon } from '@/components/Icons';
import { Banner, Button, Checkbox, EmptyState, Input, Select, SkeletonRows, Tabs, cx } from '@/components/ui';
import { budgetLabel, itemLabel, timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { usePriceRates, useStock } from '@/lib/stock-data';
import { matchStock } from '../../../worker/lib/stock-match.mjs';
import { useTradeLeads, useTradingSettings } from '@/lib/trading-data';
import { entryForLead, leadTime, priceVsLimit } from '@/lib/trading-stats';
import { useUrlParams } from '@/lib/trading-url';
import { STATUSES, type Lead, type Status, type TradeSide } from '@/lib/types';
import JobAction from './JobAction';
import { PriceVerdictBadge } from './PriceVsMarket';
import { askVsBudget } from './StockForBuyer';
import { PriceChip } from './TradeLeadDetail';
import TradeLeadDetail from './TradeLeadDetail';
import TradingNav from './TradingNav';
import { PlainTrust } from './TradeTags';
import Advanced from '@/components/settings/Advanced';

const PAGE = 40;
const TRUSTS = ['All', 'High', 'Medium', 'Low', 'Suspicious'] as const;
type SortKey = 'best' | 'newest' | 'price_low' | 'price_high' | 'trust';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'best', label: 'Best match' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_low', label: 'Price: low to high' },
  { id: 'price_high', label: 'Price: high to low' },
  { id: 'trust', label: 'Most trusted' },
];

type Filters = { q: string; game: string; item: string; min: string; max: string; matched: boolean; trust: string; status: string; source: string; sort: SortKey };

function count<T>(items: T[], key: (t: T) => string | null): { value: string; n: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m, ([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

function passes(l: Lead, f: Filters, matchedIds: Set<string> | null, skip?: 'status'): boolean {
  if (f.q) {
    const hay = `${l.title} ${l.game ?? ''} ${l.author ?? ''} ${l.source_detail ?? ''}`.toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  if (f.game && (l.game ?? '').toLowerCase() !== f.game.toLowerCase()) return false;
  if (f.item && l.item_type !== f.item) return false;
  const min = f.min.trim() === '' ? null : Number(f.min);
  const max = f.max.trim() === '' ? null : Number(f.max);
  if (min !== null && Number.isFinite(min) && (l.budget_amount === null || l.budget_amount < min)) return false;
  if (max !== null && Number.isFinite(max) && (l.budget_amount === null || l.budget_amount > max)) return false;
  if (f.matched && !(matchedIds ? matchedIds.has(l.id) : !!l.trade_match)) return false;
  if (f.trust === 'Suspicious' ? !l.is_suspicious : f.trust && l.trust_level !== f.trust) return false;
  if (skip !== 'status' && f.status && l.status !== f.status) return false;
  if (f.source && l.source !== f.source) return false;
  return true;
}

function sortLeads(list: Lead[], sort: SortKey, matchedIds: Set<string> | null): Lead[] {
  const out = [...list];
  const best = (a: Lead, b: Lead) =>
    Number(matchedIds ? matchedIds.has(b.id) : !!b.trade_match) - Number(matchedIds ? matchedIds.has(a.id) : !!a.trade_match) || (b.fit_score ?? 0) - (a.fit_score ?? 0) || (b.trust_score ?? 0) - (a.trust_score ?? 0) || leadTime(b) - leadTime(a);
  if (sort === 'newest') out.sort((a, b) => leadTime(b) - leadTime(a));
  else if (sort === 'price_low') out.sort((a, b) => (a.budget_amount ?? Infinity) - (b.budget_amount ?? Infinity));
  else if (sort === 'price_high') out.sort((a, b) => (b.budget_amount ?? -1) - (a.budget_amount ?? -1));
  else if (sort === 'trust') out.sort((a, b) => (b.trust_score ?? 0) - (a.trust_score ?? 0) || leadTime(b) - leadTime(a));
  else out.sort(best);
  return out;
}

/** Master-detail list of trade leads for one side: buyers (customers) or sellers (suppliers). */
export default function TradeBoard({ side }: { side: TradeSide }) {
  const { pushToast } = useShell();
  const { get, set } = useUrlParams();
  const { leads: all, loading, error, reload, patchLocal } = useTradeLeads();
  const { bundle } = useTradingSettings();
  const { items: stockItems } = useStock();
  const { rates } = usePriceRates();
  const [visible, setVisible] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);

  const isBuyer = side === 'buyer';
  const f: Filters = {
    q: get('q'),
    game: get('game'),
    item: get('item'),
    min: get('min'),
    max: get('max'),
    matched: get('matched') === '1',
    trust: get('trust'),
    status: get('status'),
    source: get('source'),
    sort: (SORTS.some((s) => s.id === get('sort')) ? get('sort') : 'best') as SortKey,
  };
  const leadId = get('lead');

  const mine = useMemo(() => all.filter((l) => l.trade_side === side), [all, side]);
  // With stock rows, buyer matches come from items in stock (live); otherwise the catalog label saved by the worker is used.
  const stockMode = isBuyer && stockItems.some((s) => s.status !== 'archived');
  const stockMatches = useMemo(() => {
    const out = new Map<string, ReturnType<typeof matchStock>[number]>();
    if (!stockMode) return out;
    for (const l of mine) {
      const m = matchStock(l, stockItems, { rates })[0];
      if (m) out.set(l.id, m);
    }
    return out;
  }, [stockMode, mine, stockItems, rates]);
  const matchedIds = useMemo(() => (stockMode ? new Set(stockMatches.keys()) : null), [stockMode, stockMatches]);
  const inStockCount = useMemo(() => stockItems.filter((s) => s.status === 'in_stock' && s.quantity > 0).length, [stockItems]);
  const games = useMemo(() => count(mine, (l) => l.game), [mine]);
  const items = useMemo(() => count(mine, (l) => l.item_type), [mine]);
  const sources = useMemo(() => count(mine, (l) => l.source), [mine]);
  const inScope = useMemo(() => mine.filter((l) => passes(l, f, matchedIds, 'status')), [mine, matchedIds, f.q, f.game, f.item, f.min, f.max, f.matched, f.trust, f.source]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => sortLeads(inScope.filter((l) => !f.status || l.status === f.status), f.sort, matchedIds), [inScope, f.status, f.sort, matchedIds]);
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of inScope) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [inScope]);

  const selected = leadId ? all.find((l) => l.id === leadId) ?? null : null;
  const activeFilters = [f.q, f.game, f.item, f.min, f.max, f.matched ? '1' : '', f.trust, f.source].filter(Boolean).length;

  const update = (patch: Record<string, string | null>) => {
    setVisible(PAGE);
    set(patch);
  };

  const updateLead = useCallback(
    async (id: string, patch: Partial<Lead>, failure: string): Promise<boolean> => {
      const before = all.find((l) => l.id === id);
      const rollback: Partial<Lead> = {};
      for (const k of Object.keys(patch) as (keyof Lead)[]) (rollback as Record<string, unknown>)[k] = before ? before[k] : null;
      patchLocal(id, patch);
      const { data, error: err } = await supabase.from('leads').update(patch).eq('id', id).select('id');
      if (err || !data || data.length === 0) {
        patchLocal(id, rollback);
        pushToast('error', `${failure}${err ? `: ${err.message}` : ': the change was not saved.'}`);
        return false;
      }
      return true;
    },
    [all, patchLocal, pushToast],
  );

  const title = isBuyer ? 'Buyers' : 'Sellers';
  const subtitle = isBuyer
    ? 'People who want something you sell.'
    : 'People selling something you want to buy.';
  const Icon = isBuyer ? BuyersIcon : SellersIcon;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<JobAction type="trade_scan" label="Find leads now" runningText="Searching" variant="primary" successText={(r) => `Found ${Number(r?.inserted ?? 0)} new trade leads.`} onDone={() => void reload()} />}
      />
      <TradingNav />

      {isBuyer && !loading && (
        <p className="mb-3 px-1 text-[13px] text-fg-muted">
          {stockMode ? (
            <>Matching buyers to your <Link href="/trading/stock" className="font-medium text-primary-text hover:underline">stock</Link>: {inStockCount} {inStockCount === 1 ? 'item is' : 'items are'} in stock. Sold or reserved items are not matched.</>
          ) : (
            <>You have no stock yet, so buyers are matched to your catalog. <Link href="/trading/stock" className="font-medium text-primary-text hover:underline">Add stock</Link> to match only what you really hold.</>
          )}
        </p>
      )}

      {error && (
        <Banner tone="danger" title="Could not load trade leads" className="mb-4" action={<Button size="sm" onClick={() => void reload()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      <div className={cx('grid gap-4 lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)] lg:items-start', 'xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]')}>
        <div className={cx('min-w-0', selected && 'hidden lg:block')}>
          <div className="rounded-card border border-border bg-surface p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
                <Input aria-label={`Search ${title.toLowerCase()}`} className="pl-8" placeholder="Search title, game or name" value={f.q} onChange={(e) => update({ q: e.target.value })} />
              </div>
              <Button className="lg:hidden" aria-expanded={showFilters} leftIcon={<FilterIcon className="h-4 w-4" />} onClick={() => setShowFilters((v) => !v)}>
                Filters{activeFilters ? ` (${activeFilters})` : ''}
              </Button>
            </div>
            <div className={cx('mt-3 grid-cols-2 gap-2', showFilters ? 'grid' : 'hidden', 'lg:grid')}>
              <Select aria-label="Game" value={f.game} onChange={(e) => update({ game: e.target.value })}>
                <option value="">All games</option>
                {games.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.value} ({g.n})
                  </option>
                ))}
              </Select>
              <Select aria-label="Kind of item" value={f.item} onChange={(e) => update({ item: e.target.value })}>
                <option value="">All kinds of item</option>
                {items.map((g) => (
                  <option key={g.value} value={g.value}>
                    {itemLabel(g.value)} ({g.n})
                  </option>
                ))}
              </Select>
              <Select aria-label="Sort by" value={f.sort} onChange={(e) => update({ sort: e.target.value })}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <div className="col-span-2">
                <Checkbox checked={f.matched} onChange={(v) => update({ matched: v ? '1' : null })} label={stockMode ? 'Matches my stock only' : 'Matches my catalog only'} />
              </div>
            </div>
            <Advanced id="trade-filters" title="More filters" className="mt-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Lowest price" type="number" min={0} inputMode="decimal" placeholder="Price from ($)" value={f.min} onChange={(e) => update({ min: e.target.value })} />
              <Input aria-label="Highest price" type="number" min={0} inputMode="decimal" placeholder="Price up to ($)" value={f.max} onChange={(e) => update({ max: e.target.value })} />
              <Select aria-label="Trust" value={f.trust} onChange={(e) => update({ trust: e.target.value })}>
                {TRUSTS.map((t) => (
                  <option key={t} value={t === 'All' ? '' : t}>
                    {t === 'All' ? 'Any trust level' : t === 'Suspicious' ? 'Be careful only' : t === 'High' ? 'Looks real' : t === 'Medium' ? 'Check first' : 'Be careful (low)'}
                  </option>
                ))}
              </Select>
              <Select aria-label="Source" value={f.source} onChange={(e) => update({ source: e.target.value })}>
                <option value="">All sources</option>
                {sources.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.value} ({g.n})
                  </option>
                ))}
              </Select>
              </div>
            </Advanced>
            <div className="mt-3">
              <Tabs
                label="Status"
                active={(f.status || 'All') as 'All' | Status}
                onChange={(id) => update({ status: id === 'All' ? null : id })}
                tabs={[{ id: 'All', label: 'All', count: inScope.length }, ...STATUSES.map((s) => ({ id: s as 'All' | Status, label: s, count: statusCounts[s] ?? 0 }))]}
              />
            </div>
          </div>

          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={6} rowClassName="h-24" />
            ) : mine.length === 0 ? (
              <EmptyState
                icon={<Icon className="h-5 w-5" />}
                title={isBuyer ? 'No buyers yet' : 'No sellers yet'}
                text={
                  bundle && !bundle.trading.enabled
                    ? 'Trading is switched off. Set it up and list what you sell or want so I know what to look for.'
                    : 'Run a search now. New posts from your trading sources show up here as they are found.'
                }
                action={
                  bundle && !bundle.trading.enabled ? (
                    <Link href="/trading/catalog" className="btn inline-flex min-h-9 items-center rounded-ctl bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-on hover:bg-primary-hover">
                      Set up trading
                    </Link>
                  ) : (
                    <JobAction type="trade_scan" label="Find leads now" runningText="Searching" variant="primary" successText={(r) => `Found ${Number(r?.inserted ?? 0)} new trade leads.`} onDone={() => void reload()} />
                  )
                }
              />
            ) : shown.length === 0 ? (
              <EmptyState
                icon={<FilterIcon className="h-5 w-5" />}
                title="Nothing matches these filters"
                text="Try removing a filter or searching for something else."
                action={
                  <Button onClick={() => update({ q: null, game: null, item: null, min: null, max: null, matched: null, trust: null, status: null, source: null })}>Clear all filters</Button>
                }
              />
            ) : (
              <>
                <p className="mb-2 px-1 text-xs text-fg-subtle" aria-live="polite">
                  {shown.length} {shown.length === 1 ? 'lead' : 'leads'}
                </p>
                <ul className="space-y-2">
                  {shown.slice(0, visible).map((l) => (
                    <LeadRow key={l.id} lead={l} selected={l.id === leadId} bundle={bundle} stockMode={stockMode} stockMatch={stockMatches.get(l.id)} onSelect={() => set({ lead: l.id })} />
                  ))}
                </ul>
                {visible < shown.length && (
                  <Button className="mt-3 w-full" onClick={() => setVisible((v) => v + PAGE)}>
                    Show more ({shown.length - visible} left)
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <div className={cx('min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:rounded-card', !selected && 'hidden lg:block')}>
          {selected ? (
            <TradeLeadDetail preview={selected} bundle={bundle} onPatch={updateLead} onBack={() => set({ lead: null })} />
          ) : leadId && !loading ? (
            <EmptyState title="Lead not found" text="It may be older than 90 days or was removed." action={<Button onClick={() => set({ lead: null })}>Back to the list</Button>} />
          ) : (
            <div className="hidden rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-16 text-center lg:block">
              <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg-subtle ring-1 ring-inset ring-border">
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-base font-semibold text-fg">Pick a lead to see the details</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-fg-subtle">You will see the full post, the warning signs, how the price compares, and can write your message.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadRow({ lead, selected, bundle, stockMode, stockMatch, onSelect }: { lead: Lead; selected: boolean; bundle: ReturnType<typeof useTradingSettings>['bundle']; stockMode: boolean; stockMatch?: ReturnType<typeof matchStock>[number]; onSelect: () => void }) {
  const price = budgetLabel(lead);
  const note = lead.trade_side === 'seller' && bundle ? priceVsLimit(lead.budget_amount, entryForLead(lead, bundle.trading)) : null;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cx(
          'btn block w-full cursor-pointer rounded-card border p-3 text-left transition-colors duration-fast',
          selected ? 'border-primary bg-primary-soft' : 'border-border bg-surface hover:border-border-strong',
          lead.status !== 'New' && !selected && 'opacity-90',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="line-clamp-2 min-w-0 break-words text-sm font-semibold text-fg">{lead.title}</p>
          <p className="font-num shrink-0 text-sm font-semibold text-fg">{price ?? <span className="font-normal text-fg-subtle">No price</span>}</p>
        </div>
        <p className="mt-1 truncate text-xs text-fg-muted">
          {[lead.game, lead.item_type ? itemLabel(lead.item_type) : null, lead.status !== 'New' ? lead.status : null].filter(Boolean).join(' · ') || 'Game not recognised'}
        </p>
        {stockMode ? (
          stockMatch && <p className="mt-1.5 truncate text-xs font-medium text-accent-text">{stockMatch.item.title} · {askVsBudget(stockMatch, lead)}</p>
        ) : (
          lead.trade_match && <p className="mt-1.5 truncate text-xs font-medium text-accent-text">{lead.trade_match}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 truncate text-xs text-fg-subtle">
            {lead.source_detail ?? lead.source} · {timeAgo(lead.posted_at ?? lead.created_at)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {note ? <PriceChip note={note} /> : <PriceVerdictBadge lead={lead} />}
            <PlainTrust level={lead.trust_level} score={lead.trust_score} suspicious={lead.is_suspicious} />
          </div>
        </div>
      </button>
    </li>
  );
}
