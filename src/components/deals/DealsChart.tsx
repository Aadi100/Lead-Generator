"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { money, type MonthPoint } from '@/lib/deals-data';

/** Grouped bars: revenue and profit for the last months. Hand-written SVG with a text alternative. */
export default function DealsChart({ data, currency }: { data: MonthPoint[]; currency: string }) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const set = () => setW(Math.max(260, Math.round(el.clientWidth)));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220;
  const padL = 44;
  const padB = 28;
  const padT = 14;
  const max = Math.max(1, ...data.flatMap((d) => [d.revenue, d.profit]));
  const min = Math.min(0, ...data.map((d) => d.profit));
  const span = max - min;
  const plotH = H - padT - padB;
  const y = (v: number) => padT + ((max - v) / span) * plotH;
  const zero = y(0);
  const slot = (W - padL - 8) / data.length;
  const bw = Math.min(30, slot / 3);
  const ticks = [0, 0.5, 1].map((t) => min + span * t);
  const empty = data.every((d) => d.revenue === 0 && d.profit === 0);
  const summary = data.map((d) => `${d.label}: revenue ${money(d.revenue, currency)}, profit ${money(d.profit, currency)}`).join('. ');

  return (
    <figure className="m-0">
      <div ref={wrapRef} className="w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} className="block max-w-full">
        <title id={`${id}-t`}>{`Revenue and profit by month. ${summary}`}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-fg-subtle font-num" fontSize={11}>
              {money(Math.round(t), currency, true).replace(/\.00$/, '')}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx0 = padL + slot * i + slot / 2;
          const bars = [
            { v: d.revenue, cls: 'fill-primary', x: cx0 - bw - 1 },
            { v: d.profit, cls: 'fill-success-solid', x: cx0 + 1 },
          ];
          return (
            <g key={d.key}>
              {bars.map((b, j) => {
                const top = Math.min(y(b.v), zero);
                const h = Math.max(b.v === 0 ? 0 : 2, Math.abs(y(b.v) - zero));
                return <rect key={j} x={b.x} y={top} width={bw} height={h} rx={3} className={`${b.cls} grow-y`} style={{ transformOrigin: `50% ${zero}px`, transformBox: 'fill-box' }} />;
              })}
              <text x={cx0} y={H - 8} textAnchor="middle" className="fill-fg-muted" fontSize={12}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-primary" /> Revenue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-success-solid" /> Profit
        </span>
        {empty && <span className="text-fg-subtle">No finished deals in the last {data.length} months yet.</span>}
      </figcaption>
      <table className="sr-only">
        <caption>Revenue and profit by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Revenue</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              <td>{money(d.revenue, currency)}</td>
              <td>{money(d.profit, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
