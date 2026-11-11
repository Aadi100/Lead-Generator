"use client";

import { flushSync } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'lr-theme';

// Static string, runs before first paint so there is no light flash. The only inline script in the app.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=(t==='light'||t==='dark')?t:(d?'dark':'light');var e=document.documentElement;e.setAttribute('data-theme',r);e.style.colorScheme=r;}catch(x){}})();`;

type ThemeCtx = { theme: Theme; resolved: ResolvedTheme; setTheme: (t: Theme, origin?: { x: number; y: number }) => void };
const Ctx = createContext<ThemeCtx>({ theme: 'system', resolved: 'light', setTheme: () => {} });

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}

function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function apply(resolved: ResolvedTheme) {
  const el = document.documentElement;
  el.setAttribute('data-theme', resolved);
  el.style.colorScheme = resolved;
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  useEffect(() => {
    let stored: Theme = 'system';
    try {
      const s = localStorage.getItem(THEME_KEY);
      if (s === 'light' || s === 'dark') stored = s;
    } catch {
      // storage unavailable: follow the system theme
    }
    setThemeState(stored);
    const r = stored === 'system' ? systemTheme() : stored;
    setResolved(r);
    apply(r);
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => {
      const r = mq.matches ? 'dark' : 'light';
      setResolved(r);
      apply(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme, origin?: { x: number; y: number }) => {
    const r = t === 'system' ? systemTheme() : t;
    const commit = () => {
      setThemeState(t);
      setResolved(r);
      apply(r);
    };
    try {
      if (t === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch {
      // the choice still applies for this visit
    }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    let reduce = false;
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      // ignore
    }
    if (!doc.startViewTransition || reduce || r === document.documentElement.getAttribute('data-theme')) {
      commit();
      return;
    }
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const vt = doc.startViewTransition(() => {
      flushSync(commit);
    });
    vt.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {});
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
