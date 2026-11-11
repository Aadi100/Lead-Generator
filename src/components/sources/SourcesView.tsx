"use client";

import Link from 'next/link';
import { Suspense, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell';
import { Badge, Banner, Button, Card, Chip, EmptyState, Skeleton, SkeletonRows, Stagger, Table, THead, Th, Tr, Td } from '@/components/ui';
import { RefreshIcon, SourcesIcon } from '@/components/Icons';
import { timeAgo } from '@/lib/format';
import { useSourcesData } from '@/lib/sources-data';
import { failingWorkflow, PLATFORM_WORKFLOWS, type SourceDef, type SourceRow, type SourceStatus } from '@/lib/sources-model';
import { AutomationCard } from './AutomationCard';
import { RunNow } from './RunNow';
import { STATUS_LABEL, StatusChip, StatusRules } from './StatusChip';

const KIND_LABEL: Record<SourceDef['kind'], string> = { n8n: 'n8n scraper', worker: 'Worker', manual: 'Manual' };
const FILTERS: ('all' | SourceStatus)[] = ['all', 'problem', 'needs_key', 'quiet', 'healthy', 'off'];

function Actions({ row, workerOn, onDone }: { row: SourceRow; workerOn: boolean; onDone: () => void }) {
  const { def } = row;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {def.job && <RunNow def={def} disabled={!workerOn || row.status === 'needs_key'} disabledReason={!workerOn ? 'The worker is off.' : 'Fix the setup first.'} onDone={onDone} />}
      <Link href={def.configure.href} className="btn inline-flex min-h-7 items-center rounded-ctl border border-border-strong bg-surface px-2.5 py-1 text-[13px] font-medium text-fg hover:bg-surface-2">
        Configure<span className="sr-only">: {def.name}</span>
      </Link>
    </div>
  );
}

function Name({ row }: { row: SourceRow }) {
  return (
    <div className="min-w-0">
      <p className="font-medium text-fg">{row.def.name}</p>
      <p className="mt-0.5 max-w-[34ch] text-xs text-fg-subtle">{row.status === 'healthy' || row.status === 'quiet' ? row.def.hint : row.reason}</p>
      {row.lastRun?.ok && row.lastRun.checked_at && row.lastRun.message && (
        <p className="mt-0.5 max-w-[34ch] text-xs text-fg-muted">
          Last run {timeAgo(row.lastRun.checked_at)}: {row.lastRun.message.replace(/^Working[^.]*\.\s*(Last run:\s*)?/i, '')}
        </p>
      )}
    </div>
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
  const ago = (iso: string | null) => (iso ? timeAgo(iso, ctx.now) : 'Never');

  const platform = PLATFORM_WORKFLOWS.map((w) => {
    const failing = failingWorkflow(ctx, { id: w.id, name: w.name, kind: 'n8n', schedule: w.schedule, hint: '', workflow: w.workflow, configure: { href: '', label: '' } });
    const status: SourceStatus = !ctx.n8nOnline || failing ? 'problem' : 'healthy';
    const reason = !ctx.n8nOnline ? 'n8n has not checked in for over 15 minutes.' : failing ? `Failed recently: ${ctx.n8n.last_error?.message ?? ''}` : 'n8n is online and this workflow has no recent failure.';
    return { ...w, status, reason };
  });

  return (
    <PageContainer>
      <PageHeader
        title="Sources"
        subtitle="Where leads come from and whether each source is working."
        actions={
          <Button variant="secondary" leftIcon={<RefreshIcon className="h-4 w-4" />} onClick={() => void data.refresh()}>
            Refresh
          </Button>
        }
      />

      {error && (
        <Banner tone="danger" title="Could not load source health" className="mb-4" action={<Button size="sm" onClick={() => void data.refresh()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      <div className="space-y-5">
        {loading ? (
          <Card title="Automation health">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          </Card>
        ) : (
          <AutomationCard data={data} />
        )}

        <Card
          title="Lead sources"
          subtitle={data.capped ? 'Counts use your 2,000 most recent leads.' : `${data.leadCount} leads counted, newest first.`}
          padding="none"
          actions={<StatusRules />}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <Chip key={f} selected={filter === f} onClick={() => setFilter(f)} count={counts[f] ?? 0}>
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
              </Chip>
            ))}
          </div>

          {loading ? (
            <SkeletonRows rows={7} className="p-4" rowClassName="h-12" />
          ) : shown.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<SourcesIcon className="h-5 w-5" />}
                title="No sources with this status"
                text="Everything is in a different state. Show all sources to see the full list."
                action={<Button onClick={() => setFilter('all')}>Show all sources</Button>}
              />
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table caption="Lead sources and their health" className="rounded-none border-0">
                  <THead>
                    <tr>
                      <Th>Source</Th>
                      <Th>Kind</Th>
                      <Th>Status</Th>
                      <Th>Last lead</Th>
                      <Th align="right">24 h</Th>
                      <Th align="right">7 d</Th>
                      <Th align="right">Avg trust</Th>
                      <Th>Actions</Th>
                    </tr>
                  </THead>
                  <tbody>
                    {shown.map((r) => (
                      <Tr key={r.def.id}>
                        <Td>
                          <Name row={r} />
                        </Td>
                        <Td className="whitespace-nowrap">
                          <p className="text-fg">{KIND_LABEL[r.def.kind]}</p>
                          <p className="text-xs text-fg-subtle">{r.def.schedule}</p>
                        </Td>
                        <Td>
                          <StatusChip status={r.status} reason={r.reason} />
                        </Td>
                        <Td className="whitespace-nowrap text-fg-muted">{r.def.leadless ? '-' : ago(r.stats.last)}</Td>
                        <Td numeric>{r.def.leadless ? '-' : r.stats.d1}</Td>
                        <Td numeric>{r.def.leadless ? '-' : r.stats.d7}</Td>
                        <Td numeric>{r.stats.trustAvg ?? '-'}</Td>
                        <Td>
                          <Actions row={r} workerOn={ctx.workerOnline} onDone={() => void data.refresh()} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <Stagger className="divide-y divide-border md:hidden" step={30}>
                {shown.map((r) => (
                  <div key={r.def.id} className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Name row={r} />
                      <StatusChip status={r.status} reason={r.reason} />
                    </div>
                    <p className="text-xs text-fg-subtle">
                      {KIND_LABEL[r.def.kind]} · {r.def.schedule}
                    </p>
                    {!r.def.leadless && (
                      <dl className="grid grid-cols-4 gap-2 text-xs">
                        {[
                          ['Last lead', ago(r.stats.last)],
                          ['24 h', String(r.stats.d1)],
                          ['7 d', String(r.stats.d7)],
                          ['Avg trust', r.stats.trustAvg != null ? String(r.stats.trustAvg) : '-'],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-fg-subtle">{k}</dt>
                            <dd className="font-num mt-0.5 text-[13px] text-fg">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <Actions row={r} workerOn={ctx.workerOnline} onDone={() => void data.refresh()} />
                  </div>
                ))}
              </Stagger>
            </>
          )}
        </Card>

        <Card title="n8n platform workflows" subtitle="The housekeeping workflows that keep the scrapers and alerts running." padding="none">
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
