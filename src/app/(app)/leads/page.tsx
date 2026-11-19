"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { STATUSES, type Lead, type Status, type StatusTab } from '@/lib/types';
import { isFlagged, normalizeLead, truncate } from '@/lib/format';
import { enqueueJob, waitForJob } from '@/lib/jobs';
import { groupByLead, recordOutcome, sentTodayCount, useOutreach, useReplies } from '@/lib/outreach';
import { chipFor, useLeadLinks, type AlsoSeenChip } from '@/lib/lead-identity';
import {
  DEFAULT_STATE,
  hasActiveFilters,
  isServiceLead,
  matchesFilters,
  parseState,
  sortLeads,
  stateToQuery,
  type LeadsKind,
  type LeadsState,
} from '@/lib/leads-query';
import { useShell } from '@/components/AppShell';
import { PageContainer, PageHeader } from '@/components/shell';
import { Banner, Button, Checkbox, Drawer, EmptyState, IconButton, SkeletonRows, cx } from '@/components/ui';
import { InboxIcon, PlusIcon } from '@/components/Icons';
import StatsBar, { type Stats } from '@/components/StatsBar';
import FilterBar from '@/components/FilterBar';
import OnboardingCard from '@/components/OnboardingCard';
import LeadRow from '@/components/leads/LeadRow';
import LeadGridCard from '@/components/leads/LeadGridCard';
import LeadDetail from '@/components/leads/LeadDetail';
import { BulkBar, BulkNoteModal, ShortcutsModal } from '@/components/leads/LeadsChrome';

const CHUNK = 50;
const PAGE = 1000; // the server returns at most 1000 rows per request
const MAX_LEADS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

type LeadPatch = Partial<Pick<Lead, 'status' | 'notes' | 'pitched_at' | 'enrich_status' | 'enrich_error'>>;

// Kept between visits so switching back to Leads shows the list at once while it refreshes quietly.
let leadsCache: Lead[] = [];

function mergeLoaded(fetched: Lead[], current: Lead[]): Lead[] {
  const ids = new Set(fetched.map((l) => l.id));
  return [...current.filter((l) => !ids.has(l.id)), ...fetched];
}

function useMinWidth(px: number): boolean | null {
  const [match, setMatch] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [px]);
  return match;
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function LeadsView() {
  const { pushToast, sending, workerOnline } = useShell();
  const outreach = useOutreach();
  const replies = useReplies();
  const identity = useLeadLinks();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state = useMemo(() => parseState((k) => params.get(k)), [params]);
  const stateRef = useRef<LeadsState>(state);
  stateRef.current = state;

  const [leads, setLeads] = useState<Lead[]>(leadsCache);
  const [loading, setLoading] = useState(leadsCache.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visible, setVisible] = useState(CHUNK);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const [drafting, setDrafting] = useState<Set<string>>(new Set());
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newSinceLoad, setNewSinceLoad] = useState(0);
  const [capped, setCapped] = useState(false);

  const leadsRef = useRef<Lead[]>([]);
  leadsRef.current = leads;
  const searchRef = useRef<HTMLInputElement>(null);
  const isWide = useMinWidth(1280);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const setState = useCallback(
    (patch: Partial<LeadsState>) => {
      const next = { ...stateRef.current, ...patch };
      stateRef.current = next;
      router.replace(`${pathname}${stateToQuery(next)}`, { scroll: false });
    },
    [router, pathname],
  );

  // Reset paging when the filters change (not when only the open lead changes).
  const filterKey = `${state.kind}|${state.q}|${state.status}|${state.category}|${state.source}|${state.trust}|${state.sort}`;
  useEffect(() => {
    setVisible(CHUNK);
  }, [filterKey]);

  const markFresh = useCallback((id: string) => {
    setFreshIds((cur) => new Set(cur).add(id));
    setTimeout(() => {
      setFreshIds((cur) => {
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
    }, 8000);
  }, []);

  const loadLeads = useCallback(async () => {
    if (leadsCache.length === 0) setLoading(true);
    setLoadError(null);
    // Load in pages of 1000. The first page shows at once, the rest fills in quietly.
    const byId = new Map<string, Lead>();
    let failed: string | null = null;
    let hitCap = false;
    for (let from = 0; from < MAX_LEADS; from += PAGE) {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        failed = error.message;
        break;
      }
      const rows = data ?? [];
      rows.forEach((row) => {
        const lead = normalizeLead(row as Record<string, unknown>);
        if (isServiceLead(lead)) byId.set(lead.id, lead);
      });
      if (from === 0) {
        const first = Array.from(byId.values());
        setLeads((cur) => mergeLoaded(first, cur));
        setLoading(false);
      }
      if (rows.length < PAGE) break;
      if (from + PAGE >= MAX_LEADS) hitCap = true;
    }
    if (failed) {
      setLoadError(failed);
    } else {
      const fetched = Array.from(byId.values());
      leadsCache = fetched;
      setLeads((cur) => mergeLoaded(fetched, cur));
      setCapped(hitCap);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    const channel = supabase
      .channel(`leads-live-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        const lead = normalizeLead(payload.new as Record<string, unknown>);
        if (!isServiceLead(lead)) return;
        if (leadsRef.current.some((l) => l.id === lead.id)) return;
        setLeads((cur) => (cur.some((l) => l.id === lead.id) ? cur : [lead, ...cur]));
        markFresh(lead.id);
        setNewSinceLoad((n) => n + 1);
        pushToast('info', `New lead: ${truncate(lead.title, 80)}`);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const incoming = payload.new as Record<string, unknown>;
        setLeads((cur) => cur.map((l) => (l.id === incoming.id ? normalizeLead({ ...l, ...incoming }) : l)));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [markFresh, pushToast]);

  // ---- updates (optimistic with rollback) ----
  const patchLead = useCallback(
    async (id: string, patch: LeadPatch, failure: string): Promise<boolean> => {
      const previous = leadsRef.current.find((l) => l.id === id);
      if (!previous) return false;
      const rollback: Record<string, unknown> = {};
      (Object.keys(patch) as (keyof LeadPatch)[]).forEach((key) => {
        rollback[key] = previous[key];
      });
      setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
      const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select('id');
      if (error || !data || data.length === 0) {
        setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...rollback } : l)));
        pushToast('error', `${failure}${error ? `: ${error.message}` : ': the change was not saved.'}`);
        return false;
      }
      return true;
    },
    [pushToast],
  );

  const handleStatus = useCallback(
    (id: string, status: Status) => {
      const before = leadsRef.current.find((l) => l.id === id)?.status;
      void patchLead(id, { status }, "Couldn't update the lead").then((ok) => {
        if (!ok) return;
        void recordOutcome(id, status);
        if (status === 'Ignored' && before && before !== 'Ignored') {
          pushToast('info', 'Lead ignored.', { label: 'Undo', onClick: () => handleStatus(id, before) });
        }
      });
    },
    [patchLead, pushToast],
  );

  const handleNotes = useCallback(
    (id: string, notes: string) => {
      void patchLead(id, { notes: notes.trim() === '' ? null : notes }, "Couldn't save the note");
    },
    [patchLead],
  );

  const handleLeadPatch = useCallback(
    (id: string, patch: { status?: Status; pitched_at?: string }) => {
      void patchLead(id, patch, "Couldn't update the lead");
    },
    [patchLead],
  );

  const bulkStatus = useCallback(
    async (ids: string[], status: Status) => {
      const targets = ids.filter((id) => {
        const l = leadsRef.current.find((x) => x.id === id);
        return l && l.status !== status;
      });
      if (targets.length === 0) {
        pushToast('info', 'Nothing to change.');
        return;
      }
      const before = new Map(targets.map((id) => [id, leadsRef.current.find((l) => l.id === id)!.status]));
      setBulkBusy(true);
      setLeads((cur) => cur.map((l) => (before.has(l.id) ? { ...l, status } : l)));
      const { data, error } = await supabase.from('leads').update({ status }).in('id', targets).select('id');
      setBulkBusy(false);
      const saved = new Set((data ?? []).map((r) => String((r as { id: string }).id)));
      const failed = targets.filter((id) => !saved.has(id));
      if (error || failed.length > 0) {
        setLeads((cur) => cur.map((l) => (failed.includes(l.id) ? { ...l, status: before.get(l.id) ?? l.status } : l)));
        pushToast('error', `Couldn't update ${failed.length} lead${failed.length === 1 ? '' : 's'}${error ? `: ${error.message}` : '.'}`);
        if (error) return;
      }
      const okIds = targets.filter((id) => saved.has(id));
      okIds.forEach((id) => void recordOutcome(id, status));
      setChecked(new Set());
      const msg = `${okIds.length} lead${okIds.length === 1 ? '' : 's'} marked ${status}.`;
      if (status === 'Ignored') {
        pushToast('info', msg, {
          label: 'Undo',
          onClick: () => {
            // Restore each lead to the status it had before.
            const groups = new Map<Status, string[]>();
            okIds.forEach((id) => {
              const s = before.get(id) ?? 'New';
              groups.set(s, [...(groups.get(s) ?? []), id]);
            });
            groups.forEach((list, s) => void bulkStatus(list, s));
          },
        });
      } else {
        pushToast('success', msg);
      }
    },
    [pushToast],
  );

  const bulkNote = useCallback(
    async (ids: string[], text: string) => {
      setBulkBusy(true);
      const results = await Promise.all(
        ids.map((id) => {
          const existing = leadsRef.current.find((l) => l.id === id)?.notes;
          return patchLead(id, { notes: existing ? `${existing}\n${text}` : text }, "Couldn't save the note");
        }),
      );
      setBulkBusy(false);
      const n = results.filter(Boolean).length;
      if (n > 0) {
        pushToast('success', `Note added to ${n} lead${n === 1 ? '' : 's'}.`);
        setChecked(new Set());
      }
    },
    [patchLead, pushToast],
  );

  const handleDraft = useCallback(
    async (lead: Lead) => {
      setDrafting((cur) => new Set(cur).add(lead.id));
      const queued = await enqueueJob('draft_lead', { lead_id: lead.id });
      if (queued.error || !queued.job) {
        pushToast('error', `Could not start writing: ${queued.error ?? 'unknown error'}`);
      } else {
        const out = await waitForJob(queued.job.id);
        if (out.phase === 'done' && out.result?.ok !== false) {
          pushToast('success', 'Your pitch is ready.');
          void outreach.reload();
        } else {
          pushToast('error', out.error ?? 'The pitch could not be written.');
        }
      }
      setDrafting((cur) => {
        const next = new Set(cur);
        next.delete(lead.id);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pushToast, outreach.reload],
  );

  const handleEnrich = useCallback(
    async (lead: Lead) => {
      setEnriching((cur) => new Set(cur).add(lead.id));
      const ok = await patchLead(lead.id, { enrich_status: 'pending', enrich_error: null }, "Couldn't start the check");
      if (ok) {
        const queued = await enqueueJob('enrich_lead', { lead_id: lead.id });
        if (queued.error || !queued.job) {
          pushToast('error', `Could not start the check: ${queued.error ?? 'unknown error'}`);
        } else {
          const out = await waitForJob(queued.job.id);
          if (out.phase !== 'done') pushToast('error', out.error ?? 'The check failed.');
        }
      }
      setEnriching((cur) => {
        const next = new Set(cur);
        next.delete(lead.id);
        return next;
      });
    },
    [patchLead, pushToast],
  );

  // ---- derived data ----
  const outreachByLead = useMemo(() => groupByLead(outreach.rows), [outreach.rows]);
  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const alsoSeen = useMemo(() => {
    const m = new Map<string, AlsoSeenChip>();
    leads.forEach((l) => {
      const c = chipFor(identity.groups.get(l.id), leadsById, l);
      if (c) m.set(l.id, c);
    });
    return m;
  }, [leads, leadsById, identity.groups]);
  const repliesByLead = useMemo(() => {
    const m = new Map<string, typeof replies.rows>();
    [...replies.rows]
      .sort((a, b) => new Date(b.received_at ?? b.created_at).getTime() - new Date(a.received_at ?? a.created_at).getTime())
      .forEach((r) => {
        if (r.lead_id) m.set(r.lead_id, [...(m.get(r.lead_id) ?? []), r]);
      });
    return m;
  }, [replies.rows]);
  const sentToday = useMemo(() => sentTodayCount(outreach.rows), [outreach.rows]);

  const kindCounts = useMemo(() => {
    const c: Record<LeadsKind, number> = { all: 0, request: 0, prospect: 0 };
    leads.forEach((l) => {
      if (l.status === 'Ignored') return;
      c.all += 1;
      if (l.lead_kind === 'request') c.request += 1;
      else if (l.lead_kind === 'prospect') c.prospect += 1;
    });
    return c;
  }, [leads]);

  const kindLeads = useMemo(() => (state.kind === 'all' ? leads : leads.filter((l) => l.lead_kind === state.kind)), [leads, state.kind]);
  const sources = useMemo(() => Array.from(new Set(kindLeads.map((l) => l.source).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [kindLeads]);

  const stats: Stats = useMemo(
    () => ({
      total: kindLeads.length,
      newCount: kindLeads.filter((l) => l.status === 'New').length,
      inProgress: kindLeads.filter((l) => l.status === 'Pitched' || l.status === 'Replied').length,
      won: kindLeads.filter((l) => l.status === 'Won').length,
      flagged: kindLeads.filter((l) => l.status !== 'Ignored' && isFlagged(l)).length,
      last24h: kindLeads.filter((l) => now - new Date(l.created_at).getTime() < DAY_MS).length,
    }),
    [kindLeads, now],
  );

  const matching = useMemo(() => leads.filter((l) => matchesFilters(l, state)), [leads, state]);

  const statusCounts = useMemo(() => {
    const counts = { All: 0 } as Record<StatusTab, number>;
    STATUSES.forEach((s) => {
      counts[s] = 0;
    });
    matching.forEach((l) => {
      counts[l.status] += 1;
      if (l.status !== 'Ignored') counts.All += 1;
    });
    return counts;
  }, [matching]);

  const shown = useMemo(() => {
    const byStatus = matching.filter((l) => (state.status === 'All' ? l.status !== 'Ignored' : l.status === state.status));
    return sortLeads(byStatus, state.sort);
  }, [matching, state.status, state.sort]);

  const visibleLeads = useMemo(() => shown.slice(0, visible), [shown, visible]);
  const active = hasActiveFilters(state);
  const [autoOff, setAutoOff] = useState(false);
  const autoLead = isWide && !autoOff && !state.lead && !loading ? (visibleLeads[0]?.id ?? null) : null;
  const activeId = state.lead ?? autoLead;
  const selectedLead = activeId ? (leads.find((l) => l.id === activeId) ?? null) : null;

  const clearFilters = useCallback(() => {
    setState({ kind: 'all', q: '', status: DEFAULT_STATE.status, category: 'All', source: 'All', trust: 'All' });
  }, [setState]);

  const openLead = useCallback((id: string) => {
    setAutoOff(false);
    setState({ lead: id });
  }, [setState]);
  const closeLead = useCallback(() => {
    setAutoOff(true);
    setState({ lead: null });
  }, [setState]);

  const toggleChecked = useCallback((id: string, value: boolean) => {
    setChecked((cur) => {
      const next = new Set(cur);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const shownIds = useMemo(() => visibleLeads.map((l) => l.id), [visibleLeads]);
  const allChecked = shownIds.length > 0 && shownIds.every((id) => checked.has(id));
  const someChecked = shownIds.some((id) => checked.has(id));
  const checkedIds = useMemo(() => Array.from(checked).filter((id) => leads.some((l) => l.id === id)), [checked, leads]);

  // ---- keyboard shortcuts ----
  const kb = useRef({ shownIds, cursor, checked: checkedIds, selected: activeId });
  kb.current = { shownIds, cursor, checked: checkedIds, selected: activeId };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const { shownIds: ids, cursor: cur, checked: chk, selected } = kb.current;
      const move = (delta: number) => {
        if (ids.length === 0) return;
        const idx = cur ? ids.indexOf(cur) : -1;
        const next = ids[Math.max(0, Math.min(ids.length - 1, idx + delta))];
        setCursor(next);
        requestAnimationFrame(() => document.getElementById(`lead-${next}`)?.scrollIntoView({ block: 'nearest' }));
      };
      const target = () => (chk.length > 0 ? chk : cur ? [cur] : selected ? [selected] : []);
      switch (e.key) {
        case 'j':
          e.preventDefault();
          move(1);
          break;
        case 'k':
          e.preventDefault();
          move(-1);
          break;
        case 'Enter':
          if (cur && (e.target === document.body || !(e.target as HTMLElement).closest?.('button, a, [role="tab"], [role="radio"]'))) {
            e.preventDefault();
            openLead(cur);
          }
          break;
        case 'x':
          if (cur) {
            e.preventDefault();
            toggleChecked(cur, !chk.includes(cur));
          }
          break;
        case 'e': {
          const t = target();
          if (t.length) {
            e.preventDefault();
            if (t.length === 1) handleStatus(t[0], 'Ignored');
            else void bulkStatus(t, 'Ignored');
          }
          break;
        }
        case 'p': {
          const t = target();
          if (t.length) {
            e.preventDefault();
            if (t.length === 1) handleStatus(t[0], 'Pitched');
            else void bulkStatus(t, 'Pitched');
          }
          break;
        }
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case '?':
          e.preventDefault();
          setHelpOpen(true);
          break;
        case 'Escape':
          if (selected) closeLead();
          else if (chk.length) setChecked(new Set());
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openLead, closeLead, toggleChecked, handleStatus, bulkStatus]);

  // ---- rendering ----
  const detail = (mode: 'panel' | 'drawer') =>
    selectedLead && (
      <LeadDetail
        mode={mode}
        lead={selectedLead}
        rows={outreachByLead.get(selectedLead.id) ?? []}
        now={now}
        sending={sending}
        sentToday={sentToday}
        workerOnline={workerOnline}
        drafting={drafting.has(selectedLead.id)}
        enriching={enriching.has(selectedLead.id)}
        onClose={closeLead}
        onStatus={handleStatus}
        onNotes={handleNotes}
        onDraft={handleDraft}
        onEnrich={(l) => void handleEnrich(l)}
        onLeadPatch={handleLeadPatch}
        onReload={() => void outreach.reload()}
        pushToast={pushToast}
        identity={{ info: identity.groups.get(selectedLead.id), leadsById, outreachByLead, decide: identity.decide }}
        replies={repliesByLead.get(selectedLead.id) ?? []}
        onRepliesReload={() => void replies.reload()}
      />
    );

  const initialLoading = loading && leads.length === 0;
  const total = kindCounts.all;
  const cardsCols = isWide ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';

  const rowProps = (lead: Lead) => ({
    lead,
    now,
    outreach: outreachByLead.get(lead.id) ?? [],
    selected: activeId === lead.id,
    checked: checked.has(lead.id),
    cursor: cursor === lead.id,
    fresh: freshIds.has(lead.id),
    alsoSeen: alsoSeen.get(lead.id) ?? null,
    onOpen: openLead,
    onCheck: toggleChecked,
  });

  return (
    <PageContainer>
      <PageHeader
        title="Leads"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            People and businesses that may want a website, app or design from you. The best matches come first.
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle" title="New leads appear here the moment they are found">
              <span className="live-dot inline-block h-2 w-2 bg-success-solid" aria-hidden="true" />
              Live{newSinceLoad > 0 ? `, ${newSinceLoad} new since you opened this page` : ''}
            </span>
          </span>
        }
        actions={
          <>
            <IconButton label="Keyboard shortcuts" onClick={() => setHelpOpen(true)} variant="secondary">
              <span aria-hidden="true" className="text-sm font-semibold">
                ?
              </span>
            </IconButton>
            <Link href="/capture" className="btn btn-primary inline-flex min-h-8 items-center gap-1.5 rounded-ctl px-3 py-1.5 text-sm font-medium coarse:min-h-11">
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Add lead
            </Link>
          </>
        }
      />

      <div className="space-y-3">
        <OnboardingCard />
        <StatsBar stats={stats} loading={initialLoading} />
      </div>

      <div className={cx('mt-4 grid items-start gap-4', isWide && 'xl:grid-cols-[minmax(520px,58fr)_minmax(0,42fr)]')}>
        <div className="min-w-0 space-y-3">
          <div className="sticky top-14 z-20 -mx-1 px-1 pt-1">
            <FilterBar
              state={state}
              onChange={setState}
              sources={sources}
              statusCounts={statusCounts}
              kindCounts={kindCounts}
              hasActive={active}
              onClear={clearFilters}
              searchRef={searchRef}
            />
          </div>

          {loadError && (
            <Banner
              tone="danger"
              title="Could not load leads"
              action={
                <Button size="sm" onClick={() => void loadLeads()}>
                  Retry
                </Button>
              }
            >
              {loadError}
            </Banner>
          )}

          {initialLoading ? (
            <div className="glass rounded-card p-3">
              <SkeletonRows rows={8} rowClassName="h-16" />
            </div>
          ) : leads.length === 0 && !loadError ? (
            <EmptyState
              icon={<InboxIcon className="h-5 w-5" />}
              title="No leads yet"
              text="New leads show up here the moment your lead finders find them. You can also add one yourself from a post you found."
              action={
                <>
                  <Link href="/capture" className="btn btn-primary inline-flex min-h-8 items-center rounded-ctl px-3 py-1.5 text-sm font-medium">
                    Add a lead
                  </Link>
                  <Link href="/sources" className="btn btn-secondary inline-flex min-h-8 items-center rounded-ctl px-3 py-1.5 text-sm font-medium">
                    Where leads come from
                  </Link>
                </>
              }
            />
          ) : shown.length === 0 && !loadError ? (
            <EmptyState
              icon={<InboxIcon className="h-5 w-5" />}
              title={kindCounts.all === 0 ? 'Nothing here yet' : 'No leads match these filters'}
              text={
                state.kind === 'prospect' && kindLeads.length === 0
                  ? 'Turn on Local business search in Settings and add a city. The background helper then looks for businesses with no website.'
                  : 'Try a different search, or choose All to see every lead.'
              }
              action={
                active ? (
                  <Button variant="primary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-1 text-sm text-fg-subtle">
                <Checkbox
                  checked={allChecked}
                  indeterminate={!allChecked && someChecked}
                  onChange={(v) => setChecked(v ? new Set([...Array.from(checked), ...shownIds]) : new Set(Array.from(checked).filter((id) => !shownIds.includes(id))))}
                  label={<span className="text-[13px] text-fg-muted">Select all shown</span>}
                  className="p-2 coarse:p-3"
                />
                <p aria-live="polite">
                  Showing <span className="font-num">{visibleLeads.length}</span> of <span className="font-num">{shown.length}</span>
                  {capped ? ' (newest 5,000 loaded)' : ''}
                </p>
              </div>

              {state.view === 'list' ? (
                <ul className="glass overflow-hidden rounded-card" aria-label="Leads">
                  {visibleLeads.map((lead) => (
                    <LeadRow key={lead.id} {...rowProps(lead)} />
                  ))}
                </ul>
              ) : (
                <ul className={cx('grid grid-cols-1 gap-3', cardsCols)} aria-label="Leads">
                  {visibleLeads.map((lead) => (
                    <LeadGridCard key={lead.id} {...rowProps(lead)} />
                  ))}
                </ul>
              )}

              {visible < shown.length && (
                <div className="flex justify-center pb-2">
                  <Button onClick={() => setVisible((v) => v + CHUNK)} className="coarse:min-h-11">
                    Show {Math.min(CHUNK, shown.length - visible)} more ({shown.length - visible} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {isWide && (
          <aside aria-label="Lead details" className="glass sticky top-[4.5rem] h-[calc(100dvh-5.5rem)] overflow-hidden rounded-card">
            {selectedLead ? (
              detail('panel')
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg-subtle ring-1 ring-inset ring-border">
                  <InboxIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-fg">Pick a lead to see the details</p>
                <p className="max-w-xs text-sm text-fg-subtle">Click any lead on the left. Tip: j and k move up and down, ? shows every shortcut.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {isWide === false && (
        <Drawer open={!!selectedLead} onClose={closeLead} title={selectedLead?.title ?? 'Lead details'} hideTitle width="max-w-[640px]">
          {detail('drawer')}
        </Drawer>
      )}

      <BulkBar
        count={checkedIds.length}
        busy={bulkBusy}
        onPitched={() => void bulkStatus(checkedIds, 'Pitched')}
        onIgnore={() => void bulkStatus(checkedIds, 'Ignored')}
        onRestore={() => void bulkStatus(checkedIds, 'New')}
        onNote={() => setNoteOpen(true)}
        onClear={() => setChecked(new Set())}
      />
      <BulkNoteModal
        open={noteOpen}
        count={checkedIds.length}
        onClose={() => setNoteOpen(false)}
        onSave={(text) => {
          setNoteOpen(false);
          void bulkNote(checkedIds, text);
        }}
      />
      <ShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </PageContainer>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeadsView />
    </Suspense>
  );
}
