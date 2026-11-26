"use client";

import { Popover } from '@/components/ui';
import { cx } from '@/components/ui';
import type { LiveState, WorkerInfo } from './types';

export function workerTone(worker: WorkerInfo) {
  if (!worker.loaded) return { dot: 'bg-fg-subtle', label: 'Checking helper', short: 'Checking' };
  if (worker.online) return { dot: 'bg-success-solid', label: worker.claude ? 'Helper running' : 'Helper running · AI writer off', short: 'Helper running' };
  return { dot: 'bg-danger-solid', label: 'Helper offline', short: 'Helper offline' };
}

function Explain({ worker }: { worker: WorkerInfo }) {
  return (
    <div className="p-3.5 text-[13px] leading-relaxed text-fg-muted">
      {!worker.loaded ? (
        <p>Checking the background helper…</p>
      ) : worker.online ? (
        <>
          <p className="font-semibold text-fg">The background helper is running.</p>
          <p className="mt-1">{worker.claude ? 'It sends email, reads replies and the AI writer can draft messages.' : 'No AI key is saved yet, so messages are written from simple templates. Add one in Settings > AI writer.'}</p>
        </>
      ) : (
        <>
          <p className="font-semibold text-fg">The helper is offline.</p>
          <p className="mt-1">
            Sending email, writing messages, reading replies and finding extra details all need it. Start it: run <code className="font-num rounded bg-surface-2 px-1 py-0.5 text-xs text-fg">npm run worker</code> in the project folder and keep that window open.
          </p>
        </>
      )}
    </div>
  );
}

/** Worker health. variant "pill" sits in the top bar, "row" in the sidebar footer, "icon" in the collapsed rail. */
export function WorkerStatus({ worker, variant = 'pill' }: { worker: WorkerInfo; variant?: 'pill' | 'row' | 'icon' }) {
  const t = workerTone(worker);
  return (
    <Popover
      label="Background helper status"
      width="w-72"
      align={variant === 'pill' ? 'end' : 'start'}
      placement={variant === 'pill' ? 'bottom' : 'top-start'}
      trigger={({ open: _open, ...p }) => (
        <button
          {...p}
          type="button"
          title={t.label}
          className={cx(
            'btn inline-flex cursor-pointer items-center gap-2 text-fg-muted transition-colors duration-fast hover:text-fg',
            variant === 'pill' && 'rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium hover:bg-surface-2',
            variant === 'row' && 'w-full rounded-ctl px-2.5 py-1.5 text-[13px] hover:bg-surface-2',
            variant === 'icon' && 'h-9 w-full justify-center rounded-ctl hover:bg-surface-2',
          )}
        >
          <span className={cx('relative inline-flex h-2 w-2 shrink-0', worker.loaded && worker.online ? 'text-success-solid' : '')} aria-hidden="true">
            {worker.loaded && worker.online && <span className="ping-ring" />}
            <span className={cx('relative h-2 w-2 rounded-full', t.dot)} />
          </span>
          {variant !== 'icon' && <span className="truncate">{t.label}</span>}
          {variant === 'icon' && <span className="sr-only">{t.label}</span>}
        </button>
      )}
    >
      <Explain worker={worker} />
    </Popover>
  );
}

const LIVE: Record<LiveState, { dot: string; label: string }> = {
  live: { dot: 'bg-success-solid', label: 'Live updates on' },
  connecting: { dot: 'bg-warning-solid', label: 'Connecting to live updates' },
  offline: { dot: 'bg-danger-solid', label: 'Live updates off' },
};

export function LiveDot({ live, className }: { live: LiveState; className?: string }) {
  const s = LIVE[live];
  return (
    <span role="status" aria-label={s.label} title={s.label} className={cx('relative inline-flex h-2.5 w-2.5', className)}>
      {live === 'live' && <span className="ping-ring text-success-solid" />}
      <span className={cx('relative inline-flex h-2.5 w-2.5 rounded-full', s.dot)} />
    </span>
  );
}
