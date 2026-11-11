"use client";

import { useMemo, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { MarketIcon, PlusIcon, TrashIcon } from '@/components/Icons';
import { Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, Reveal, Select, Skeleton, Table, THead, Td, Th, Tr } from '@/components/ui';
import { fmtDateTime, itemLabel } from '@/lib/format';
import { deletePoint, saveRates, usePricePoints, usePriceRates } from '@/lib/stock-data';
import { fmtMoney } from '@/lib/stock-stats';
import { money } from '@/lib/trading-stats';
import { CURRENCIES, PRICE_KIND_LABEL, type PricePoint } from '@/lib/types-stock';
import { marketStats } from '../../../worker/lib/price-market.mjs';
import JobAction from './JobAction';
import PriceHistoryChart from './PriceCharts';
import PricePointDrawer from './PricePointDrawer';

const PAGE = 20;
const norm = (s: string) => s.trim().toLowerCase();

/** Market page section: market numbers, price history chart, and the table of saved prices with add/edit/delete. */
export default function PriceTracker() {
  const { pushToast } = useShell();
  const { points, loading, error, reload } = usePricePoints();
  const { rates, custom, reload: reloadRates } = usePriceRates();
  const [game, setGame] = useState('');
  const [type, setType] = useState('');
  const [kind, setKind] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [drawer, setDrawer] = useState<{ open: boolean; point: PricePoint | null }>({ open: false, point: null });
  const [ratesOpen, setRatesOpen] = useState(false);

  const games = useMemo(() => Array.from(new Set(points.map((p) => p.game))).sort((a, b) => a.localeCompare(b)), [points]);
  const types = useMemo(() => Array.from(new Set(points.filter((p) => !game || norm(p.game) === norm(game)).map((p) => p.item_type))).sort(), [points, game]);
  const filtered = useMemo(() => points.filter((p) => (!game || norm(p.game) === norm(game)) && (!type || p.item_type === type) && (!kind || p.kind === kind)), [points, game, type, kind]);
  const stats = useMemo(() => (game && type ? marketStats(points, { game, item_type: type }) : null), [points, game, type]);
  const nSold = useMemo(() => filtered.filter((p) => p.kind === 'sold').length, [filtered]);

  const remove = async (p: PricePoint) => {
    const err = await deletePoint(p.id);
    if (err) pushToast('error', err);
    else pushToast('success', 'Price removed.');
  };

  return (
    <Reveal className="mt-4">
      <Card
        title="Price tracker"
        subtitle="Save what things really sold for, then see whether a lead's price is above or below market."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setRatesOpen(true)}>
              Exchange rates
            </Button>
            <JobAction
              type="recompute_price_market"
              label="Recompute now"
              runningText="Updating verdicts"
              icon={<MarketIcon className="h-4 w-4" />}
              successText={(r) => `Checked ${Number(r?.leads ?? 0)} leads against the market.`}
              onDone={() => void reload()}
            />
            <Button size="sm" variant="primary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setDrawer({ open: true, point: null })}>
              Log a sale / price
            </Button>
          </div>
        }
      >
        {error && (
          <Banner tone="danger" title="Could not load saved prices" className="mb-3" action={<Button size="sm" onClick={() => void reload()}>Retry</Button>}>
            {error}
          </Banner>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <Select aria-label="Game" value={game} onChange={(e) => { setGame(e.target.value); setType(''); setVisible(PAGE); }}>
            <option value="">All games</option>
            {games.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Select aria-label="Kind of item" value={type} onChange={(e) => { setType(e.target.value); setVisible(PAGE); }}>
            <option value="">All kinds of item</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {itemLabel(t)}
              </option>
            ))}
          </Select>
          <Select aria-label="Kind of price" value={kind} onChange={(e) => { setKind(e.target.value); setVisible(PAGE); }}>
            <option value="">Sales, asking prices and offers</option>
            <option value="sold">Real sales only</option>
            <option value="asking">Asking prices only</option>
            <option value="offer">Buyer offers only</option>
          </Select>
        </div>

        {loading ? (
          <Skeleton className="mt-4 h-56" />
        ) : points.length === 0 ? (
          <EmptyState
            icon={<MarketIcon className="h-5 w-5" />}
            title="No prices saved yet"
            text="Log a sale to start. Prices also arrive on their own from won deals, items you mark sold in Stock, and asking prices parsed from trade leads."
            action={
              <Button variant="primary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setDrawer({ open: true, point: null })}>
                Log your first sale
              </Button>
            }
            className="mt-4"
          />
        ) : (
          <>
            <div className="mt-4">
              {stats ? (
                stats.enough ? (
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Typical price" value={money(stats.median)} sub={stats.basis === 'sold' ? `${stats.n} real sales` : `${stats.n} asking prices (weaker)`} />
                    <Stat label="Usual range" value={`${money(stats.p25)} - ${money(stats.p75)}`} sub="Middle half of prices" />
                    <Stat label="Lowest to highest" value={`${money(stats.min)} - ${money(stats.max)}`} sub="After dropping extremes" />
                    <Stat label="Confidence" value={stats.confidence === 'high' ? 'Good' : stats.confidence === 'medium' ? 'Fair' : 'Low'} sub={stats.basis === 'sold' ? 'Based on sales' : 'No sales yet, based on asks'} />
                  </dl>
                ) : (
                  <Banner tone="info" title="Not enough data for a market price">
                    {stats.reason} Leads for this game and item show &quot;No market data yet&quot; until then.
                  </Banner>
                )
              ) : (
                <p className="text-[13px] text-fg-subtle">Pick a game and a kind of item to see its typical price and usual range.</p>
              )}
            </div>

            <div className="mt-4">
              <PriceHistoryChart points={filtered} band={stats?.enough ? { p25: stats.p25, p75: stats.p75, median: stats.median } : null} />
              {filtered.length === 0 && <p className="py-6 text-center text-sm text-fg-subtle">No prices match these filters.</p>}
            </div>

            <p className="mb-2 mt-5 text-xs font-medium text-fg-subtle" aria-live="polite">
              {filtered.length} saved {filtered.length === 1 ? 'price' : 'prices'} ({nSold} real {nSold === 1 ? 'sale' : 'sales'}). Amounts are compared in US dollars using approximate rates.
            </p>
            <Table caption="Saved prices" className="max-h-[28rem]">
              <THead>
                <tr>
                  <Th>Date</Th>
                  <Th>Game and item</Th>
                  <Th>Kind</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">About USD</Th>
                  <Th>Where</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </THead>
              <tbody>
                {filtered.slice(0, visible).map((p) => {
                  const auto = p.origin === 'lead' || p.origin === 'deal';
                  return (
                    <Tr key={p.id}>
                      <Td className="whitespace-nowrap text-fg-muted">{fmtDateTime(p.captured_at).split(',')[0]}</Td>
                      <Td>
                        <span className="font-medium text-fg">{p.game}</span> <span className="text-fg-subtle">{itemLabel(p.item_type)}{p.item_key ? ` · ${p.item_key}` : ''}</span>
                        {p.note && <span className="block max-w-[16rem] truncate text-xs text-fg-subtle">{p.note}</span>}
                      </Td>
                      <Td>
                        <Badge tone={p.kind === 'sold' ? 'success' : 'neutral'}>{PRICE_KIND_LABEL[p.kind]}</Badge>
                        {auto && <span className="ml-1.5 text-[11px] text-fg-subtle">{p.origin === 'deal' ? 'from a deal' : 'from a post'}</span>}
                        {p.origin === 'stock' && <span className="ml-1.5 text-[11px] text-fg-subtle">from Stock</span>}
                      </Td>
                      <Td numeric>{fmtMoney(p.price, p.currency)}</Td>
                      <Td numeric>{money(p.price_usd)}</Td>
                      <Td className="text-fg-muted">{p.source ?? '-'}</Td>
                      <Td align="right">
                        <div className="flex justify-end gap-1">
                          {!auto && p.origin !== 'stock' && (
                            <Button size="sm" variant="ghost" onClick={() => setDrawer({ open: true, point: p })}>
                              Edit
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" aria-label={`Delete price ${fmtMoney(p.price, p.currency)}`} onClick={() => void remove(p)}>
                            <TrashIcon className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            {visible < filtered.length && (
              <Button className="mt-3 w-full" onClick={() => setVisible((v) => v + PAGE)}>
                Show more ({filtered.length - visible} left)
              </Button>
            )}
          </>
        )}
      </Card>

      <PricePointDrawer
        open={drawer.open}
        point={drawer.point}
        prefill={game ? { game, ...(type ? { item_type: type } : {}) } : undefined}
        games={games}
        rates={rates}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        onSaved={() => void reload()}
      />
      <RatesModal open={ratesOpen} custom={custom} rates={rates} onClose={() => setRatesOpen(false)} onSaved={() => void reloadRates()} />
    </Reveal>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-ctl border border-border bg-surface-2/60 px-3 py-2">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="font-num text-lg font-semibold text-fg">{value}</dd>
      <p className="text-[11px] text-fg-subtle">{sub}</p>
    </div>
  );
}

function RatesModal({ open, custom, rates, onClose, onSaved }: { open: boolean; custom: Record<string, number>; rates: Record<string, number>; onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useShell();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setDraft(Object.fromEntries(CURRENCIES.filter((c) => c !== 'USD').map((c) => [c, String(custom[c] ?? rates[c] ?? '')])));
  }
  if (!open && wasOpen) setWasOpen(false);

  const save = async () => {
    const out: Record<string, number> = {};
    for (const [c, v] of Object.entries(draft)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        pushToast('error', `${c}: enter a rate above 0.`);
        return;
      }
      out[c] = n;
    }
    setSaving(true);
    const err = await saveRates(out);
    setSaving(false);
    if (err) pushToast('error', err);
    else {
      pushToast('success', 'Rates saved. New prices use them; run Recompute now to refresh verdicts.');
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Exchange rates"
      description="US dollars for one unit of each currency. Rough estimates for comparing prices, not live rates. Edit them when they drift."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save rates
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Object.keys(draft).map((c) => (
          <Field key={c} label={`1 ${c} in USD`} htmlFor={`rate-${c}`}>
            <Input id={`rate-${c}`} type="number" min={0} step="any" inputMode="decimal" value={draft[c]} onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))} />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
