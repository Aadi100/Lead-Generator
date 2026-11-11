"use client";

import type { CSSProperties, ReactNode } from 'react';
import { ShieldIcon } from '../Icons';
import { cx } from './cx';
import { useBlip } from './Motion';

export type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted ring-border',
  primary: 'bg-primary-soft text-primary-text ring-primary-border',
  accent: 'bg-accent-soft text-accent-text ring-success-border',
  success: 'bg-success-soft text-success ring-success-border',
  warning: 'bg-warning-soft text-warning ring-warning-border',
  danger: 'bg-danger-soft text-danger ring-danger-border',
  info: 'bg-info-soft text-info ring-info-border',
};
const DOT: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  primary: 'bg-primary-text',
  accent: 'bg-accent-text',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

// Class string for older call sites that pass their own colour classes.
export const pill = 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset';

export function Badge({ tone = 'neutral', dot, icon, children, className, title }: { tone?: Tone; dot?: boolean; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE[tone], className)}>
      {dot && <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} aria-hidden="true" />}
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** Filter chip. Renders a button when onClick is given. */
export function Chip({
  children,
  selected,
  onClick,
  count,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  count?: number;
  className?: string;
}) {
  const cls = cx(
    'inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[13px] font-medium transition-colors duration-fast',
    selected ? 'border-primary bg-primary text-primary-on' : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
    onClick && 'btn cursor-pointer',
    className,
  );
  const inner = (
    <>
      {children}
      {count !== undefined && <span className={cx('font-num text-xs', selected ? 'text-primary-on/80' : 'text-fg-subtle')}>{count}</span>}
    </>
  );
  return onClick ? (
    <button type="button" aria-pressed={!!selected} onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

const STATUS_TONE: Record<string, Tone> = { New: 'info', Pitched: 'primary', Replied: 'accent', Won: 'success', Lost: 'danger', Ignored: 'neutral' };

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot className={className}>
      {status}
    </Badge>
  );
}

const TRUST_TONE: Record<string, Tone> = { High: 'success', Medium: 'warning', Low: 'danger' };

export function TrustBadge({ level, score, className }: { level: string | null; score?: number | null; className?: string }) {
  if (!level) return <Badge className={className}>Not scored</Badge>;
  return (
    <Badge tone={TRUST_TONE[level] ?? 'neutral'} icon={<ShieldIcon className="h-3.5 w-3.5 shrink-0" />} className={className} title={`Trust: ${level}${score != null ? ` (${score}/100)` : ''}`}>
      {level}
      {score != null && <span className="font-num ml-1 opacity-80">{score}</span>}
    </Badge>
  );
}

const CAT_CLASS: Record<string, { chip: string; dot: string }> = {
  Website: { chip: 'bg-cat-website-soft text-cat-website', dot: 'bg-cat-website' },
  App: { chip: 'bg-cat-app-soft text-cat-app', dot: 'bg-cat-app' },
  Design: { chip: 'bg-cat-design-soft text-cat-design', dot: 'bg-cat-design' },
  Automation: { chip: 'bg-cat-automation-soft text-cat-automation', dot: 'bg-cat-automation' },
  Gaming: { chip: 'bg-cat-gaming-soft text-cat-gaming', dot: 'bg-cat-gaming' },
  Other: { chip: 'bg-cat-other-soft text-cat-other', dot: 'bg-cat-other' },
};

/** Category label with its colour dot. Unknown categories render as Other. */
export function CategoryChip({ category, className }: { category: string | null; className?: string }) {
  const label = category || 'Other';
  const c = CAT_CLASS[label] ?? CAT_CLASS.Other;
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', c.chip, className)}>
      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', c.dot)} aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

export function CountBadge({ n, tone = 'primary', className, label }: { n: number; tone?: 'primary' | 'danger' | 'neutral' | 'accent'; className?: string; label?: string }) {
  const t = tone === 'danger' ? 'bg-danger-solid text-white' : tone === 'neutral' ? 'bg-border-strong text-fg' : tone === 'accent' ? 'bg-accent text-accent-on' : 'bg-primary text-primary-on';
  const blip = useBlip(n);
  return (
    <span aria-label={label ?? `${n}`} style={tone === 'accent' ? ({ '--blip-color': 'var(--accent)' } as CSSProperties) : undefined} className={cx(blip, 'font-num inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-5', t, className)}>
      {n > 99 ? '99+' : n}
    </span>
  );
}
