"use client";

import { useId } from 'react';
import { itemLabel } from '@/lib/format';
import { money, type WeeklyTrend } from '@/lib/trading-stats';
import type { TradeMarketRow } from '@/lib/types';

/** Demand vs supply as paired bars. Every number is printed, and the list itself is the text alternative. */
export function PairedBars({ rows, label }: { rows: TradeMarketRow[]; label: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.wanted, r.offered]));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> People who want to buy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-success-solid" /> People selling
        </span>
      </div>
      <ul aria-label={label} className="space-y-3.5">
        {rows.map((r) => (
          <li key={`${r.game}|${r.item_type}`}>
            <p className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-[13px]">
              <span className="min-w-0 truncate font-medium text-fg">
                {r.game} <span className="font-normal text-fg-subtle">{itemLabel(r.item_type)}</span>
              </span>
              <span className="sr-only">
                {r.wanted} buyers and {r.offered} sellers
              </span>
            </p>
            {(
              [
                ['Buyers', r.wanted, 'bg-primary'],
                ['Sellers', r.offered, 'bg-success-solid'],
              ] as const
            ).map(([name, value, color]) => (
              <div key={name} className="mt-1 flex items-center gap-2" aria-hidden="true">
                <span className="w-12 shrink-0 text-[11px] text-fg-subtle">{name}</span>
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(value ? 3 : 0, (value / max) * 100)}%` }} />
                </div>
                <span className="font-num w-8 shrink-0 text-right text-xs font-semibold text-fg">{value}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

const LINE_COLORS = ['text-primary-text', 'text-success', 'text-warning', 'text-info'];
const DASHES = ['', '6 3', '2 3', '10 3 2 3'];

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function niceCeil(v: number): number {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Weekly median price lines (one per game). Colour plus dash style tell the lines apart; a text summary follows. */
export function TrendLines({ trend, height = 220 }: { trend: WeeklyTrend; height?: number }) {
  const uid = useId();
  const W = 640;
  const padL = 46;
  const padR = 12;
  const padT = 10;
  const padB = 26;
  const all = trend.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (all.length === 0 || trend.weeks.length < 2) return null;
  const top = niceCeil(Math.max(...all));
  const x = (i: number) => padL + (i / (trend.weeks.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / top) * (height - padT - padB);
  const ticks = [0, top / 2, top];
  const step = Math.ceil(trend.weeks.length / 6);
  const xTicks = trend.weeks.map((w, i) => ({ w, i })).filter(({ i }) => i % step === 0);

  const summaries = trend.series.map((s) => {
    const vals = s.values.filter((v): v is number => v !== null);
    return `${s.game}: typical price went from ${money(vals[0])} to ${money(vals[vals.length - 1])} (${s.posts} priced posts)`;
  });

  return (
    <figure>
      <svg role="img" aria-labelledby={`${uid}-t`} viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full">
        <title id={`${uid}-t`}>{`Weekly typical price by game. ${summaries.join('. ')}.`}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth="1" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-fg-subtle" fontSize="11">
              {money(t)}
            </text>
          </g>
        ))}
        {xTicks.map(({ w, i }) => (
          <text key={w} x={x(i)} y={height - 7} textAnchor="middle" className="fill-fg-subtle" fontSize="11">
            {weekLabel(w)}
          </text>
        ))}
        {trend.series.map((s, si) => {
          const pts = s.values
            .map((v, i) => (v === null ? null : ([x(i), y(v), v, i] as const)))
            .filter((p): p is NonNullable<typeof p> => p !== null);
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
          return (
            <g key={s.game} className={LINE_COLORS[si % LINE_COLORS.length]}>
              <path d={d} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={DASHES[si % DASHES.length] || undefined} />
              {pts.map((p) => (
                <circle key={p[3]} cx={p[0]} cy={p[1]} r="3" fill="currentColor">
                  <title>{`${s.game}, week of ${weekLabel(trend.weeks[p[3]])}: ${money(p[2])}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {trend.series.map((s, si) => (
          <li key={s.game} className={`inline-flex items-center gap-1.5 ${LINE_COLORS[si % LINE_COLORS.length]}`}>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" x2="22" y1="4" y2="4" stroke="currentColor" strokeWidth="2.25" strokeDasharray={DASHES[si % DASHES.length] || undefined} />
            </svg>
            <span className="text-fg-muted">
              {s.game} <span className="text-fg-subtle">({s.posts} posts)</span>
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{summaries.join('. ')}</figcaption>
    </figure>
  );
}
