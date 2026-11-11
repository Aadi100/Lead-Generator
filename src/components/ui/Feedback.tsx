"use client";

import type { ReactNode } from 'react';
import { AlertIcon, CheckCircleIcon, CheckIcon, InfoIcon, XIcon } from '../Icons';
import type { JobPhase } from '@/lib/jobs';
import { cx } from './cx';
import { btnPrimary, btnSecondary } from './Button';
import { Spinner } from './Spinner';

type BannerTone = 'info' | 'success' | 'warning' | 'danger';
const BANNER: Record<BannerTone, string> = {
  info: 'border-info-border bg-info-soft text-fg',
  success: 'border-success-border bg-success-soft text-fg',
  warning: 'border-warning-border bg-warning-soft text-fg',
  danger: 'border-danger-border bg-danger-soft text-fg',
};
const BANNER_ICON: Record<BannerTone, string> = { info: 'text-info', success: 'text-success', warning: 'text-warning', danger: 'text-danger' };

export function Banner({
  tone = 'info',
  title,
  children,
  onDismiss,
  action,
  className,
}: {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === 'success' ? CheckCircleIcon : tone === 'info' ? InfoIcon : AlertIcon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-card border px-3.5 py-3 text-sm', BANNER[tone], className)}>
      <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', BANNER_ICON[tone])} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5 text-fg-muted')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="btn -mr-1 -mt-0.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-ctl text-fg-subtle hover:bg-surface-2 hover:text-fg">
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Older name for an inline message box. */
export function Notice({ tone, children }: { tone: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const map = { info: 'info', warn: 'warning', error: 'danger', ok: 'success' } as const;
  return (
    <Banner tone={map[tone]} className="!py-2.5">
      {children}
    </Banner>
  );
}

export function JobNote({ phase, error, runningText, doneText }: { phase: JobPhase; error: string | null; runningText: string; doneText?: string }) {
  if (phase === 'idle') return null;
  if (phase === 'running') {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-fg-muted" role="status">
        <Spinner />
        {runningText}
      </p>
    );
  }
  if (phase === 'done') {
    return doneText ? (
      <p className="inline-flex items-center gap-2 text-sm text-success" role="status">
        <CheckIcon className="h-4 w-4" />
        {doneText}
      </p>
    ) : null;
  }
  return (
    <p className="flex items-start gap-2 break-words text-sm text-danger" role="alert">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{error ?? 'Something went wrong.'}</span>
    </p>
  );
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  error,
  savedLabel = 'All changes saved',
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  error?: string | null;
  savedLabel?: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
      <button type="button" onClick={onSave} disabled={!dirty || saving} className={btnPrimary}>
        {saving && <Spinner />}
        Save changes
      </button>
      {dirty && !saving && (
        <button type="button" onClick={onReset} className={btnSecondary}>
          Discard
        </button>
      )}
      <p className="min-w-0 text-sm" role="status" aria-live="polite">
        {error ? (
          <span className="break-words text-danger">{error}</span>
        ) : dirty ? (
          <span className="text-warning">You have unsaved changes</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-fg-subtle">
            <CheckIcon className="h-4 w-4 text-success" />
            {savedLabel}
          </span>
        )}
      </p>
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
  icon,
  className,
}: {
  title: string;
  text: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center rounded-card border border-dashed border-border-strong bg-surface px-6 py-12 text-center', className)}>
      {icon && <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-fg-subtle ring-1 ring-inset ring-border">{icon}</span>}
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-fg-subtle">{text}</p>
      {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-ctl bg-surface-2', className)} />;
}

/** Placeholder rows the size of the final rows, with aria-busy for assistive tech. */
export function SkeletonRows({ rows = 6, className, rowClassName = 'h-14' }: { rows?: number; className?: string; rowClassName?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className={cx('space-y-2', className)}>
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cx('w-full', rowClassName)} />
      ))}
    </div>
  );
}

export function ProgressBar({ value, max = 100, label, tone = 'primary', className }: { value: number; max?: number; label: string; tone?: 'primary' | 'success' | 'warning' | 'danger'; className?: string }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  const fill = { primary: 'bg-primary', success: 'bg-success-solid', warning: 'bg-warning-solid', danger: 'bg-danger-solid' }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border', className)}>
      <div className={cx('fill-in h-full rounded-full transition-[width] duration-slow ease-soft', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
