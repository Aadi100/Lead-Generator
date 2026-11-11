"use client";

import { useId, useMemo } from 'react';
import { weeklySeries } from '../../../worker/lib/price-market.mjs';
import { money } from '@/lib/trading-stats';
import type { PricePoint } from '@/lib/types-stock';

const DAY = 86_400_000;

function niceCeil(v: number): number {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Price history in USD: every saved price as a dot (filled = real sale, hollow = asking or offer),
 * a line through the weekly median of sales, and a band for the usual range (25th to 75th percentile).
 * Shape and fill carry the meaning, not colour alone. A text summary follows for screen readers.
 */
export default function PriceHistoryChart({ points, band, weeks = 26, height = 250 }: { points: PricePoint[]; band: { p25: number | null; p75: number | null; median: number | null } | null; weeks?: number; height?: number }) {
  const uid = useId();
  const W = 680;
  const padL = 50;
  const padR = 14;
  const padT = 12;
  const padB = 28;

  const data = useMemo(() => {
    const now = Date.now();
    const from = now - weeks * 7 * DAY;
    const usable = points.filter((p) => p.price_usd !== null && p.price_usd > 0 && Date.parse(p.captured_at) >= from);
    const sold = weeklySeries(usable, { kinds: ['sold'], weeks, now }) as { week: string; median: number; n: number }[];
    return { now, from, usable, sold };
  }, [points, weeks]);

  if (data.usable.length === 0) return null;
  const maxV = Math.max(...data.usable.map((p) => p.price_usd as number), band?.p75 ?? 0);
  const top = niceCeil(maxV * 1.05);
  const x = (t: number) => padL + ((t - data.from) / (data.now - data.from)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / top) * (height - padT - padB);
  const yTicks = [0, top / 2, top];
  const xTicks = Array.from({ length: 5 }, (_, i) => data.from + (i / 4) * (data.now - data.from));
  const line = data.sold.map((w, i) => `${i === 0 ? 'M' : 'L'}${x(Date.parse(`${w.week}T12:00:00`) + 3.5 * DAY).toFixed(1)} ${y(w.median).toFixed(1)}`).join(' ');
  const nSold = data.usable.filter((p) => p.kind === 'sold').length;
  const summary = `${data.usable.length} saved prices over the last ${weeks} weeks, ${nSold} of them real sales${band?.median ? `. Typical price ${money(band.median)}` : ''}.`;

  return (
    <figure>
      <svg role="img" aria-labelledby={`${uid}-t`} viewBox={`0 0 ${W} ${height}`} className="mx-auto block h-auto max-h-[300px] w-full">
        <title id={`${uid}-t`}>{`Price history in US dollars. ${summary}`}</title>
        {band && band.p25 !== null && band.p75 !== null && (
          <rect x={padL} y={y(band.p75)} width={W - padL - padR} height={Math.max(2, y(band.p25) - y(band.p75))} className="fill-primary-soft" opacity="0.7">
            <title>{`Usual range ${money(band.p25)} to ${money(band.p75)}`}</title>
          </rect>
        )}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth="1" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-fg-subtle" fontSize="11">
              {money(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={height - 8} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} className="fill-fg-subtle" fontSize="11">
            {dayLabel(t)}
          </text>
        ))}
        {band?.median != null && <line x1={padL} x2={W - padR} y1={y(band.median)} y2={y(band.median)} className="stroke-primary-text" strokeWidth="1" strokeDasharray="1 4" opacity="0.8" />}
        {data.sold.length > 1 && <path d={line} fill="none" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-text" />}
        {data.usable.map((p) => {
          const cx = x(Date.parse(p.captured_at));
          const cy = y(p.price_usd as number);
          const label = `${p.kind === 'sold' ? 'Sold' : p.kind === 'asking' ? 'Asking' : 'Offer'} ${money(p.price_usd)}, ${dayLabel(Date.parse(p.captured_at))}${p.source ? `, ${p.source}` : ''}`;
          return p.kind === 'sold' ? (
            <circle key={p.id} cx={cx} cy={cy} r="3.6" className="fill-primary-text">
              <title>{label}</title>
            </circle>
          ) : (
            <circle key={p.id} cx={cx} cy={cy} r="3.2" fill="none" strokeWidth="1.6" className="stroke-fg-subtle">
              <title>{label}</title>
            </circle>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <li className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="3.6" className="fill-primary-text" />
          </svg>
          Real sale
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="3.2" fill="none" strokeWidth="1.6" className="stroke-fg-subtle" />
          </svg>
          Asking price or offer
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden="true">
            <line x1="0" x2="22" y1="4" y2="4" strokeWidth="2.25" className="stroke-primary-text" />
          </svg>
          Weekly median of sales
        </li>
        {band && band.p25 !== null && (
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-primary-soft ring-1 ring-inset ring-border" aria-hidden="true" />
            Usual range
          </li>
        )}
      </ul>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
