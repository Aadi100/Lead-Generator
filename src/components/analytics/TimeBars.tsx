"use client";

import { useState } from 'react';
import { cx } from '@/components/ui';
import type { Bucket } from '@/lib/analytics-data';

type Series = { name: string; cls: string; swatch: string };

/**
 * Hand-written SVG bar chart over time. Two series, stacked or side by side.
 * Never colour alone: series are named in a legend with totals, every bar has a tooltip,
 * the busiest bucket is labelled on the chart and a full data table is one click away.
 */
export default function TimeBars({
  buckets,
  unit,
  a,
  b,
  mode,
  title,
}: {
  buckets: Bucket[];
  unit: 'day' | 'week';
  a: Series;
  b: Series;
  mode: 'stacked' | 'grouped';
  title: string;
}) {
  const [table, setTable] = useState(false);
  const W = 640;
  const H = 190;
  const padL = 30;
  const padB = 22;
  const padT = 14;
  const innerW = W - padL - 4;
  const innerH = H - padB - padT;
  const totalA = buckets.reduce((s, x) => s + x.a, 0);
  const totalB = buckets.reduce((s, x) => s + x.b, 0);
  const tops = buckets.map((x) => (mode === 'stacked' ? x.a + x.b : Math.max(x.a, x.b)));
  const rawMax = Math.max(1, ...tops);
  const max = rawMax <= 4 ? 4 : Math.ceil(rawMax / 4) * 4;
  const slot = innerW / buckets.length;
  const bw = Math.max(2, Math.min(26, slot * 0.7));
  const peakIdx = tops.indexOf(Math.max(...tops));
  const peak = tops[peakIdx] ?? 0;
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const labelEvery = buckets.length > 14 ? Math.ceil(buckets.length / 6) : buckets.length > 7 ? 2 : 1;
  const alt = `${title}. ${a.name}: ${totalA} in total. ${b.name}: ${totalB} in total. Busiest ${unit}: ${buckets[peakIdx]?.label ?? 'none'} with ${peak}.`;

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-fg-muted">
        {[
          [a, totalA],
          [b, totalB],
        ].map(([s, t]) => (
          <li key={(s as Series).name} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('inline-block h-2.5 w-2.5 rounded-sm', (s as Series).swatch)} />
            {(s as Series).name}
            <span className="font-num font-semibold text-fg">{t as number}</span>
          </li>
        ))}
      </ul>
      <svg role="img" aria-label={alt} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        <title>{alt}</title>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W - 4} y1={y(max * f)} y2={y(max * f)} className="stroke-border" strokeDasharray={f === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={y(max * f) + 3.5} textAnchor="end" className="fill-fg-subtle font-num" fontSize="10">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {buckets.map((d, i) => {
          const cx0 = padL + slot * i + slot / 2;
          const tip = `${d.label}: ${a.name} ${d.a}, ${b.name} ${d.b}`;
          return (
            <g key={i}>
              <title>{tip}</title>
              {mode === 'stacked' ? (
                <>
                  <rect x={cx0 - bw / 2} y={y(d.a)} width={bw} height={Math.max(0, (d.a / max) * innerH)} rx="1.5" className={a.cls} />
                  <rect x={cx0 - bw / 2} y={y(d.a + d.b)} width={bw} height={Math.max(0, (d.b / max) * innerH)} rx="1.5" className={b.cls} />
                </>
              ) : (
                <>
                  <rect x={cx0 - bw / 2} y={y(d.a)} width={bw / 2 - 0.5} height={Math.max(0, (d.a / max) * innerH)} rx="1.5" className={a.cls} />
                  <rect x={cx0 + 0.5} y={y(d.b)} width={bw / 2 - 0.5} height={Math.max(0, (d.b / max) * innerH)} rx="1.5" className={b.cls} />
                </>
              )}
              {i % labelEvery === 0 && (
                <text x={cx0} y={H - 6} textAnchor="middle" className="fill-fg-subtle" fontSize="10">
                  {unit === 'week' ? d.label.replace('Week of ', '') : d.label}
                </text>
              )}
            </g>
          );
        })}
        {peak > 0 && (
          <text x={Math.min(W - 20, Math.max(padL + 12, padL + slot * peakIdx + slot / 2))} y={y(peak) - 4} textAnchor="middle" className="fill-fg font-num" fontSize="11" fontWeight="600">
            {peak}
          </text>
        )}
      </svg>
      <button type="button" onClick={() => setTable((v) => !v)} aria-expanded={table} className="btn mt-1 cursor-pointer text-[13px] font-medium text-primary-text hover:underline">
        {table ? 'Hide the numbers' : 'Show the numbers as a table'}
      </button>
      {table && (
        <div className="mt-2 max-h-56 overflow-auto rounded-ctl border border-border">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-surface-2 text-left text-xs text-fg-subtle">
              <tr>
                <th scope="col" className="px-3 py-1.5">{unit === 'week' ? 'Week' : 'Day'}</th>
                <th scope="col" className="px-3 py-1.5 text-right">{a.name}</th>
                <th scope="col" className="px-3 py-1.5 text-right">{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((d, i) => (
                <tr key={i} className="border-t border-border">
                  <th scope="row" className="px-3 py-1 text-left font-normal text-fg-muted">{d.label}</th>
                  <td className="font-num px-3 py-1 text-right">{d.a}</td>
                  <td className="font-num px-3 py-1 text-right">{d.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
