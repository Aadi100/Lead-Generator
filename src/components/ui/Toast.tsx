"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckCircleIcon, InfoIcon, XIcon } from '../Icons';
import { cx } from './cx';


export type ToastItem = {
  id: number;
  kind: 'info' | 'error' | 'success' | 'warning';
  message: string;
  action?: { label: string; onClick: () => void };
};

const TONE: Record<ToastItem['kind'], { box: string; icon: string; bar: string }> = {
  info: { box: 'border-info-border', icon: 'text-info', bar: 'bg-info-solid' },
  success: { box: 'border-success-border', icon: 'text-success', bar: 'bg-success-solid' },
  warning: { box: 'border-warning-border', icon: 'text-warning', bar: 'bg-warning-solid' },
  error: { box: 'border-danger-border', icon: 'text-danger', bar: 'bg-danger-solid' },
};

const LIFETIME = 4000;

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(LIFETIME);
  const startedAt = useRef(0);

  const leave = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => onDismiss(toast.id), 120);
  }, [onDismiss, toast.id]);

  // Auto-dismiss after 4 s; hovering or focusing pauses both the timer and the countdown bar, and resumes where it stopped.
  useEffect(() => {
    if (paused || leaving) return;
    startedAt.current = Date.now();
    const timer = setTimeout(leave, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, leaving, leave]);

  const Icon = toast.kind === 'error' || toast.kind === 'warning' ? AlertIcon : toast.kind === 'success' ? CheckCircleIcon : InfoIcon;
  const t = TONE[toast.kind];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cx('pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-card border bg-surface px-3.5 py-3 text-sm text-fg shadow-float', leaving ? 'toast-leave' : 'animate-slide-up', t.box)}
    >
      <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', t.icon)} />
      <p className="min-w-0 flex-1 break-words">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            leave();
          }}
          className="btn cursor-pointer rounded-ctl px-2 py-0.5 text-[13px] font-semibold text-primary-text hover:bg-surface-2"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" onClick={leave} aria-label="Dismiss notification" className="btn -mr-1 -mt-0.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-ctl text-fg-subtle hover:bg-surface-2 hover:text-fg">
        <XIcon className="h-4 w-4" />
      </button>
      <span aria-hidden="true" data-paused={paused} className={cx('toast-bar absolute inset-x-0 bottom-0 h-0.5 opacity-60', t.bar)} />
    </div>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-stretch gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:w-96">
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
