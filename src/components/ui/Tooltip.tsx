"use client";

import { useId, type ReactNode } from 'react';
import { cx } from './cx';

/** Hover and keyboard-focus tooltip. The child stays the interactive element; the label is also its description. */
export function Tooltip({ label, children, side = 'top', className }: { label: string; children: ReactNode; side?: 'top' | 'bottom' | 'right'; className?: string }) {
  const id = useId();
  const pos = side === 'bottom' ? 'left-1/2 top-full mt-1.5 -translate-x-1/2' : side === 'right' ? 'left-full top-1/2 ml-2 -translate-y-1/2' : 'bottom-full left-1/2 mb-1.5 -translate-x-1/2';
  return (
    <span className={cx('group relative inline-flex', className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-ctl bg-fg px-2 py-1 text-xs font-medium text-canvas opacity-0 shadow-float transition-opacity duration-fast group-hover:opacity-100 group-focus-within:opacity-100',
          pos,
        )}
      >
        {label}
      </span>
    </span>
  );
}
