"use client";

import { CountUp, Skeleton } from '@/components/ui';

export type Stats = {
  total: number;
  newCount: number;
  inProgress: number;
  won: number;
  flagged: number;
  last24h: number;
};

/** Four plain numbers. Other counts live in the status tabs and the dashboard. */
export default function StatsBar({ stats, loading }: { stats: Stats; loading: boolean }) {
  const cells = [
    { label: 'New leads to look at', value: stats.newCount },
    { label: 'Found in the last 24 hours', value: stats.last24h },
    { label: 'In progress', value: stats.inProgress },
    { label: 'Won', value: stats.won },
  ];
  return (
    <section aria-label="Lead summary" className="glass grid grid-cols-2 gap-x-4 gap-y-3 rounded-card px-4 py-3.5 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0" aria-busy={loading}>
          {loading ? <Skeleton className="h-7 w-12" /> : <p className="font-num text-2xl font-semibold text-fg"><CountUp value={c.value} /></p>}
          <p className="mt-0.5 text-[13px] text-fg-subtle">{c.label}</p>
        </div>
      ))}
    </section>
  );
}
