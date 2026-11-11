import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';

type ChartTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
const TEXT: Record<ChartTone, string> = {
  primary: 'text-primary-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  accent: 'text-accent-text',
};
const BG: Record<ChartTone, string> = { primary: 'bg-primary', success: 'bg-success-solid', warning: 'bg-warning-solid', danger: 'bg-danger-solid', info: 'bg-info-solid', accent: 'bg-accent' };

/** Tiny trend line with soft area and an emphasised last point. Always pass label (screen readers). */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  tone = 'primary',
  label = 'Trend',
  fill = true,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: ChartTone;
  label?: string;
  fill?: boolean;
  className?: string;
}) {
  if (values.length === 0) return null;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, height - pad - ((v - min) / span) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${height - pad} L${pts[0][0].toFixed(1)} ${height - pad} Z`;
  const last = pts[pts.length - 1];
  const summary = `${label}: from ${values[0]} to ${values[values.length - 1]}, peak ${max}`;
  return (
    <svg key={line} role="img" aria-label={summary} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cx('shrink-0', TEXT[tone], className)}>
      {fill && <path d={area} fill="currentColor" opacity="0.12" className="fade-late" />}
      <path d={line} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="draw-line" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill="currentColor" className="fade-late" />
    </svg>
  );
}

/** Vertical mini bars (for example leads per day). Each bar carries a <title> with its label and value. */
export function MiniBars({
  data,
  height = 56,
  tone = 'primary',
  label = 'Bar chart',
  className,
}: {
  data: { label: string; value: number }[];
  height?: number;
  tone?: ChartTone;
  label?: string;
  className?: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100;
  const gap = 1.5;
  const bw = (w - gap * (data.length - 1)) / data.length;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <svg role="img" aria-label={`${label}: ${total} in total over ${data.length} points`} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cx('block w-full', TEXT[tone], className)} style={{ height }}>
      {data.map((d, i) => {
        const h = d.value === 0 ? 1 : Math.max(2, (d.value / max) * (height - 2));
        return (
          <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx="1" fill="currentColor" opacity={d.value === 0 ? 0.25 : 0.9} className="grow-y" style={{ '--i': i } as CSSProperties}>
            <title>{`${d.label}: ${d.value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Funnel as labelled horizontal bars. Counts and conversion percentages are always printed as text. */
export function FunnelChart({
  stages,
  className,
}: {
  stages: { label: string; value: number; tone?: ChartTone }[];
  className?: string;
}) {
  const first = stages[0]?.value || 0;
  const top = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ol className={cx('space-y-2', className)}>
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const fromPrev = prev ? Math.round((s.value / prev) * 100) : null;
        const ofFirst = first ? Math.round((s.value / first) * 100) : 0;
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-medium text-fg">{s.label}</span>
              <span className="flex shrink-0 items-baseline gap-2 whitespace-nowrap text-right text-fg-subtle">
                <span className="font-num font-semibold text-fg">{s.value}</span>
                {i > 0 && fromPrev !== null && (
                  <span className="font-num">
                    {fromPrev}% <span className="text-fg-subtle/80">of prev</span>
                  </span>
                )}
                {i > 0 && (
                  <span className="font-num border-l border-border pl-2">
                    {ofFirst}% <span className="text-fg-subtle/80">of all</span>
                  </span>
                )}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border" role="presentation">
              <div className={cx('fill-in h-full rounded-full transition-[width] duration-slow ease-soft', BG[s.tone ?? 'primary'])} style={{ width: `${Math.max(s.value ? 2 : 0, (s.value / top) * 100)}%`, '--i': i } as CSSProperties} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Sorted horizontal bars with numbers (conversion by source, demand by game ...). */
export function BarList({
  items,
  tone = 'primary',
  format,
  className,
  empty,
}: {
  items: { label: string; value: number; sub?: ReactNode }[];
  tone?: ChartTone;
  format?: (v: number) => string;
  className?: string;
  empty?: ReactNode;
}) {
  if (items.length === 0) return <>{empty ?? <p className="text-sm text-fg-subtle">Nothing to show yet.</p>}</>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cx('space-y-2.5', className)}>
      {items.map((it, i) => (
        <li key={it.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-fg">{it.label}</span>
            <span className="font-num shrink-0 font-semibold text-fg">{format ? format(it.value) : it.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border" role="presentation">
            <div className={cx('fill-in h-full rounded-full transition-[width] duration-slow ease-soft', BG[tone])} style={{ width: `${Math.max(it.value ? 2 : 0, (it.value / max) * 100)}%`, '--i': i } as CSSProperties} />
          </div>
          {it.sub && <p className="mt-0.5 text-xs text-fg-subtle">{it.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
