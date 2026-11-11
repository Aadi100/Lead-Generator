import type { ReactNode } from 'react';
import { RadarIcon } from '../Icons';
import { cx } from './cx';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cx('font-num inline-flex min-w-[1.25rem] items-center justify-center rounded border border-border-strong bg-surface-2 px-1 text-[11px] font-medium leading-5 text-fg-muted', className)}>
      {children}
    </kbd>
  );
}

export function Divider({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" aria-orientation={vertical ? 'vertical' : 'horizontal'} className={cx(vertical ? 'mx-1 h-5 w-px bg-border' : 'h-px w-full bg-border', className)} />;
}

function initials(name: string): string {
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'sm' ? 'h-6 w-6 text-[11px]' : size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs';
  return (
    <span aria-hidden="true" className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-text ring-1 ring-inset ring-primary-border', s, className)}>
      {initials(name)}
    </span>
  );
}

/** The brand mark: radar icon on the primary tile with a faint beam sweeping behind it (9 s, paused when the tab is hidden). */
export function RadarMark({ className, iconClassName = 'h-[18px] w-[18px]' }: { className?: string; iconClassName?: string }) {
  return (
    <span aria-hidden="true" className={cx('radar-mark shrink-0 bg-primary text-primary-on', className ?? 'h-8 w-8 rounded-lg')}>
      <RadarIcon className={iconClassName} />
    </span>
  );
}
