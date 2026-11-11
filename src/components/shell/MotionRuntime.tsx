"use client";

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Phase = 'idle' | 'loading' | 'done';

/**
 * Global motion plumbing, mounted once in the (app) layout:
 *  1. html[data-hidden] follows tab visibility so the two ambient loops pause in background tabs.
 *  2. Pointer spotlight: on fine pointers, sets --mx/--my (and data-spot) on the glass card under the cursor, via rAF.
 *  3. A thin route progress bar: starts on an internal link click, finishes when the pathname changes.
 */
export default function MotionRuntime() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const safety = useRef<number | undefined>(undefined);

  const set = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.setAttribute('data-hidden', String(document.hidden));
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    let fine = false;
    try {
      fine = window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      fine = false;
    }
    if (!fine) return;
    const SEL = '.glass, .glass-strong, [data-spotlight]';
    let current: HTMLElement | null = null;
    let raf = 0;
    let last: PointerEvent | null = null;
    const clear = () => {
      current?.removeAttribute('data-spot');
      current = null;
    };
    const frame = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const t = e.target instanceof Element ? (e.target.closest(SEL) as HTMLElement | null) : null;
      if (t !== current) {
        clear();
        current = t;
        current?.setAttribute('data-spot', '');
      }
      if (current) {
        const r = current.getBoundingClientRect();
        current.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
        current.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      last = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => {
      last = null;
      clear();
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      clear();
    };
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a || (a.getAttribute('target') && a.getAttribute('target') !== '_self') || a.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL((a as HTMLAnchorElement).href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      set('loading');
      window.clearTimeout(safety.current);
      safety.current = window.setTimeout(() => set('done'), 8000);
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      window.clearTimeout(safety.current);
    };
  }, []);

  useEffect(() => {
    if (phaseRef.current !== 'loading') return;
    window.clearTimeout(safety.current);
    set('done');
    const t = window.setTimeout(() => set('idle'), 520);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return <div aria-hidden="true" className="route-progress" data-state={phase} />;
}
