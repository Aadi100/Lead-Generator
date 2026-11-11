"use client";

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { useSlider } from './Motion';

export type TabItem<T extends string> = { id: T; label: string; count?: number; icon?: ReactNode };

function useRoving<T extends string>(items: { id: T }[], active: T, onChange: (id: T) => void) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const idx = Math.max(0, items.findIndex((t) => t.id === active));
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    const id = items[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };
  return { refs, onKeyDown };
}

/** Tab list. variant "underline" for page sections, "pill" for compact filters. Arrow keys move between tabs. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  variant = 'pill',
  className,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  variant?: 'pill' | 'underline';
  className?: string;
}) {
  const { refs, onKeyDown } = useRoving(tabs, active, onChange);
  const slider = useSlider<HTMLDivElement>(active, [tabs.length]);
  return (
    <div
      ref={slider.ref}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx('relative flex gap-1', variant === 'underline' ? 'gap-4 overflow-x-auto border-b border-border' : 'flex-wrap', className)}
    >
      <span
        aria-hidden="true"
        data-ready={slider.ready}
        style={slider.style}
        className={cx('slider-thumb', variant === 'underline' ? 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'rounded-ctl bg-fg')}
      />
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            data-on={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cx(
              'btn relative z-10 inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-fast',
              variant === 'underline'
                ? cx('-mb-px border-b-2 border-transparent px-0.5 pb-2.5 pt-2', on ? 'text-primary-text' : 'text-fg-muted hover:text-fg')
                : cx('min-h-8 rounded-ctl px-3 py-1', on ? 'text-canvas' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'),
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cx(
                  'font-num rounded-full px-1.5 text-xs',
                  variant === 'pill' && on ? 'bg-canvas/20 text-canvas' : 'bg-surface-2 text-fg-subtle ring-1 ring-inset ring-border',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact either-or switch (view toggles, lead kind). Same keyboard behaviour as Tabs but exposes radio semantics. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  fullWidth,
  className,
}: {
  options: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}) {
  const { refs, onKeyDown } = useRoving(options, value, onChange);
  const slider = useSlider<HTMLDivElement>(value, [options.length, size]);
  return (
    <div ref={slider.ref} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cx('relative inline-flex gap-0.5 rounded-ctl border border-border bg-surface-2 p-0.5', fullWidth && 'flex w-full', className)}>
      <span aria-hidden="true" data-ready={slider.ready} style={slider.style} className="slider-thumb rounded-[5px] bg-surface shadow-md ring-1 ring-border" />
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[o.id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            data-on={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cx(
              'btn relative z-10 inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] font-medium transition-colors duration-fast',
              size === 'sm' ? 'min-h-6 px-2 text-[13px]' : 'min-h-7 px-3 text-sm',
              on ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {o.icon}
            {o.label}
            {o.count !== undefined && <span className="font-num text-xs text-fg-subtle">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
