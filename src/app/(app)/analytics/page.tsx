"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useJob } from '@/lib/jobs';
import { defaultSetting, loadSettings } from '@/lib/settings';
import { fmtDateTime, itemLabel } from '@/lib/format';
import type { FilterLearning, TradeMarket, WritingRules } from '@/lib/types';
import {
  RANGES,
  bucketize,
  buildPerf,
  downloadCsv,
  fetchAnalytics,
  isContacted,
  isReplied,
  parseRange,
  pct,
  pctText,
  toCsv,
  trustBands,
  type AnalyticsData,
  type PerfRow,
} from '@/lib/analytics-data';
import { useShell } from '@/components/AppShell';
import { PageContainer, PageHeader } from '@/components/shell/PageHeader';
import { BarList, Banner, Button, Card, CountUp, EmptyState, FunnelChart, JobNote, SegmentedControl, Skeleton, StatTile, Reveal, Stagger } from '@/components/ui';
import { AnalyticsIcon, RefreshIcon, SparkIcon } from '@/components/Icons';
import TimeBars from '@/components/analytics/TimeBars';
import PerfTable from '@/components/analytics/PerfTable';
import WhatWinsPanel from '@/components/analytics/WhatWinsPanel';

type By = 'source' | 'category';

function ChartSkeleton({ h = 'h-48' }: { h?: string }) {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading</span>
      <Skeleton className={`${h} w-full`} />
    </div>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function AnalyticsView() {
  const router = useRouter();
  const params = useSearchParams();
  const { pushToast } = useShell();
  const range = parseRange(params.get('range'));
  const by: By = params.get('by') === 'category' ? 'category' : 'source';

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [learning, setLearning] = useState<FilterLearning>(() => defaultSetting('filter_learning'));
  const [rules, setRules] = useState<WritingRules>(() => defaultSetting('writing_rules'));
  const [market, setMarket] = useState<TradeMarket>(() => defaultSetting('trade_market'));
  const filtersJob = useJob();
  const writingJob = useJob();

  const setParam = (k: string, v: string, dflt: string) => {
    const next = new URLSearchParams(params.toString());
    if (v === dflt) next.delete(k);
    else next.set(k, v);
    const qs = next.toString();
    router.replace(qs ? `/analytics?${qs}` : '/analytics', { scroll: false });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(null);
    try {
      const [d, s] = await Promise.all([fetchAnalytics(range), loadSettings(['filter_learning', 'writing_rules', 'trade_market'])]);
      setData(d);
      if (!s.error) {
        setLearning(s.values.filter_learning);
        setRules(s.values.writing_rules);
        setMarket(s.values.trade_market);
      }
      setSettingsLoaded(true);
      const all = [...d.errors, ...(s.error ? [`Settings: ${s.error}`] : [])];
      setFailed(all.length ? all.join('. ') : null);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not load analytics.');
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const stats = useMemo(() => {
    const pitched = leads.filter((l) => isContacted(l.status)).length;
    const replied = leads.filter((l) => isReplied(l.status)).length;
    const won = leads.filter((l) => l.status === 'Won').length;
    const lost = leads.filter((l) => l.status === 'Lost').length;
    const ignored = leads.filter((l) => l.status === 'Ignored').length;
    return { pitched, replied, won, lost, ignored };
  }, [leads]);

  const leadSeries = useMemo(
    () => bucketize(range, leads.map((l) => ({ at: l.created, series: l.kind === 'trade' ? ('b' as const) : ('a' as const) }))),
    [leads, range],
  );
  const outSeries = useMemo(
    () =>
      bucketize(range, [
        ...(data?.sent ?? []).map((s) => ({ at: s.sent, series: 'a' as const })),
        ...(data?.replies ?? []).map((r) => ({ at: r.at, series: 'b' as const })),
      ]),
    [data, range],
  );
  const perfSource = useMemo(() => buildPerf(leads, (l) => l.source), [leads]);
  const perfCategory = useMemo(() => buildPerf(leads, (l) => l.category), [leads]);
  const perf: PerfRow[] = by === 'source' ? perfSource : perfCategory;
  const trust = useMemo(() => trustBands(leads), [leads]);

  const sentCount = data?.sent.length ?? 0;
  const replyCount = data?.replies.length ?? 0;
  const replyRate = pct(replyCount, sentCount);
  const perDay = sentCount / range;

  const exportCsv = () => {
    const csv = toCsv(
      [by === 'source' ? 'Source' : 'Category', 'Leads', 'Pitched', 'Replied', 'Won', 'Win rate %', 'Average trust'],
      perf.map((r) => [r.name, r.leads, r.pitched, r.replied, r.won, r.winRate, r.avgTrust]),
    );
    downloadCsv(`lead-radar-${by}-last-${range}-days.csv`, csv);
    pushToast('success', 'Table saved as a CSV file.');
  };

  const refreshFilters = async () => {
    const out = await filtersJob.start('learn_filters', {});
    if (out.phase === 'done') pushToast('success', 'Learning refreshed.');
    else pushToast('error', out.error ?? 'Could not refresh learning.');
    void load();
  };
  const learnWriting = async () => {
    const out = await writingJob.start('learn_writing', {});
    if (out.phase === 'done') pushToast('success', out.result?.changed === false ? 'Nothing new to learn yet.' : 'Writing rules updated.');
    else pushToast('error', out.error ?? 'Could not learn from your edits.');
    void load();
  };

  const events = data?.events ?? {};
  const learnedFrom = (events.draft_edit ?? 0) + (events.rating ?? 0) + (events.rewrite_instruction ?? 0);
  const notes = Array.isArray(writingJob.result?.notes) ? (writingJob.result?.notes as unknown[]).filter((n): n is string => typeof n === 'string') : [];
  const ruleLines = rules.markdown
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .slice(0, 6);
  const marketRows = [...market.rows].sort((a, b) => b.wanted - a.wanted || b.offered - a.offered).slice(0, 5);

  const funnelStages = [
    { label: 'Leads found', value: leads.length, tone: 'info' as const },
    { label: 'Pitched', value: stats.pitched, tone: 'primary' as const },
    { label: 'Replied', value: stats.replied, tone: 'warning' as const },
    { label: 'Won', value: stats.won, tone: 'success' as const },
  ];
  const noLeads = !loading && leads.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        subtitle="See which leads turn into clients, how your outreach is doing, and what the system has learned from you."
        actions={
          <>
            <SegmentedControl
              label="Date range"
              value={String(range)}
              onChange={(v) => setParam('range', v, '30')}
              options={RANGES.map((r) => ({ id: String(r), label: `${r} days` }))}
            />
            <Button variant="secondary" onClick={() => void load()} disabled={loading} aria-label="Reload analytics">
              <RefreshIcon className="h-4 w-4" />
              Reload
            </Button>
          </>
        }
      />

      {failed && (
        <Banner
          tone="danger"
          title="Some numbers could not be loaded"
          className="mb-4"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {failed}
        </Banner>
      )}
      {data?.leadsCapped && (
        <Banner tone="info" className="mb-4">
          This period has a lot of leads, so the numbers use the newest {data.leads.length.toLocaleString()}. Pick a shorter range for exact figures.
        </Banner>
      )}

      {/* KPI row */}
      <Stagger className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />)
          : [
              <StatTile key="n" label="New leads" value={<CountUp value={leads.length} />} sub={`Last ${range} days`} tone="info" />,
              <StatTile key="s" label="Messages sent" value={<CountUp value={sentCount} />} sub={`About ${perDay < 10 ? perDay.toFixed(1) : Math.round(perDay)} per day`} tone="primary" />,
              <StatTile key="r" label="Reply rate" value={pctText(replyRate)} sub={`${replyCount} ${replyCount === 1 ? 'reply' : 'replies'} to ${sentCount} sent`} tone="warning" />,
              <StatTile key="w" label="Won" value={<CountUp value={stats.won} />} sub={`Win rate ${pctText(pct(stats.won, stats.pitched))} of pitched`} tone="success" />,
            ]}
      </Stagger>

      {noLeads && !failed && (
        <EmptyState
          className="mb-4"
          icon={<AnalyticsIcon className="h-5 w-5" />}
          title="Nothing to chart in this period yet"
          text="Charts fill in by themselves. The worker finds leads, you pitch them and mark replies and wins, and each step adds to these numbers. Try a longer date range, or check that your sources are switched on."
          action={
            <Link href="/sources" className="btn inline-flex min-h-9 items-center rounded-ctl bg-primary px-3.5 text-sm font-semibold text-primary-on hover:bg-primary-hover">
              Open sources
            </Link>
          }
        />
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Reveal className="lg:col-span-2">
          <Card title="From new lead to client" subtitle={`Leads found in the last ${range} days`} className="h-full">
            {loading ? (
              <ChartSkeleton />
            ) : (
              <>
                <FunnelChart stages={funnelStages} />
                <p className="mt-3 text-[13px] text-fg-subtle">
                  Also in this period: <span className="font-num font-semibold text-fg">{stats.lost}</span> lost and <span className="font-num font-semibold text-fg">{stats.ignored}</span> ignored.
                </p>
              </>
            )}
          </Card>
        </Reveal>
        <Reveal delay={60} className="lg:col-span-3">
          <Card title="New leads over time" subtitle={range > 30 ? 'One bar per week' : 'One bar per day'} className="h-full">
            {loading ? (
              <ChartSkeleton />
            ) : leads.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-subtle">No new leads in this period.</p>
            ) : (
              <TimeBars
                buckets={leadSeries.buckets}
                unit={leadSeries.unit}
                mode="stacked"
                title="New leads over time"
                a={{ name: 'Services leads', cls: 'fill-primary', swatch: 'bg-primary' }}
                b={{ name: 'Game trading leads', cls: 'fill-accent', swatch: 'bg-accent' }}
              />
            )}
          </Card>
        </Reveal>
      </div>

      <Reveal className="mt-4">
        <Card
          title="What is working"
          subtitle="Pitched means a message was sent or the lead was marked as contacted. Win rate is won divided by pitched."
          actions={
            <>
              <SegmentedControl
                label="Group by"
                size="sm"
                value={by}
                onChange={(v) => setParam('by', v, 'source')}
                options={[
                  { id: 'source', label: 'By source' },
                  { id: 'category', label: 'By category' },
                ]}
              />
              <Button variant="secondary" size="sm" onClick={exportCsv} disabled={loading || perf.length === 0}>
                <DownloadIcon className="h-4 w-4" />
                Export CSV
              </Button>
            </>
          }
        >
          {loading ? <ChartSkeleton h="h-56" /> : <PerfTable rows={perf} nameLabel={by === 'source' ? 'Source' : 'Category'} caption={`Lead performance by ${by}, last ${range} days`} />}
        </Card>
      </Reveal>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Reveal className="lg:col-span-2">
          <Card title="How trustworthy are the leads" subtitle="Trust score from 0 to 100. Higher is safer." className="h-full">
            {loading ? (
              <ChartSkeleton />
            ) : leads.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-subtle">Trust scores appear once leads have been found.</p>
            ) : (
              <>
                <BarList items={trust.rows} tone="success" format={(v) => `${v} (${pctText(pct(v, leads.length))})`} />
                {trust.none > 0 && <p className="mt-3 text-[13px] text-fg-subtle">{trust.none} leads have no trust score yet.</p>}
              </>
            )}
          </Card>
        </Reveal>
        <Reveal delay={60} className="lg:col-span-3">
          <Card title="Outreach" subtitle="Messages sent and replies received" className="h-full">
            {loading ? (
              <ChartSkeleton />
            ) : sentCount === 0 && replyCount === 0 ? (
              <p className="py-8 text-center text-sm text-fg-subtle">
                Nothing sent in this period. Approve a draft in the{' '}
                <Link href="/outbox" className="font-semibold text-primary-text hover:underline">
                  Outbox
                </Link>{' '}
                and this chart starts to fill in. Replies are matched back to your messages automatically.
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-fg-muted">
                  <span className="font-num font-semibold text-fg">{sentCount}</span> sent, <span className="font-num font-semibold text-fg">{replyCount}</span> replied, reply rate{' '}
                  <span className="font-num font-semibold text-fg">{pctText(replyRate)}</span>.
                </p>
                <TimeBars
                  buckets={outSeries.buckets}
                  unit={outSeries.unit}
                  mode="grouped"
                  title="Messages sent and replies received"
                  a={{ name: 'Sent', cls: 'fill-primary', swatch: 'bg-primary' }}
                  b={{ name: 'Replies', cls: 'fill-success-solid', swatch: 'bg-success-solid' }}
                />
              </>
            )}
          </Card>
        </Reveal>
      </div>

      <Reveal className="mt-4">
        <WhatWinsPanel />
      </Reveal>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <Card
            title="What the system has learned about your leads"
            subtitle={learning.generated_at ? `Updated ${fmtDateTime(learning.generated_at)}` : 'Not learned yet'}
            className="h-full"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void refreshFilters()} disabled={filtersJob.running} loading={filtersJob.running}>
                <RefreshIcon className="h-4 w-4" />
                Refresh learning
              </Button>
            }
          >
            <JobNote phase={filtersJob.phase} error={filtersJob.error} runningText="Working it out…" />
            {!settingsLoaded ? (
              <ChartSkeleton h="h-24" />
            ) : learning.insights.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
                {learning.insights.map((i) => (
                  <li key={i} className="break-words">
                    {i}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-fg-subtle">Patterns show up here after you have pitched, ignored or won a few leads, for example which sources you always skip. Mark leads as you work them, then press Refresh learning.</p>
            )}
            {learning.suggested_hide.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-fg-subtle">You might want to hide</p>
                <ul className="mt-1.5 space-y-1.5 text-sm text-fg-muted">
                  {learning.suggested_hide.map((s) => (
                    <li key={`${s.kind}-${s.value}`} className="break-words">
                      <span className="rounded-ctl bg-surface-2 px-1.5 py-0.5 font-medium text-fg ring-1 ring-inset ring-border">{s.value}</span> <span className="text-fg-subtle">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </Reveal>

        <Reveal delay={60}>
          <Card
            title="How the system writes for you"
            subtitle={
              rules.updated_at
                ? `Rules ${rules.source === 'learned' ? 'learned from you' : rules.source === 'manual' ? 'written by you' : 'are the defaults'}, updated ${fmtDateTime(rules.updated_at)}`
                : 'Rules are the defaults so far'
            }
            className="h-full"
            actions={
              <>
                <Link href="/settings#writing" className="btn inline-flex min-h-8 items-center rounded-ctl border border-border bg-surface px-3 text-[13px] font-semibold text-fg hover:bg-surface-2">
                  Edit rules
                </Link>
                <Button variant="primary" size="sm" onClick={() => void learnWriting()} disabled={writingJob.running} loading={writingJob.running}>
                  <SparkIcon className="h-4 w-4" />
                  Learn from my edits now
                </Button>
              </>
            }
          >
            <p className="text-sm text-fg-muted">
              Learned from <span className="font-num font-semibold text-fg">{learnedFrom}</span> {learnedFrom === 1 ? 'thing' : 'things'} you did: {events.draft_edit ?? 0} edited drafts, {events.rating ?? 0} thumbs, {events.rewrite_instruction ?? 0} rewrite requests
              {events.reply ? `, and ${events.reply} replies` : ''}.
            </p>
            <JobNote phase={writingJob.phase} error={writingJob.error} runningText="Reading your edits. This takes about half a minute…" />
            {notes.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
                {notes.map((n) => (
                  <li key={n} className="break-words">
                    {n}
                  </li>
                ))}
              </ul>
            )}
            {ruleLines.length > 0 ? (
              <div className="mt-3 rounded-ctl border border-border bg-surface-2 p-3">
                <p className="text-xs font-semibold text-fg-subtle">Current rules</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-fg-muted">
                  {ruleLines.map((l) => (
                    <li key={l} className="break-words">
                      {l.replace(/^[-*]\s*/, '')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-sm text-fg-subtle">Edit a few drafts in the Outbox, then press Learn from my edits now and your style rules appear here.</p>
            )}
          </Card>
        </Reveal>
      </div>

      <Reveal className="mt-4">
        <Card
          title="Game market"
          subtitle={market.generated_at ? `Last ${market.days} days, updated ${fmtDateTime(market.generated_at)}. ${market.totals.trade_leads} trade posts counted.` : 'What people want to buy in game trading posts'}
          actions={
            <Link href="/trading/market" className="btn inline-flex min-h-8 items-center rounded-ctl border border-border bg-surface px-3 text-[13px] font-semibold text-fg hover:bg-surface-2">
              Open market
            </Link>
          }
        >
          {!settingsLoaded ? (
            <ChartSkeleton h="h-28" />
          ) : marketRows.length === 0 ? (
            <p className="text-sm text-fg-subtle">Nothing here yet. This fills in after game trading is switched on in Settings and a few days of posts have been collected.</p>
          ) : (
            <BarList
              items={marketRows.map((r) => ({
                label: `${r.game}, ${itemLabel(r.item_type)}`,
                value: r.wanted,
                sub: `${r.wanted} want to buy, ${r.offered} selling${r.ratio !== null ? `, demand ${r.ratio.toFixed(1)} times supply` : ''}`,
              }))}
              tone="info"
              format={(v) => `${v} buyers`}
            />
          )}
        </Card>
      </Reveal>
    </PageContainer>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<PageContainer><Skeleton className="h-64 w-full" /></PageContainer>}>
      <AnalyticsView />
    </Suspense>
  );
}
