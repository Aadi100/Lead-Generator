"use client";

import { Children, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { cx } from './cx';

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Children rise in one after another. Use on lists/grids with a modest number of items. */
export function Stagger({ children, step = 40, max = 12, as, className }: { children: ReactNode; step?: number; max?: number; as?: ElementType; className?: string }) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag className={className}>
      {Children.toArray(children).map((child, i) => (
        <div key={i} className="stagger-item" style={{ animationDelay: `${Math.min(i, max) * step}ms` } as CSSProperties}>
          {child}
        </div>
      ))}
    </Tag>
  );
}

/** Fades/rises its content in when it first scrolls into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setInView(true);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -4% 0px' },
    );
    io.observe(el);
    const safety = window.setTimeout(() => setInView(true), 1500);
    return () => {
      io.disconnect();
      window.clearTimeout(safety);
    };
  }, []);
  return (
    <div ref={ref} className={cx('reveal', className)} data-in={inView} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Animates a number to its new value (easeOutCubic). Counts up from 0 on mount and re-ticks from the current figure on change. */
export function CountUp({ value, duration = 700, format, className }: { value: number; duration?: number; format?: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(value) || prefersReducedMotion()) {
      cur.current = value;
      setShown(value);
      return;
    }
    const start = cur.current;
    const delta = value - start;
    if (delta === 0) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      cur.current = start + delta * e;
      setShown(cur.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const n = Math.round(shown);
  return <span className={cx('tabular-nums', className)}>{format ? format(n) : n.toLocaleString()}</span>;
}

/**
 * Returns a class name to put on the element whose value just changed:
 * "blip" (pop plus one-shot ring) when a number goes up, "badge-pop" when it changes otherwise, "" at rest and on first render.
 */
export function useBlip(value: number | string | null | undefined): string {
  const prev = useRef(value);
  const [cls, setCls] = useState('');
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === value || before === undefined) return;
    const up = typeof value === 'number' && typeof before === 'number' && value > before;
    setCls('');
    const raf = requestAnimationFrame(() => setCls(up ? 'blip' : 'badge-pop'));
    const done = window.setTimeout(() => setCls(''), 900);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [value]);
  return cls;
}

/** Keeps something mounted while its exit animation plays (exit is about 65% of the enter duration). */
export function usePresence(open: boolean, exitMs = 120) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, prefersReducedMotion() ? 0 : exitMs);
    return () => window.clearTimeout(t);
  }, [open, mounted, exitMs]);
  return { mounted, closing };
}

/**
 * Slides one absolutely positioned indicator under whichever child is active.
 * Put ref on the (position: relative) container, mark the active child with data-on="true",
 * and spread `style` and `ready` onto an element with className "slider-thumb".
 */
export function useSlider<T extends HTMLElement>(activeKey: string | number | boolean, deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ready, setReady] = useState<'no' | 'first' | 'true'>('no');
  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>('[data-on="true"]');
      if (!el || el.offsetParent === null) {
        setBox(null);
        return;
      }
      setBox({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(root);
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, ...deps]);
  useEffect(() => {
    if (!box || ready === 'true') return;
    if (ready === 'no') setReady('first');
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setReady('true')));
    return () => cancelAnimationFrame(raf);
  }, [box, ready]);
  const style: CSSProperties | undefined = box ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h } : undefined;
  return { ref, style, ready: box ? ready : 'no', box };
}

/** Collapses its content to zero height when open is false (grid-rows trick, no measuring). */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cx('collapse-row', className)} data-open={open} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}
