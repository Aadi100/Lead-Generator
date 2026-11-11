import type { ElementType, ReactNode } from 'react';
import Link from 'next/link';
import { cx } from './cx';
import { Sparkline } from './charts';

/** Surface with a border. title/subtitle/actions render a header row. padding "none" for tables and lists. */
export function Card({
  title,
  subtitle,
  actions,
  children,
  id,
  padding = 'md',
  className,
  as,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  padding?: 'none' | 'sm' | 'md';
  className?: string;
  as?: ElementType;
}) {
  const Tag = as ?? 'section';
  const pad = padding === 'none' ? '' : padding === 'sm' ? 'p-3' : 'p-4 sm:p-5';
  return (
    <Tag id={id} className={cx('rounded-card border border-border bg-surface shadow-sm', pad, className)}>
      {(title || actions) && (
        <header className={cx('flex flex-wrap items-start justify-between gap-2', padding === 'none' ? 'border-b border-border px-4 py-3' : 'mb-3')}>
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-fg-subtle">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}

const STAT_TONE = { neutral: 'text-fg', primary: 'text-primary-text', success: 'text-success', warning: 'text-warning', danger: 'text-danger', info: 'text-info', accent: 'text-accent-text' } as const;

/** KPI tile: label, big Fira Code value, optional sub line, trend sparkline and link. */
export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  trend,
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: keyof typeof STAT_TONE;
  icon?: ReactNode;
  trend?: number[];
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-fg-subtle">{label}</p>
        {icon && <span className="text-fg-subtle">{icon}</span>}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className={cx('font-num text-[28px] font-semibold leading-none', STAT_TONE[tone])}>{value}</p>
        {trend && trend.length > 1 && <Sparkline values={trend} width={72} height={26} tone={tone === 'neutral' ? 'primary' : tone} label={`${label} trend`} />}
      </div>
      {sub && <p className="mt-1.5 truncate text-xs text-fg-subtle">{sub}</p>}
    </>
  );
  const cls = cx('block rounded-card border border-border bg-surface p-3.5 shadow-sm', href && 'transition-colors duration-fast hover:border-border-strong', className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
