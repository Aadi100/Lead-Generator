"use client";

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageContainer, PageHeader } from '@/components/shell';
import { useShell } from '@/components/AppShell';
import { ChevronIcon, ExternalIcon, FilterIcon, PipelineIcon, RefreshIcon, SearchIcon } from '@/components/Icons';
import { Badge, Banner, Button, Checkbox, EmptyState, Field, Input, Modal, SegmentedControl, Skeleton, StatusBadge, Switch, Textarea, TrustBadge, buttonClass, cx, Drawer, CategoryChip } from '@/components/ui';
import { supabase } from '@/lib/supabaseClient';
import { budgetLabel, displayDate, fmtDateTime, isHttpUrl, splitContact, timeAgo } from '@/lib/format';
import type { Lead, Status } from '@/lib/types';
import {
  COLUMN_HINT,
  COLUMN_PAGE,
  COLUMN_STATUSES,
  OUTREACH_LABEL,
  createDealFromLead,
  leadHref,
  loadPipeline,
  money,
  sumBudget,
  updateLeadStatus,
  type PipelineData,
  type PipelineScope,
} from '@/lib/pipeline-data';
import { matchTag } from '@/components/leads/LeadBits';
import { PipelineCard } from './PipelineCard';
import { MoveMenu } from './MoveMenu';

const COL_ACCENT: Record<Status, string> = {
  New: 'bg-info',
  Pitched: 'bg-primary-text',
  Replied: 'bg-accent-text',
  Won: 'bg-success',
  Lost: 'bg-danger',
  Ignored: 'bg-fg-subtle',
};

// Kept between visits so switching back to Pipeline shows the board at once while it refreshes quietly.
let pipelineCache: PipelineData | null = null;

export function PipelineBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { pushToast } = useShell();

  const scope = (['services', 'trading'].includes(params.get('scope') ?? '') ? params.get('scope') : 'all') as PipelineScope;
  const query = params.get('q') ?? '';
  const minFit = Math.max(0, Math.min(95, Number(params.get('fit') ?? 0) || 0));
  const showIgnored = params.get('ignored') === '1';
  const previewId = params.get('lead');

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [data, setData] = useState<PipelineData | null>(pipelineCache);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(pipelineCache === null);
  const [search, setSearch] = useState(query);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);
  const [moreFilters, setMoreFilters] = useState(false);
  const [shownCount, setShownCount] = useState<Partial<Record<Status, number>>>({});
  const [collapsed, setCollapsed] = useState<Partial<Record<Status, boolean>>>({});
  const [wonFor, setWonFor] = useState<Lead | null>(null);
  const [lostFor, setLostFor] = useState<Lead | null>(null);
  const pending = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!silent && pipelineCache === null) setLoading(true);
    try {
      const d = await loadPipeline();
      pipelineCache = d;
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your leads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: refresh quietly when leads change elsewhere (not while one of our own writes is in flight).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`pipeline-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (pending.current === 0) void load(true);
        }, 800);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  // Debounce the search box into the URL.
  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => setParam({ q: search.trim() || null }), 250);
    return () => clearTimeout(t);
  }, [search, query, setParam]);

  const leads = data?.leads;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? []).filter((l) => {
      if (scope === 'services' && l.lead_kind === 'trade') return false;
      if (scope === 'trading' && l.lead_kind !== 'trade') return false;
      if (minFit > 0 && (l.fit_score ?? 0) < minFit) return false;
      if (q && !`${l.title} ${l.source} ${l.company_name ?? ''} ${l.author ?? ''} ${l.game ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, scope, minFit, query]);

  const columns = showIgnored ? [...COLUMN_STATUSES, 'Ignored' as Status] : COLUMN_STATUSES;
  const byStatus = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of [...COLUMN_STATUSES, 'Ignored']) map[s] = [];
    for (const l of visible) (map[l.status] ??= []).push(l);
    return map;
  }, [visible]);

  const patchLead = useCallback((id: string, patch: Partial<Lead>) => {
    setData((d) => (d ? { ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : d));
  }, []);

  const commit = useCallback(
    async (lead: Lead, to: Status, extra: Record<string, unknown> = {}, after?: () => Promise<void>) => {
      const from = lead.status;
      const prevNote = lead.outcome_note;
      patchLead(lead.id, { status: to, ...(extra.outcome_note !== undefined ? { outcome_note: extra.outcome_note as string | null } : {}) });
      pending.current += 1;
      const err = await updateLeadStatus(lead.id, to, extra);
      pending.current -= 1;
      if (err) {
        patchLead(lead.id, { status: from, outcome_note: prevNote });
        pushToast('error', `Could not move "${lead.title}": ${err}`);
        return;
      }
      pushToast('success', `Moved to ${to}.`, {
        label: 'Undo',
        onClick: () => {
          patchLead(lead.id, { status: from, outcome_note: prevNote });
          void updateLeadStatus(lead.id, from, extra.outcome_note !== undefined ? { outcome_note: prevNote } : {}).then((e) => {
            if (e) {
              patchLead(lead.id, { status: to });
              pushToast('error', `Could not undo: ${e}`);
            }
          });
        },
      });
      if (after) await after();
    },
    [patchLead, pushToast],
  );

  const requestMove = useCallback(
    (lead: Lead, to: Status) => {
      if (lead.status === to) return;
      if (to === 'Won') setWonFor(lead);
      else if (to === 'Lost') setLostFor(lead);
      else void commit(lead, to);
    },
    [commit],
  );

  const onDrop = (to: Status) => {
    const lead = leads?.find((l) => l.id === dragId);
    setDragId(null);
    setOverCol(null);
    if (lead) requestMove(lead, to);
  };

  const preview = previewId ? leads?.find((l) => l.id === previewId) ?? null : null;
  const openLead = useCallback((l: Lead) => setParam({ lead: l.id }), [setParam]);
  const filtersOn = scope !== 'all' || !!query || minFit > 0;
  const truncated = data ? data.total > data.leads.length : false;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Pipeline"
        subtitle="Every lead by stage. Drag a card to the next stage, or use its Move button. Won and Lost ask one quick question."
        actions={
          <Button onClick={() => void load()} leftIcon={<RefreshIcon className={cx('h-4 w-4', loading && 'animate-spin')} />} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <SegmentedControl
          label="Show"
          value={scope}
          onChange={(v) => setParam({ scope: v === 'all' ? null : v })}
          options={[
            { id: 'all', label: 'All' },
            { id: 'services', label: 'Services' },
            { id: 'trading', label: 'Trading' },
          ]}
        />
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <label htmlFor="pipe-search" className="sr-only">
            Search leads
          </label>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input id="pipe-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, company, source" className="!pl-8" />
        </div>
        <Button variant="ghost" onClick={() => setMoreFilters((v) => !v)} aria-expanded={moreFilters} leftIcon={<FilterIcon className="h-4 w-4" />}>
          {moreFilters ? 'Fewer filters' : 'More filters'}
        </Button>
        {filtersOn && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setParam({ scope: null, q: null, fit: null });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {moreFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-border bg-surface-2/50 px-3.5 py-3">
          <label className="flex items-center gap-2 text-[13px] text-fg-muted">
            <FilterIcon className="h-4 w-4 text-fg-subtle" aria-hidden="true" />
            <span className="whitespace-nowrap">
              Only leads that fit at least <span className="font-num font-medium text-fg">{minFit}</span>
            </span>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={minFit}
              onChange={(e) => setParam({ fit: Number(e.target.value) ? e.target.value : null })}
              aria-label="Minimum fit score"
              className="ctl h-5 w-28 cursor-pointer accent-[rgb(var(--primary))]"
            />
          </label>
          <div className="flex items-center gap-2">
            <Switch checked={showIgnored} onChange={(v) => setParam({ ignored: v ? '1' : null })} label="Show ignored leads" />
            <span className="text-[13px] text-fg-muted">Show ignored</span>
          </div>
          </div>
      )}

      {truncated && data && (
        <Banner tone="info" className="mb-3">
          Showing your {data.leads.length.toLocaleString('en-US')} most recent leads out of {data.total.toLocaleString('en-US')}. Older leads are in Leads.
        </Banner>
      )}
      {error && (
        <Banner
          tone="danger"
          title="Could not load the pipeline"
          className="mb-3"
          action={
            <Button size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {error}
        </Banner>
      )}

      {loading && !data ? (
        <BoardSkeleton />
      ) : data && data.leads.length === 0 ? (
        <EmptyState
          icon={<PipelineIcon className="h-5 w-5" />}
          title="No leads in your pipeline yet"
          text="Leads show up here as soon as they are found. You can also add one yourself."
          action={
            <Link href="/capture" className={buttonClass('primary')}>
              Capture a lead
            </Link>
          }
        />
      ) : (
        data && (
          <div
            role="group"
            aria-label="Pipeline board"
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 sm:snap-none"
          >
            {columns.map((s) => {
              const items = byStatus[s] ?? [];
              const total = sumBudget(items);
              const limit = shownCount[s] ?? COLUMN_PAGE;
              const drawn = items.slice(0, limit);
              const isCollapsed = !!collapsed[s];
              const isOver = overCol === s && dragId !== null;
              return (
                <section
                  key={s}
                  aria-label={`${s}, ${items.length} leads`}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overCol !== s) setOverCol(s);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol((c) => (c === s ? null : c));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(s);
                  }}
                  className={cx(
                    'glass flex w-[84vw] max-w-[340px] shrink-0 snap-start flex-col rounded-card border transition-[border-color,box-shadow] duration-fast sm:w-[272px] xl:min-w-[230px] xl:flex-1 xl:basis-0',
                    isOver ? 'border-primary shadow-glow ring-2 ring-primary' : 'border-border',
                  )}
                >
                  <header className="flex items-center gap-2 px-3 py-2.5">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', COL_ACCENT[s])} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <h2 className="flex items-baseline gap-1.5 text-[15px] font-semibold text-fg">
                        {s}
                        <span className="font-num text-[13px] font-normal text-fg-muted">{items.length.toLocaleString('en-US')}</span>
                      </h2>
                      <p className="truncate text-[13px] text-fg-subtle" title={total > 0 ? `${money(total)} total budget` : undefined}>
                        {COLUMN_HINT[s]}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [s]: !c[s] }))}
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${s} column`}
                      className="btn inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-ctl text-fg-subtle hover:bg-surface-2 hover:text-fg coarse:h-11 coarse:w-11"
                    >
                      <ChevronIcon className={cx('h-4 w-4 transition-transform duration-fast', !isCollapsed && 'rotate-180')} />
                    </button>
                  </header>
                  {!isCollapsed && (
                    <ul className="min-h-[120px] flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5 xl:max-h-[calc(100vh-19rem)] max-h-[calc(100vh-22rem)]">
                      {items.length === 0 ? (
                        <li className={cx('rounded-card border border-dashed px-3 py-8 text-center text-xs', isOver ? 'border-primary text-primary-text' : 'border-border-strong text-fg-subtle')}>
                          {isOver ? `Drop to move to ${s}` : filtersOn ? 'Nothing here matches your filters' : 'Nothing here yet. Drag a lead in.'}
                        </li>
                      ) : (
                        drawn.map((l) => (
                          <PipelineCard
                            key={l.id}
                            lead={l}
                            outreach={data.outreach[l.id]}
                            dragging={dragId === l.id}
                            showIgnored={showIgnored}
                            onOpen={openLead}
                            onMove={requestMove}
                            onDragStart={(x) => setDragId(x.id)}
                            onDragEnd={() => {
                              setDragId(null);
                              setOverCol(null);
                            }}
                          />
                        ))
                      )}
                      {items.length > limit && (
                        <li className="pt-1 text-center">
                          <Button size="sm" onClick={() => setShownCount((c) => ({ ...c, [s]: limit + COLUMN_PAGE }))}>
                            Show {Math.min(COLUMN_PAGE, items.length - limit)} more ({items.length - limit} left)
                          </Button>
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )
      )}

      <WonModal
        lead={wonFor}
        onClose={() => setWonFor(null)}
        onConfirm={async (lead, createDeal, value) => {
          setWonFor(null);
          await commit(lead, 'Won', {}, async () => {
            if (!createDeal) return;
            const err = await createDealFromLead(lead, value);
            if (err) pushToast('error', `Moved to Won, but the deal could not be created: ${err}`);
            else pushToast('success', 'Deal created. You can find it under Deals.');
          });
        }}
      />
      <LostModal
        lead={lostFor}
        onClose={() => setLostFor(null)}
        onConfirm={async (lead, reason) => {
          setLostFor(null);
          await commit(lead, 'Lost', reason ? { outcome_note: reason } : {});
        }}
      />
      <PreviewDrawer lead={preview} outreach={preview ? data?.outreach[preview.id] : undefined} onClose={() => setParam({ lead: null })} onMove={requestMove} showIgnored={showIgnored} />
    </PageContainer>
  );
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" className="flex gap-3 overflow-hidden">
      <span className="sr-only">Loading pipeline</span>
      {COLUMN_STATUSES.map((s, i) => (
        <div key={s} className="glass w-[272px] shrink-0 rounded-card border border-border p-3 xl:flex-1">
          <Skeleton className="mb-3 h-5 w-24" />
          {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
            <Skeleton key={j} className="mb-2 h-24 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

function WonModal({ lead, onClose, onConfirm }: { lead: Lead | null; onClose: () => void; onConfirm: (lead: Lead, createDeal: boolean, value: number | null) => void }) {
  const [create, setCreate] = useState(true);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (lead) {
      setCreate(true);
      setValue(lead.budget_amount && lead.budget_amount > 0 ? String(lead.budget_amount) : '');
    }
  }, [lead]);
  const num = value.trim() === '' ? null : Number(value);
  const bad = num !== null && (!Number.isFinite(num) || num < 0);
  return (
    <Modal
      open={!!lead}
      onClose={onClose}
      size="sm"
      title="Nice, you won this one"
      description={lead?.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={bad} onClick={() => lead && onConfirm(lead, create, bad ? null : num)}>
            Mark as Won
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Checkbox checked={create} onChange={setCreate} label="Also create a deal to track the money" />
        {create && (
          <Field label="Deal value in dollars (optional)" htmlFor="won-value" error={bad ? 'Enter a number, like 500.' : null}>
            <Input id="won-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="500" invalid={bad} data-autofocus />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function LostModal({ lead, onClose, onConfirm }: { lead: Lead | null; onClose: () => void; onConfirm: (lead: Lead, reason: string) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (lead) setReason(lead.outcome_note ?? '');
  }, [lead]);
  return (
    <Modal
      open={!!lead}
      onClose={onClose}
      size="sm"
      title="Mark as Lost"
      description={lead?.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => lead && onConfirm(lead, reason.trim())}>
            Mark as Lost
          </Button>
        </>
      }
    >
      <Field label="Why did it not work out? (optional)" htmlFor="lost-reason" hint="This helps Lead Radar learn what to skip.">
        <Textarea id="lost-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Too cheap, went with someone else, no reply..." data-autofocus />
      </Field>
    </Modal>
  );
}

function PreviewDrawer({
  lead,
  outreach,
  onClose,
  onMove,
  showIgnored,
}: {
  lead: Lead | null;
  outreach: string | undefined;
  onClose: () => void;
  onMove: (lead: Lead, to: Status) => void;
  showIgnored: boolean;
}) {
  // Keep the last lead while the drawer animates out.
  const last = useRef<Lead | null>(null);
  if (lead) last.current = lead;
  const l = lead ?? last.current;
  const contact = l ? splitContact(l.contact) : [];
  const budget = l ? budgetLabel(l) : null;
  return (
    <Drawer open={!!lead} onClose={onClose} title={l?.title ?? 'Lead'} width="max-w-[480px]" footer={l ? <DrawerFooter lead={l} onMove={onMove} showIgnored={showIgnored} /> : undefined}>
      {l && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={l.status} />
            {(() => {
              const t = l.lead_kind === 'trade' ? null : matchTag(l);
              return t ? <Badge tone={t.tone}>{t.label}</Badge> : null;
            })()}
            {l.lead_kind === 'trade' && l.trade_side && <Badge tone="accent">{l.trade_side === 'buyer' ? 'Buyer' : 'Seller'}</Badge>}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <Item label="Source" value={l.source_detail ? `${l.source} / ${l.source_detail}` : l.source} />
            <Item label="Found" value={`${timeAgo(displayDate(l))}`} />
            <Item label="Budget" value={budget ?? 'Not stated'} mono />
            {l.lead_kind !== 'trade' && l.category && <Item label="Type" value={l.category} />}
            {l.fit_score != null && <Item label="Fit with what you offer" value={`${l.fit_score} out of 100`} />}
            {l.trust_level && <Item label="Can I trust it?" value={`${l.trust_level === 'High' ? 'Looks real' : l.trust_level === 'Medium' ? 'Check first' : 'Be careful'}${l.trust_score != null ? ` (${l.trust_score})` : ''}`} />}
            <Item label="Message status" value={(outreach && OUTREACH_LABEL[outreach]) || 'Nothing sent yet'} />
            {l.pitched_at && <Item label="Pitched" value={fmtDateTime(l.pitched_at)} />}
            {l.replied_at && <Item label="Replied" value={fmtDateTime(l.replied_at)} />}
          </dl>

          {l.flags.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Be careful about</p>
              <div className="flex flex-wrap gap-1.5">
                {l.flags.map((f) => (
                  <Badge key={f} tone="warning">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {contact.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Contact</p>
              <ul className="space-y-0.5">
                {contact.map((c, i) => (
                  <li key={i} className="break-words text-fg">
                    {c.label && <span className="text-fg-subtle">{c.label}: </span>}
                    {c.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : l.best_email ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Contact</p>
              <p className="break-words text-fg">{l.best_email}</p>
            </div>
          ) : null}

          {l.description && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Post</p>
              <p className="line-clamp-6 whitespace-pre-line break-words text-fg-muted">{l.description}</p>
            </div>
          )}
          {l.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Your notes</p>
              <p className="whitespace-pre-line break-words text-fg">{l.notes}</p>
            </div>
          )}
          {l.outcome_note && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Outcome note</p>
              <p className="whitespace-pre-line break-words text-fg">{l.outcome_note}</p>
            </div>
          )}
          {isHttpUrl(l.url) && (
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary-text hover:underline">
              Open the original post
              <ExternalIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
    </Drawer>
  );
}

function DrawerFooter({ lead, onMove, showIgnored }: { lead: Lead; onMove: (lead: Lead, to: Status) => void; showIgnored: boolean }) {
  return (
    <>
      <MoveMenu current={lead.status} title={lead.title} showIgnored={showIgnored} onMove={(to) => onMove(lead, to)} />
      <Link href={leadHref(lead)} className={buttonClass('primary')}>
        Open in {lead.lead_kind === 'trade' ? 'Trading' : 'Leads'}
      </Link>
    </>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={cx('break-words text-fg', mono && 'font-num')}>{value}</dd>
    </div>
  );
}
