"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell';
import { useShell } from '@/components/AppShell';
import { Badge, Banner, Button, Card, CountUp, EmptyState, Reveal, Select, SegmentedControl, Skeleton, SkeletonRows, StatTile, Stagger, Table, THead, Th, Tr, Td, cx, type Tone } from '@/components/ui';
import { DealsIcon, ListIcon, GridIcon, PlusIcon } from '@/components/Icons';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { DEAL_STAGES, DEAL_STAGE_LABEL, type Deal, type DealKind, type DealStage } from '@/lib/types-platform';
import { computeKpis, dealsToCsv, downloadCsv, fetchDeals, fetchLeadById, inputFromLead, moveDeal, money, monthlySeries, profitOf, type DealInput } from '@/lib/deals-data';
import DealDrawer from './DealDrawer';
import DealsChart from './DealsChart';

const STAGE_TONE: Record<DealStage, Tone> = { talking: 'neutral', negotiating: 'info', agreed: 'primary', paid: 'accent', delivered: 'info', done: 'success', cancelled: 'neutral', disputed: 'danger' };

function StageBadge({ stage }: { stage: DealStage }) {
  return (
    <Badge tone={STAGE_TONE[stage]} dot>
      {DEAL_STAGE_LABEL[stage]}
    </Badge>
  );
}

function KindBadge({ d }: { d: Deal }) {
  return <Badge tone={d.kind === 'trade' ? 'accent' : 'primary'}>{d.kind === 'trade' ? (d.direction === 'buy' ? 'Trade, buying' : 'Trade, selling') : 'Service'}</Badge>;
}

type DrawerState = { mode: 'new'; initial: DealInput | null } | { mode: 'edit'; id: string } | null;

export default function DealsView() {
  const router = useRouter();
  const pathname = usePathname() ?? '/deals';
  const sp = useSearchParams();
  const { pushToast, refreshCounts } = useShell();

  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);

  const view = sp.get('view') === 'board' ? 'board' : 'table';
  const kindParam = sp.get('kind');
  const kind: 'all' | DealKind = kindParam === 'service' || kindParam === 'trade' ? kindParam : 'all';

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, sp],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      setDeals(await fetchDeals());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load deals');
      setDeals((d) => d ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // ?new=1&lead=<id> opens the drawer prefilled from the lead; ?deal=<id> opens an existing deal.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (deals === null) return;
    const sig = `${sp.get('new')}|${sp.get('lead')}|${sp.get('deal')}`;
    if (handled.current === sig) return;
    handled.current = sig;
    const dealId = sp.get('deal');
    if (dealId && deals.some((d) => d.id === dealId)) {
      setDrawer({ mode: 'edit', id: dealId });
      return;
    }
    if (sp.get('new') === '1') {
      const leadId = sp.get('lead');
      if (!leadId) {
        setDrawer({ mode: 'new', initial: null });
        return;
      }
      void fetchLeadById(leadId).then((l) => {
        if (!l) pushToast('warning', 'That lead was not found, so the form is empty.');
        setDrawer({ mode: 'new', initial: l ? inputFromLead(l) : null });
      });
    }
  }, [deals, sp, pushToast]);

  const closeDrawer = () => {
    setDrawer(null);
    if (sp.get('new') || sp.get('lead') || sp.get('deal')) {
      handled.current = '|null|null';
      setParams({ new: null, lead: null, deal: null });
    }
  };

  const visible = useMemo(() => (deals ?? []).filter((d) => kind === 'all' || d.kind === kind), [deals, kind]);
  const kpis = useMemo(() => computeKpis(visible), [visible]);
  const series = useMemo(() => monthlySeries(visible), [visible]);
  const currency = useMemo(() => {
    const c = new Map<string, number>();
    for (const d of visible) c.set(d.currency, (c.get(d.currency) ?? 0) + 1);
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
  }, [visible]);
  const mixed = useMemo(() => new Set(visible.map((d) => d.currency)).size > 1, [visible]);
  const editing = drawer?.mode === 'edit' ? (deals ?? []).find((d) => d.id === drawer.id) ?? null : null;

  const onSaved = (d: Deal, created: boolean) => {
    setDeals((list) => (list ? (created ? [d, ...list] : list.map((x) => (x.id === d.id ? d : x))) : [d]));
    closeDrawer();
    refreshCounts();
  };
  const onDeleted = (id: string) => {
    setDeals((list) => (list ? list.filter((d) => d.id !== id) : list));
    closeDrawer();
    refreshCounts();
  };

  const move = async (deal: Deal, stage: DealStage) => {
    if (deal.stage === stage) return;
    const before = deal;
    const closing = stage === 'done' || stage === 'cancelled';
    setDeals((list) => (list ? list.map((x) => (x.id === deal.id ? { ...x, stage, closed_at: closing ? x.closed_at ?? new Date().toISOString() : null } : x)) : list));
    const res = await moveDeal(before, stage);
    if (res.error || !res.deal) {
      setDeals((list) => (list ? list.map((x) => (x.id === deal.id ? before : x)) : list));
      pushToast('error', `Could not move the deal: ${res.error}`);
      return;
    }
    if (res.leadError) pushToast('warning', `Moved, but the lead status was not updated: ${res.leadError}`);
    else pushToast('success', `Moved to ${DEAL_STAGE_LABEL[stage]}${deal.lead_id && closing ? `. Lead marked ${stage === 'done' ? 'Won' : 'Lost'}.` : ''}`);
    refreshCounts();
  };

  const exportCsv = () => {
    if (!visible.length) return;
    downloadCsv(`deals-${new Date().toISOString().slice(0, 10)}.csv`, dealsToCsv(visible));
    pushToast('success', `Exported ${visible.length} deal${visible.length === 1 ? '' : 's'}`);
  };

  const openNew = () => setDrawer({ mode: 'new', initial: null });
  const loading = deals === null;
  const fmt = (n: number) => money(n, currency, true);

  return (
    <PageContainer>
      <PageHeader
        title="Deals"
        subtitle="Open and closed deals, with value, cost and stage."
        actions={
          <>
            <Button onClick={exportCsv} disabled={!visible.length}>
              Export CSV
            </Button>
            <Button variant="primary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={openNew}>
              New deal
            </Button>
          </>
        }
      />

      {error && (
        <Banner tone="danger" title="Could not load deals" className="mb-4" action={<Button size="sm" onClick={() => void load()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      {loading ? (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[98px] rounded-card" />
          ))}
        </div>
      ) : (
        <Stagger className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" step={50}>
          <StatTile label="Open value" tone="primary" value={<CountUp value={kpis.openValue} format={fmt} />} sub={`${kpis.openCount} open deal${kpis.openCount === 1 ? '' : 's'}`} />
          <StatTile label="Won this month" tone="success" value={<CountUp value={kpis.wonThisMonth} format={(n) => String(Math.round(n))} />} sub={money(kpis.wonThisMonthValue, currency, true)} />
          <StatTile label="Revenue" value={<CountUp value={kpis.revenue} format={fmt} />} sub={`${kpis.doneCount} finished deal${kpis.doneCount === 1 ? '' : 's'}`} />
          <StatTile label="Profit" tone={kpis.profit < 0 ? 'danger' : 'success'} value={<CountUp value={kpis.profit} format={fmt} />} sub="Value minus cost" />
          <StatTile label="Win rate" value={kpis.winRate === null ? <span>None yet</span> : <CountUp value={kpis.winRate} format={(n) => `${Math.round(n)}%`} />} sub="Done vs cancelled" />
          <StatTile label="Average deal" value={<CountUp value={kpis.average} format={fmt} />} sub="Per finished deal" />
        </Stagger>
      )}
      {mixed && !loading && <p className="-mt-3 mb-4 text-xs text-fg-subtle">Deals use more than one currency. Totals add the numbers together and show {currency}.</p>}

      {!loading && view === 'table' && (
        <Reveal>
          <Card title="Revenue and profit by month" subtitle="Finished deals over the last 6 months" className="mb-5">
            <DealsChart data={series} currency={currency} />
          </Card>
        </Reveal>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="View"
          value={view}
          onChange={(v) => setParams({ view: v === 'table' ? null : v })}
          options={[
            { id: 'table', label: 'Table', icon: <ListIcon className="h-4 w-4" /> },
            { id: 'board', label: 'Board', icon: <GridIcon className="h-4 w-4" /> },
          ]}
        />
        <div className="w-44">
          <Select aria-label="Filter by kind" value={kind} onChange={(e) => setParams({ kind: e.target.value === 'all' ? null : e.target.value })}>
            <option value="all">All kinds</option>
            <option value="service">Services</option>
            <option value="trade">Game trades</option>
          </Select>
        </div>
        <span className="ml-auto text-[13px] text-fg-subtle" role="status">
          {loading ? 'Loading' : `${visible.length} deal${visible.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {loading ? (
        <SkeletonRows rows={5} rowClassName="h-14" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<DealsIcon className="h-5 w-5" />}
          title={(deals ?? []).length === 0 ? 'No deals yet' : 'No deals of this kind'}
          text={(deals ?? []).length === 0 ? 'Add a deal when a lead turns into real work or a trade. You can also start one from any lead or contact.' : 'Change the kind filter to see the others.'}
          action={
            <Button variant="primary" onClick={openNew}>
              New deal
            </Button>
          }
        />
      ) : view === 'table' ? (
        <>
          <div className="hidden md:block">
            <Table caption="Deals">
              <THead>
                <tr>
                  <Th>Deal</Th>
                  <Th>Kind</Th>
                  <Th>Stage</Th>
                  <Th align="right">Value</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Profit</Th>
                  <Th>Expected close</Th>
                  <Th>Updated</Th>
                </tr>
              </THead>
              <tbody>
                {visible.map((d) => (
                  <Tr key={d.id} onClick={() => setDrawer({ mode: 'edit', id: d.id })}>
                    <Td className="max-w-[320px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawer({ mode: 'edit', id: d.id });
                        }}
                        className="block max-w-full truncate text-left font-medium text-fg hover:underline"
                      >
                        {d.title}
                      </button>
                      <p className="truncate text-xs text-fg-subtle">{[d.company, d.contact].filter(Boolean).join(' / ') || ' '}</p>
                    </Td>
                    <Td>
                      <KindBadge d={d} />
                    </Td>
                    <Td>
                      <StageBadge stage={d.stage} />
                    </Td>
                    <Td numeric>{d.value === null ? <span className="text-fg-subtle">-</span> : money(d.value, d.currency)}</Td>
                    <Td numeric>{d.cost === null ? <span className="text-fg-subtle">-</span> : money(d.cost, d.currency)}</Td>
                    <Td numeric className={d.value === null && d.cost === null ? '' : profitOf(d) < 0 ? 'text-danger' : 'text-success'}>
                      {d.value === null && d.cost === null ? <span className="text-fg-subtle">-</span> : money(profitOf(d), d.currency)}
                    </Td>
                    <Td className="whitespace-nowrap text-fg-muted">{d.expected_close ? new Date(`${d.expected_close}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="text-fg-subtle">Not set</span>}</Td>
                    <Td className="whitespace-nowrap text-fg-muted" >
                      <span title={fmtDateTime(d.updated_at)}>{timeAgo(d.updated_at)}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <Stagger as="ul" className="space-y-2 md:hidden" max={8}>
            {visible.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setDrawer({ mode: 'edit', id: d.id })} className="block w-full rounded-card border border-border bg-surface p-3 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium text-fg">{d.title}</p>
                    <span className="font-num shrink-0 text-sm text-fg">{d.value === null ? '-' : money(d.value, d.currency)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">{[d.company, d.contact].filter(Boolean).join(' / ')}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StageBadge stage={d.stage} />
                    <KindBadge d={d} />
                    {(d.value !== null || d.cost !== null) && <span className={cx('font-num text-xs', profitOf(d) < 0 ? 'text-danger' : 'text-success')}>Profit {money(profitOf(d), d.currency)}</span>}
                  </div>
                </button>
              </li>
            ))}
          </Stagger>
        </>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" role="region" aria-label="Deals board, scrolls sideways">
          <div className="flex min-w-max snap-x gap-3">
            {DEAL_STAGES.map((stage) => {
              const col = visible.filter((d) => d.stage === stage);
              const total = col.reduce((s, d) => s + (d.value ?? 0), 0);
              const over = overStage === stage && dragId !== null;
              return (
                <section
                  key={stage}
                  aria-label={`${DEAL_STAGE_LABEL[stage]}, ${col.length} deals`}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    setOverStage(stage);
                  }}
                  onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const d = (deals ?? []).find((x) => x.id === dragId);
                    setDragId(null);
                    setOverStage(null);
                    if (d) void move(d, stage);
                  }}
                  className={cx('w-[272px] shrink-0 snap-start rounded-card border bg-surface-2/60 p-2 transition-colors duration-fast', over ? 'border-primary bg-primary-soft' : 'border-border')}
                >
                  <header className="mb-2 flex items-center justify-between gap-2 px-1">
                    <h3 className="text-sm font-semibold text-fg">{DEAL_STAGE_LABEL[stage]}</h3>
                    <span className="font-num text-xs text-fg-subtle">
                      {col.length}
                      {total > 0 && <> / {money(total, currency, true)}</>}
                    </span>
                  </header>
                  <ul className="min-h-[72px] space-y-2">
                    {col.map((d) => (
                      <li
                        key={d.id}
                        draggable
                        onDragStart={(e) => {
                          setDragId(d.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', d.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                        className={cx('cursor-grab rounded-ctl border border-border bg-surface p-2.5 shadow-sm active:cursor-grabbing', dragId === d.id && 'opacity-50')}
                      >
                        <button type="button" onClick={() => setDrawer({ mode: 'edit', id: d.id })} className="block w-full text-left">
                          <p className="line-clamp-2 text-sm font-medium text-fg">{d.title}</p>
                          {(d.company || d.contact) && <p className="mt-0.5 truncate text-xs text-fg-subtle">{[d.company, d.contact].filter(Boolean).join(' / ')}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <KindBadge d={d} />
                            {d.value !== null && <span className="font-num text-xs text-fg">{money(d.value, d.currency)}</span>}
                          </div>
                        </button>
                        <div className="mt-2">
                          <Select aria-label={`Move ${d.title} to another stage`} value={d.stage} onChange={(e) => void move(d, e.target.value as DealStage)} className="!py-1 text-[13px]">
                            {DEAL_STAGES.map((s) => (
                              <option key={s} value={s}>
                                {s === d.stage ? `Stage: ${DEAL_STAGE_LABEL[s]}` : `Move to ${DEAL_STAGE_LABEL[s]}`}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </li>
                    ))}
                    {col.length === 0 && <li className="rounded-ctl border border-dashed border-border px-2 py-4 text-center text-xs text-fg-subtle">{over ? 'Drop here' : 'No deals'}</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <DealDrawer
        open={drawer !== null && (drawer.mode === 'new' || !!editing)}
        deal={editing}
        initial={drawer?.mode === 'new' ? drawer.initial : null}
        onClose={closeDrawer}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </PageContainer>
  );
}
