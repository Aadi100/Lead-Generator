"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { cx } from './ui';

/** "Show details" block. Open/closed is remembered per `id` in localStorage. Children stay mounted. */
export default function ShowDetails({ id, title = 'Show details', hint, children, className }: { id: string; title?: string; hint?: string; children: ReactNode; className?: string }) {
  const key = `lr:details:${id}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(key) === '1');
    } catch {
      /* ignore */
    }
  }, [key]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className={cx('mt-6', className)}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={`det-${id}`} className="ctl inline-flex min-h-10 items-center gap-1.5 rounded-ctl px-1 py-1 text-sm font-semibold text-primary-text">
        <svg aria-hidden="true" viewBox="0 0 20 20" className={cx('h-4 w-4 transition-transform duration-fast', open && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4l6 6-6 6" />
        </svg>
        {open ? title.replace(/^Show/, 'Hide') : title}
      </button>
      {hint && !open && <p className="px-1 text-sm text-fg-subtle">{hint}</p>}
      <div id={`det-${id}`} hidden={!open} className="mt-3 space-y-4">
        {children}
      </div>
    </div>
  );
}
