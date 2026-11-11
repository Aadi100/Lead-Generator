"use client";

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightIcon } from '@/components/Icons';
import { cx } from '@/components/ui';
import type { Status } from '@/lib/types';

const ORDER: Status[] = ['New', 'Pitched', 'Replied', 'Won', 'Lost', 'Ignored'];

/** Accessible "Move to..." menu: portal-positioned so scrolling columns never clip it. */
export function MoveMenu({ current, title, onMove, showIgnored }: { current: Status; title: string; onMove: (to: Status) => void; showIgnored: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const options = ORDER.filter((s) => s !== current && (showIgnored || s !== 'Ignored'));

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = 176;
    const h = options.length * 36 + 40;
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    const below = r.bottom + 6 + h < window.innerHeight;
    setPos({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - h - 6) });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    place();
    const items = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') ?? []);
    requestAnimationFrame(() => items()[0]?.focus());
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        const n = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[n]?.focus();
      } else if (e.key === 'Tab') {
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Move "${title}" to another stage`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="btn inline-flex min-h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-ctl border border-border bg-surface px-2 text-xs font-medium text-fg-muted transition-colors duration-fast hover:border-border-strong hover:text-fg coarse:min-h-11 coarse:px-3"
      >
        Move to
        <ArrowRightIcon className="h-3.5 w-3.5" />
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label="Move to stage"
            style={{ top: pos.top, left: pos.left, width: 176 }}
            className="animate-pop glass-strong fixed z-[60] rounded-card border border-border p-1 text-sm text-fg shadow-float"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Move to</p>
            {options.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onMove(s);
                  btn.current?.focus();
                }}
                className={cx('btn flex w-full cursor-pointer items-center rounded-ctl px-2.5 py-1.5 text-left text-sm text-fg hover:bg-surface-2 coarse:min-h-11')}
              >
                {s}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
