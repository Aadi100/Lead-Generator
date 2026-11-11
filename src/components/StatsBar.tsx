"use client";

import { CountUp, Skeleton, StatTile } from '@/components/ui';

export type Stats = {
  total: number;
  newCount: number;
  inProgress: number;
  won: number;
  flagged: number;
  last24h: number;
};

type Cell = { label: string; value: number; hint: string; tone: 'neutral' | 'info' | 'primary' | 'success' | 'danger' | 'accent' };

/** KPI strip for the Leads page: six compact tiles. */
export default function StatsBar({ stats, loading }: { stats: Stats; loading: boolean }) {
  const cells: Cell[] = [
    { label: 'Total leads', value: stats.total, hint: 'in this list', tone: 'neutral' },
    { label: 'New', value: stats.newCount, hint: 'not contacted yet', tone: 'info' },
    { label: 'In progress', value: stats.inProgress, hint: 'pitched or replied', tone: 'primary' },
    { label: 'Won', value: stats.won, hint: 'became clients', tone: 'success' },
    { label: 'Needs checking', value: stats.flagged, hint: 'suspicious or low trust', tone: 'danger' },
    { label: 'Last 24 hours', value: stats.last24h, hint: 'found today', tone: 'accent' },
  ];
  return (
    <section aria-label="Lead summary" className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-6">
      {cells.map((c) =>
        loading ? (
          <div key={c.label} className="glass w-36 shrink-0 rounded-card p-3.5 sm:w-auto" aria-busy="true">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-7 w-12" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ) : (
          <StatTile key={c.label} label={c.label} value={<CountUp value={c.value} />} sub={c.hint} tone={c.tone} className="glass w-36 shrink-0 sm:w-auto" />
        ),
      )}
    </section>
  );
}
