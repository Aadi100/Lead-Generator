"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { defaultSetting, loadSetting, patchSetting } from '@/lib/settings';
import { useToasts } from '@/lib/useToasts';
import type { SendingSettings } from '@/lib/types';
import { AlertIcon, RadarIcon } from './Icons';
import { Button, Skeleton, ToastStack, type ToastItem } from './ui';
import Sidebar from './shell/Sidebar';
import Topbar from './shell/Topbar';
import { BottomNav, MobileSheet } from './shell/MobileNav';
import CommandPalette from './shell/CommandPalette';
import SectionTabs from './shell/SectionTabs';
import { activeItemFor } from './shell/nav';
import { EMPTY_COUNTS, fetchBadgeCounts, REFRESH_COUNTS_EVENT, type BadgeCounts } from './shell/counts';
import type { LiveState, WorkerInfo } from './shell/types';

export type ShellContext = {
  email: string;
  pushToast: (kind: ToastItem['kind'], message: string, action?: ToastItem['action']) => void;
  sending: SendingSettings;
  refreshSending: () => Promise<void>;
  workerOnline: boolean;
  claudeReady: boolean;
  counts: BadgeCounts;
  refreshCounts: () => Promise<void>;
  openPalette: () => void;
};

const Ctx = createContext<ShellContext | null>(null);

export function useShell(): ShellContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShell must be used inside AppShell');
  return ctx;
}

const OFFLINE_AFTER_MS = 40_000;
const RAIL_KEY = 'lr:sidebar';

/**
 * Wraps every signed-in page: sidebar, top bar, phone tab bar, command palette, toasts and the pause banner.
 * The active module comes from the URL (see shell/nav.ts), so pages do not need to say which one they are.
 * `active` is accepted for older callers and ignored.
 */
export default function AppShell({ children }: { active?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { toasts, pushToast, dismissToast } = useToasts();
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState<SendingSettings>(() => defaultSetting('sending'));
  const [worker, setWorker] = useState<WorkerInfo>({ loaded: false, online: false, claude: false, lastSeen: null });
  const [counts, setCounts] = useState<BadgeCounts>(EMPTY_COUNTS);
  const [live, setLive] = useState<LiveState>('connecting');
  const [pausing, setPausing] = useState(false);
  const [rail, setRail] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remembered layout choices.
  useEffect(() => {
    try {
      setRail(localStorage.getItem(RAIL_KEY) === 'rail');
    } catch {
      // defaults
    }
  }, []);

  const toggleRail = useCallback(() => {
    setRail((v) => {
      try {
        localStorage.setItem(RAIL_KEY, v ? 'full' : 'rail');
      } catch {
        // not persisted
      }
      return !v;
    });
  }, []);

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        router.replace('/login');
        return;
      }
      setEmail(session.user.email ?? '');
      setAuthed(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login');
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const refreshSending = useCallback(async () => {
    const res = await loadSetting('sending');
    if (!res.error) setSending(res.value);
  }, []);

  const refreshWorker = useCallback(async () => {
    const res = await loadSetting('worker_status');
    if (res.error) {
      setWorker((w) => ({ ...w, loaded: true }));
      return;
    }
    const seen = res.value.last_seen ? new Date(res.value.last_seen).getTime() : 0;
    setWorker({
      loaded: true,
      online: seen > 0 && Date.now() - seen < OFFLINE_AFTER_MS,
      claude: res.value.claude.available,
      lastSeen: res.value.last_seen,
    });
  }, []);

  const refreshCounts = useCallback(async () => {
    setCounts(await fetchBadgeCounts());
  }, []);

  useEffect(() => {
    if (!authed) return;
    void refreshSending();
    void refreshWorker();
    void refreshCounts();
    const t1 = setInterval(() => void refreshWorker(), 10_000);
    const t2 = setInterval(() => void refreshSending(), 20_000);
    const t3 = setInterval(() => void refreshCounts(), 60_000);

    const schedule = () => {
      if (countTimer.current) clearTimeout(countTimer.current);
      countTimer.current = setTimeout(() => void refreshCounts(), 500);
    };
    const suffix = Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(`shell-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outreach' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, schedule)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLive('live');
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLive('offline');
        else setLive('connecting');
      });
    // Separate channel: tasks and deals may not be published for realtime yet, and that must not affect the live indicator.
    const extra = supabase
      .channel(`shell-extra-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, schedule)
      .subscribe();
    window.addEventListener(REFRESH_COUNTS_EVENT, schedule);

    return () => {
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
      if (countTimer.current) clearTimeout(countTimer.current);
      window.removeEventListener(REFRESH_COUNTS_EVENT, schedule);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(extra);
    };
  }, [authed, refreshSending, refreshWorker, refreshCounts]);

  // Ctrl/Cmd+K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setPaused = useCallback(
    async (paused: boolean) => {
      setPausing(true);
      const res = await patchSetting('sending', { paused });
      setPausing(false);
      if (res.error || !res.value) {
        pushToast('error', `Could not ${paused ? 'pause' : 'resume'} sending: ${res.error ?? 'unknown error'}`);
        return;
      }
      setSending(res.value);
      pushToast('success', paused ? 'Sending is paused. No email will go out.' : 'Sending is back on.');
    },
    [pushToast],
  );

  const togglePause = useCallback(() => void setPaused(!sending.paused), [setPaused, sending.paused]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  }, [router]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  const ctx = useMemo<ShellContext>(
    () => ({ email, pushToast, sending, refreshSending, workerOnline: worker.online, claudeReady: worker.claude, counts, refreshCounts, openPalette }),
    [email, pushToast, sending, refreshSending, worker.online, worker.claude, counts, refreshCounts, openPalette],
  );

  const active = activeItemFor(pathname);

  if (!authed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-sm text-fg-subtle" aria-busy="true">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-on">
          <RadarIcon className="h-5 w-5" />
        </span>
        <Skeleton className="h-2 w-28" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex min-h-screen">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Sidebar
          pathname={pathname}
          rail={rail}
          onToggleRail={toggleRail}
          counts={counts}
          paused={sending.paused}
          pausing={pausing}
          onTogglePause={togglePause}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title={active?.label ?? 'Lead Radar'}
            email={email}
            worker={worker}
            live={live}
            onOpenPalette={openPalette}
            onOpenSheet={() => setSheetOpen(true)}
            onSignOut={handleSignOut}
            pushToast={pushToast}
          />
          {sending.paused && (
            <div role="alert" className="bg-danger-solid text-white">
              <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-2 text-sm sm:px-6 lg:px-8">
                <AlertIcon className="h-4 w-4 shrink-0" />
                <p className="min-w-0 flex-1 font-medium">Sending is paused. No emails or follow-ups will go out until you resume.</p>
                <Button variant="secondary" size="sm" onClick={() => void setPaused(false)} loading={pausing} className="!border-white/40 !bg-white !text-danger-solid hover:!bg-white/90">
                  Resume sending
                </Button>
              </div>
            </div>
          )}
          <SectionTabs pathname={pathname} />
          <div id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none md:pb-0">
            {children}
          </div>
        </div>
        <BottomNav pathname={pathname} counts={counts} onMore={() => setSheetOpen(true)} moreActive={sheetOpen} />
        <MobileSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          pathname={pathname}
          counts={counts}
          worker={worker}
          paused={sending.paused}
          pausing={pausing}
          onTogglePause={togglePause}
          onSignOut={handleSignOut}
          email={email}
        />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} paused={sending.paused} onTogglePause={togglePause} pushToast={pushToast} />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </Ctx.Provider>
  );
}
