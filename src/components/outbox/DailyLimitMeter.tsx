"use client";

import { CountUp, ProgressBar } from '../ui';

/** How many emails went out today against the daily limit from Settings. */
export default function DailyLimitMeter({ sent, limit, paused }: { sent: number; limit: number; paused: boolean }) {
  const reached = limit > 0 && sent >= limit;
  const near = limit > 0 && sent / limit >= 0.8;
  const tone = paused ? 'warning' : reached ? 'danger' : near ? 'warning' : 'primary';
  return (
    <div className="glass w-full min-w-[220px] rounded-card px-3.5 py-2.5 sm:w-64">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium text-fg-subtle">Sent today</p>
        <p className="font-num text-sm font-semibold text-fg">
          <CountUp value={sent} /> <span className="text-fg-subtle">/ {limit}</span>
        </p>
      </div>
      <ProgressBar className="mt-1.5" value={sent} max={Math.max(limit, 1)} tone={tone} label={`${sent} of ${limit} emails sent today`} />
      <p className="mt-1 text-xs text-fg-subtle">{reached ? 'Daily limit reached. The rest goes out tomorrow.' : `${Math.max(limit - sent, 0)} left today`}</p>
    </div>
  );
}
