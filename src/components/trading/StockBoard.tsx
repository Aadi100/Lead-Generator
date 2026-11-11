"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { CatalogIcon, PlusIcon, SearchIcon, TrashIcon } from '@/components/Icons';
import { PageHeader } from '@/components/shell';
import { Badge, Banner, Button, EmptyState, Input, Modal, Reveal, Select, SkeletonRows, StatTile, Tabs, cx } from '@/components/ui';
import { itemLabel, timeAgo } from '@/lib/format';
import { deleteStock, releaseStock, setStockStatus, useStock, usePriceRates } from '@/lib/stock-data';
import { fmtMoney, rowProfit, summarizeStock } from '@/lib/stock-stats';
import { useTradeLeads } from '@/lib/trading-data';
import { money } from '@/lib/trading-stats';
import { useUrlParams } from '@/lib/trading-url';
import { STOCK_STATUS_LABEL, type StockItem, type StockStatus } from '@/lib/types-stock';
import { matchStock } from '../../../worker/lib/stock-match.mjs';
import SellDialog from './SellDialog';
import StockDrawer from './StockDrawer';
import TradingNav from './TradingNav';

const TABS: StockStatus[] = ['in_stock', 'reserved', 'sold', 'archived'];

export default function StockBoard() {
  const { pushToast } = useShell();
  const { get, set } = useUrlParams();
  const { items, loading, error, reload } = useStock();
  const { rates } = usePriceRates();
  const { leads } = useTradeLeads();
  const [drawer, setDrawer] = useState<{ open: boolean; item: StockItem | null }>({ open: false, item: null });
  const [selling, setSelling] = useState<StockItem | null>(null);
  const [removing, setRemoving] = useState<StockItem | null>(null);

  const tab = (TABS.includes(get('tab') as StockStatus) ? get('tab') : 'in_stock') as StockStatus;
  const q = get('q').trim().toLowerCase();
  const game = get('game');

  const summary = useMemo(() => summarizeStock(items, rates), [items, rates]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [items]);
  const games = useMemo(() => Array.from(new Set(items.map((i) => i.game))).sort(), [items]);
  const shown = useMemo(
    () =>
      items
        .filter((i) => i.status === tab && (!game || i.game === game) && (!q || `${i.title} ${i.game} ${i.description ?? ''}`.toLowerCase().includes(q)))
        .sort((a, b) => (tab === 'sold' ? Date.parse(b.sold_at ?? b.updated_at) - Date.parse(a.sold_at ?? a.updated_at) : Date.parse(b.created_at) - Date.parse(a.created_at))),
    [items, tab, game, q],
  );
  const openBuyers = useMemo(() => {
    const buyers = leads.filter((l) => l.trade_side === 'buyer' && l.status === 'New' && !l.is_suspicious);
    const out = new Map<string, number>();
    for (const i of items) {
      if (i.status !== 'in_stock') continue;
      out.set(i.id, buyers.filter((b) => matchStock(b, [i], { rates }).length > 0).length);
    }
    return out;
  }, [items, leads, rates]);

  const act = async (p: Promise<string | null>, ok: string) => {
    const err = await p;
    if (err) pushToast('error', err);
    else pushToast('success', ok);
  };

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="What you hold to sell right now. Buyer matches only count items that are in stock here."
        actions={
          <Button variant="primary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setDrawer({ open: true, item: null })}>
            Add item
          </Button>
        }
      />
      <TradingNav />

      {error && (
        <Banner tone="danger" title="Could not load your stock" className="mb-4" action={<Button size="sm" onClick={() => void reload()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Items in stock" value={summary.inStock} sub={summary.reserved ? `${summary.reserved} reserved` : 'Units ready to sell'} />
          <StatTile label="Total ask value" value={money(summary.askValueUsd)} sub={summary.unpriced ? `${summary.unpriced} without a price` : 'In stock, at your asking prices'} />
          <StatTile label="Sold this month" value={summary.soldMonth} sub="Units" />
          <StatTile
            label="Profit this month"
            value={summary.profitKnown ? money(summary.profitMonthUsd) : '-'}
            tone={summary.profitKnown ? (summary.profitMonthUsd >= 0 ? 'success' : 'danger') : 'neutral'}
            sub={summary.profitKnown ? 'From sales where you saved a cost' : 'Save what you paid to see profit'}
          />
        </div>
      </Reveal>

      <div className="mt-4 rounded-card border border-border bg-surface p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="relative min-w-0">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input aria-label="Search stock" className="pl-8" placeholder="Search title or game" value={get('q')} onChange={(e) => set({ q: e.target.value })} />
          </div>
          <Select aria-label="Game" value={game} onChange={(e) => set({ game: e.target.value })}>
            <option value="">All games</option>
            {games.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-3">
          <Tabs label="Stock status" active={tab} onChange={(id) => set({ tab: id === 'in_stock' ? null : id })} tabs={TABS.map((s) => ({ id: s, label: STOCK_STATUS_LABEL[s], count: counts[s] ?? 0 }))} />
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <SkeletonRows rows={4} rowClassName="h-28" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CatalogIcon className="h-5 w-5" />}
            title="No stock yet"
            text="Add the accounts, items or services you hold. Until you do, buyers are matched against your catalog. Once you add stock, only what is in stock here counts."
            action={
              <Button variant="primary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setDrawer({ open: true, item: null })}>
                Add your first item
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState icon={<CatalogIcon className="h-5 w-5" />} title={`Nothing ${STOCK_STATUS_LABEL[tab].toLowerCase()}`} text={q || game ? 'No item matches these filters.' : 'Items you move here will show up in this list.'} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((i) => (
              <StockCard
                key={i.id}
                item={i}
                buyers={openBuyers.get(i.id) ?? 0}
                onEdit={() => setDrawer({ open: true, item: i })}
                onSell={() => setSelling(i)}
                onRelease={() => void act(releaseStock(i), 'Released back to stock.')}
                onArchive={() => void act(setStockStatus(i, 'archived'), 'Archived.')}
                onRestore={() => void act(setStockStatus(i, 'in_stock'), 'Back in stock.')}
                onDelete={() => setRemoving(i)}
              />
            ))}
          </ul>
        )}
      </div>

      <StockDrawer open={drawer.open} item={drawer.item} games={games} onClose={() => setDrawer((d) => ({ ...d, open: false }))} onSaved={() => void reload()} />
      <SellDialog item={selling} rates={rates} open={!!selling} onClose={() => setSelling(null)} onDone={() => void reload()} />
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Delete this item?"
        description={removing ? removing.title : undefined}
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => {
                const r = removing;
                setRemoving(null);
                if (r) void act(deleteStock(r.id), 'Deleted.');
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">Prices already saved from sales of this item stay in your price history. Consider archiving instead if you only want it out of the way.</p>
      </Modal>
    </div>
  );
}

function StockCard({ item: i, buyers, onEdit, onSell, onRelease, onArchive, onRestore, onDelete }: { item: StockItem; buyers: number; onEdit: () => void; onSell: () => void; onRelease: () => void; onArchive: () => void; onRestore: () => void; onDelete: () => void }) {
  const profit = rowProfit(i);
  return (
    <li className={cx('flex flex-col rounded-card border border-border bg-surface p-3.5 shadow-sm', i.status === 'archived' && 'opacity-75')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-snug text-fg">{i.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{i.game}</Badge>
            <Badge>{itemLabel(i.item_type)}</Badge>
            {i.status === 'reserved' && <Badge tone="warning">Reserved</Badge>}
            {i.status === 'sold' && <Badge tone="success">Sold</Badge>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-num text-base font-semibold text-fg">{i.status === 'sold' ? fmtMoney(i.sold_price, i.currency) : fmtMoney(i.ask_price, i.currency)}</p>
          <p className="text-[11px] text-fg-subtle">{i.status === 'sold' ? 'sold each' : i.ask_price === null ? 'no asking price' : 'asking each'}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-fg-subtle">Quantity</dt>
          <dd className="font-num font-semibold text-fg">{i.quantity}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">You paid</dt>
          <dd className="font-num font-semibold text-fg">{fmtMoney(i.cost, i.currency)}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">{i.status === 'sold' ? 'Profit' : 'Margin'}</dt>
          <dd className={cx('font-num font-semibold', (profit ?? 0) < 0 ? 'text-danger' : 'text-fg')}>
            {i.status === 'sold' ? fmtMoney(profit, i.currency) : i.ask_price !== null && i.cost !== null ? fmtMoney(i.ask_price - i.cost, i.currency) : '-'}
          </dd>
        </div>
      </dl>

      {(i.listed_on.length > 0 || i.description) && (
        <div className="mt-2.5 space-y-1.5">
          {i.listed_on.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Listed on">
              {i.listed_on.map((p) => (
                <li key={p}>
                  <Badge tone="info">{p}</Badge>
                </li>
              ))}
            </ul>
          )}
          {i.description && <p className="line-clamp-2 text-xs text-fg-muted">{i.description}</p>}
        </div>
      )}

      <div className="mt-2.5 text-xs text-fg-subtle">
        {i.status === 'in_stock' && (buyers > 0 ? <Link href={`/trading/buyers?game=${encodeURIComponent(i.game)}`} className="font-medium text-primary-text hover:underline">{buyers} open {buyers === 1 ? 'buyer matches' : 'buyers match'} this</Link> : 'No open buyers match this right now')}
        {i.status === 'reserved' && i.buyer_lead_id && <Link href={`/trading/buyers?lead=${i.buyer_lead_id}`} className="font-medium text-primary-text hover:underline">Reserved for a buyer. Open the lead</Link>}
        {i.status === 'sold' && `Sold ${i.sold_at ? timeAgo(i.sold_at) : ''}`}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {(i.status === 'in_stock' || i.status === 'reserved') && (
          <Button size="sm" variant="primary" onClick={onSell}>
            Mark sold
          </Button>
        )}
        {i.status === 'reserved' && (
          <Button size="sm" onClick={onRelease}>
            Release
          </Button>
        )}
        {i.status !== 'archived' && i.status !== 'sold' && (
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
        {i.status === 'in_stock' && (
          <Button size="sm" variant="ghost" onClick={onArchive}>
            Archive
          </Button>
        )}
        {i.status === 'archived' && (
          <Button size="sm" onClick={onRestore}>
            Restore
          </Button>
        )}
        {(i.status === 'archived' || i.status === 'sold') && (
          <Button size="sm" variant="ghost" leftIcon={<TrashIcon className="h-3.5 w-3.5" />} onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}
