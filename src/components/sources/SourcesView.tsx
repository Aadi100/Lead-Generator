"use client";

import Link from 'next/link';
import { Suspense, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell';
import { Badge, Banner, Button, Card, Chip, EmptyState, SkeletonRows, Stagger } from '@/components/ui';
import Advanced from '@/components/settings/Advanced';
import { RefreshIcon, SourcesIcon } from '@/components/Icons';
import { timeAgo } from '@/lib/format';
import { useSourcesData } from '@/lib/sources-data';
import { failingWorkflow, PLATFORM_WORKFLOWS, type SourceDef, type SourceRow, type SourceStatus } from '@/lib/sources-model';
import { AutomationCard } from './AutomationCard';
import { RunNow } from './RunNow';
import { STATUS_LABEL, StatusChip, StatusRules } from './StatusChip';

const KIND_LABEL: Record<SourceDef['kind'], string> = { n8n: 'Lead finder (n8n)', worker: 'Background helper', manual: 'Manual' };
const FILTERS: ('all' | SourceStatus)[] = ['all', 'problem', 'needs_key', 'quiet', 'healthy', 'off'];
const LINK_BTN = 'btn inline-flex min-h-9 items-center rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2';

/** The one action for a source: Add key when it needs one, otherwise Run now, otherwise Switch on. */
function MainAction({ row, workerOn, onDone }: { row: SourceRow; workerOn: boolean; onDone: () => void }) {
  const { def } = row;
  if (row.status === 'needs_key')
    return (
      <Link href={def.configure.href} className={LINK_BTN}>
        Add key<span className="sr-only">: {def.name}</span>
      </Link>
    );
  if (def.job) return <RunNow def={def} disabled={!workerOn} disabledReason="The background helper is off." onDone={onDone} />;
  if (row.status === 'off')
    return (
      <Link href={def.configure.href} className={LINK_BTN}>
        Switch on<span className="sr-only">: {def.name}</span>
      </Link>
    );
  return null;
}

/** Last result in plain words, e.g. "5 new leads today, latest 2 h ago". */
function lastResult(row: SourceRow, ago: (iso: string | null) => string): string {
  if (row.def.leadless) return row.status === 'healthy' ? 'Runs in the background.' : row.reason;
  if (row.status === 'needs_key' || row.status === 'off') return row.reason;
  const { d1, d7, last } = row.stats;
  if (!last) return 'No leads yet.';
  const n = d1 > 0 ? `${d1} new ${d1 === 1 ? 'lead' : 'leads'} today` : `${d7} new ${d7 === 1 ? 'lead' : 'leads'} this week`;
  return `${n}, latest ${ago(last)}`;
}

function SourceCard({ row, ago, workerOn, onDone }: { row: SourceRow; ago: (iso: string | null) => string; workerOn: boolean; onDone: () => void }) {
  const { def } = row;
  const msg = row.lastRun?.ok && row.lastRun.checked_at && row.lastRun.message ? row.lastRun.message.replace(/^Working[^.]*\.\s*(Last run:\s*)?/i, '') : null;
  return (
    <li className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-fg">{def.name}</p>
          <p className="mt-0.5 text-sm text-fg-muted">{lastResult(row, ago)}</p>
        </div>
        <StatusChip status={row.status} reason={row.reason} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MainAction row={row} workerOn={workerOn} onDone={onDone} />
        <details className="w-full text-sm">
          <summary className="inline-flex min-h-9 cursor-pointer items-center font-semibold text-primary-text">Show details</summary>
          <div className="mt-1 space-y-2 border-t border-border pt-2 text-[13px] text-fg-muted">
            <p>{row.status === 'healthy' || row.status === 'quiet' ? def.hint : row.reason}</p>
            {msg && row.lastRun?.checked_at && (
              <p>
                Last run {timeAgo(row.lastRun.checked_at)}: {msg}
              </p>
            )}
            <p>
              {KIND_LABEL[def.kind]} · runs {def.schedule}
            </p>
            {!def.leadless && (
              <p>
                Last 24 hours: {row.stats.d1} · last 7 days: {row.stats.d7} · average trust: {row.stats.trustAvg ?? '-'}
              </p>
            )}
            <Link href={def.configure.href} className="inline-block font-medium text-primary-text hover:underline">
              {def.configure.label || 'Configure'}
              <span className="sr-only">: {def.name}</span>
            </Link>
          </div>
        </details>
      </div>
    </li>
  );
}

function SourcesBody() {
  const data = useSourcesData();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('status');
  const filter: 'all' | SourceStatus = FILTERS.includes(raw as never) ? (raw as SourceStatus) : 'all';
  const setFilter = useCallback(
    (f: 'all' | SourceStatus) => {
      const p = new URLSearchParams(params.toString());
      if (f === 'all') p.delete('status');
      else p.set('status', f);
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const { rows, ctx, loading, error } = data;
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const ago = (iso: string | null) => (iso ? timeAgo(iso, ctx.now) : 'never');

  const platform = PLATFORM_WORKFLOWS.map((w) => {
    const failing = failingWorkflow(ctx, { id: w.id, name: w.name, kind: 'n8n', schedule: w.schedule, hint: '', workflow: w.workflow, configure: { href: '', label: '' } });
    const status: SourceStatus = !ctx.n8nOnline || failing ? 'problem' : 'healthy';
    const reason = !ctx.n8nOnline ? 'The lead finders (n8n) have not checked in for over 15 minutes.' : failing ? `Failed recently: ${ctx.n8n.last_error?.message ?? ''}` : 'Online, with no recent failure.';
    return { ...w, status, reason };
  });

  return (
    <PageContainer>
      <PageHeader
        title="Sources"
        subtitle="Where leads come from, and whether each place is working."
        actions={
          <Button variant="primary" leftIcon={<RefreshIcon className="h-4 w-4" />} onClick={() => void data.refresh()}>
            Refresh
          </Button>
        }
      />

      {error && (
        <Banner tone="danger" title="Could not load the sources" className="mb-4" action={<Button size="sm" onClick={() => void data.refresh()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      <div className="space-y-5">
        {!loading && <AutomationCard data={data} />}

        <section aria-label="Where leads come from">
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <Chip key={f} selected={filter === f} onClick={() => setFilter(f)} count={counts[f] ?? 0}>
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
              </Chip>
            ))}
            <span className="ml-auto">
              <StatusRules />
            </span>
          </div>
          {loading ? (
            <SkeletonRows rows={6} rowClassName="h-24" />
          ) : shown.length === 0 ? (
            <EmptyState icon={<SourcesIcon className="h-5 w-5" />} title="Nothing with this status" text="Everything is in a different state." action={<Button onClick={() => setFilter('all')}>Show all sources</Button>} />
          ) : (
            <Stagger as="ul" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" step={30}>
              {shown.map((r) => (
                <SourceCard key={r.def.id} row={r} ago={ago} workerOn={ctx.workerOnline} onDone={() => void data.refresh()} />
              ))}
            </Stagger>
          )}
          <p className="mt-2 px-1 text-xs text-fg-subtle">{data.capped ? 'Counts use your 5,000 newest leads.' : `${data.leadCount.toLocaleString()} leads counted.`}</p>
        </section>

        <Advanced id="sources-platform" title="Show details" hint="The housekeeping jobs behind the lead finders.">
          <Card title="Lead finder housekeeping" subtitle="The jobs that keep the lead finders and alerts running." padding="none">
            {loading ? (
              <SkeletonRows rows={5} className="p-4" rowClassName="h-10" />
            ) : (
              <ul className="divide-y divide-border">
                {platform.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{w.name}</p>
                      <p className="text-xs text-fg-subtle">{w.purpose}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge>{w.schedule}</Badge>
                      <StatusChip status={w.status} reason={w.reason} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Advanced>
      </div>
    </PageContainer>
  );
}

export default function SourcesView() {
  return (
    <Suspense fallback={null}>
      <SourcesBody />
    </Suspense>
  );
}
