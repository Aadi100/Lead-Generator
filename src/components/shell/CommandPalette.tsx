"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { enqueueJob } from '@/lib/jobs';
import type { JobType } from '@/lib/types';
import { ArrowRightIcon, CheckIcon, LeadsIcon, MonitorIcon, MoonIcon, PauseIcon, PlayIcon, RefreshIcon, SearchIcon, SettingsIcon, SparkIcon, SunIcon, TasksIcon, TradingIcon } from '@/components/Icons';
import { Kbd, cx, useOverlay, usePresence } from '@/components/ui';
import { useTheme } from '@/components/theme/ThemeProvider';
import { ALL_ITEMS, groupOf, SETTINGS_TABS } from './nav';
import { requestNewTask } from './TopbarMenus';

type EntryGroup = 'Leads' | 'Pages' | 'Settings' | 'Actions';
type Entry = { id: string; group: EntryGroup; label: string; hint?: string; icon: JSX.Element; keywords?: string; run: () => void | Promise<void> };

type LeadHit = { id: string; title: string; source: string | null; status: string | null; lead_kind: string | null; trade_side: string | null };

const GROUP_ORDER: EntryGroup[] = ['Leads', 'Actions', 'Pages', 'Settings'];
const ic = 'h-4 w-4';

export default function CommandPalette({
  open,
  onClose,
  paused,
  onTogglePause,
  pushToast,
}: {
  open: boolean;
  onClose: () => void;
  paused: boolean;
  onTogglePause: () => void;
  pushToast: (kind: 'success' | 'info' | 'error', message: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [leads, setLeads] = useState<LeadHit[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  useOverlay(panel, open, onClose);
  const { mounted, closing } = usePresence(open, 120);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  // Lead search: recent leads when empty, title search (8 results) from 2 characters, debounced.
  useEffect(() => {
    if (!open) return;
    const q = query.trim().replace(/[%_\\]/g, ' ').trim();
    if (q.length === 1) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let req = supabase.from('leads').select('id,title,source,status,lead_kind,trade_side').order('created_at', { ascending: false });
      req = q ? req.ilike('title', `%${q}%`).limit(8) : req.limit(5);
      const { data, error } = await req;
      if (!cancelled) setLeads(error ? [] : ((data ?? []) as LeadHit[]));
    }, q ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const queue = useCallback(
    async (type: JobType, done: string) => {
      onClose();
      const res = await enqueueJob(type, {});
      pushToast(res.error ? 'error' : 'success', res.error ?? done);
    },
    [onClose, pushToast],
  );

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    for (const l of leads) {
      const href = l.lead_kind === 'trade' ? `/trading/${l.trade_side === 'seller' ? 'sellers' : 'buyers'}?lead=${l.id}` : `/leads?lead=${l.id}`;
      list.push({ id: `lead-${l.id}`, group: 'Leads', label: l.title, hint: [l.source, l.status].filter(Boolean).join(' · '), icon: <LeadsIcon className={ic} />, run: () => go(href) });
    }
    list.push(
      { id: 'a-pause', group: 'Actions', label: paused ? 'Resume sending' : 'Pause sending', hint: paused ? 'Sending is paused' : 'Stops all email and follow-ups', icon: paused ? <PlayIcon className={ic} /> : <PauseIcon className={ic} />, keywords: 'stop halt emergency', run: () => { onClose(); onTogglePause(); } },
      { id: 'a-task', group: 'Actions', label: 'New task', icon: <TasksIcon className={ic} />, keywords: 'todo follow-up reminder add create', run: () => { onClose(); requestNewTask(); } },
      { id: 'a-lead', group: 'Actions', label: 'Add a lead (Capture)', icon: <ArrowRightIcon className={ic} />, keywords: 'paste bookmarklet new lead', run: () => go('/capture') },
      { id: 'a-deal', group: 'Actions', label: 'New deal', icon: <ArrowRightIcon className={ic} />, keywords: 'order sale create', run: () => go('/deals?new=1') },
      { id: 'a-trade', group: 'Actions', label: 'Find trade leads now', hint: 'Asks the background helper', icon: <TradingIcon className={ic} />, keywords: 'scan game buyers sellers', run: () => queue('trade_scan', 'Asked the background helper to look for trade leads.') },
      { id: 'a-sell', group: 'Actions', label: 'Suggest what I can sell', hint: 'Asks the background helper', icon: <SparkIcon className={ic} />, keywords: 'market ideas demand', run: () => queue('suggest_trading', 'Asked the background helper for selling ideas.') },
      { id: 'a-learn', group: 'Actions', label: 'Refresh learning', hint: 'Asks the background helper', icon: <RefreshIcon className={ic} />, keywords: 'filters insights recalc', run: () => queue('learn_filters', 'Asked the background helper to refresh what it learned.') },
      { id: 'a-replies', group: 'Actions', label: 'Check for replies now', hint: 'Asks the background helper', icon: <RefreshIcon className={ic} />, keywords: 'inbox imap', run: () => queue('check_replies', 'Asked the background helper to check your inbox.') },
      { id: 'a-prospects', group: 'Actions', label: 'Find local prospects now', hint: 'Asks the background helper', icon: <RefreshIcon className={ic} />, keywords: 'openstreetmap shops no website', run: () => queue('prospect_local', 'Asked the background helper to look for local prospects.') },
      { id: 't-light', group: 'Actions', label: 'Theme: Light', icon: theme === 'light' ? <CheckIcon className={ic} /> : <SunIcon className={ic} />, keywords: 'appearance bright', run: () => { setTheme('light'); onClose(); } },
      { id: 't-dark', group: 'Actions', label: 'Theme: Dark', icon: theme === 'dark' ? <CheckIcon className={ic} /> : <MoonIcon className={ic} />, keywords: 'appearance night', run: () => { setTheme('dark'); onClose(); } },
      { id: 't-system', group: 'Actions', label: 'Theme: Follow my system', icon: theme === 'system' ? <CheckIcon className={ic} /> : <MonitorIcon className={ic} />, keywords: 'appearance auto', run: () => { setTheme('system'); onClose(); } },
    );
    for (const item of ALL_ITEMS) {
      const Icon = item.icon;
      list.push({ id: `p-${item.id}`, group: 'Pages', label: item.label, hint: groupOf(item.id)?.id === 'trading' ? `Game trading · ${item.description}` : item.description, icon: <Icon className={ic} />, keywords: item.keywords, run: () => go(item.href) });
    }
    for (const t of SETTINGS_TABS) {
      list.push({
        id: `s-${t.id}`,
        group: 'Settings',
        label: `Settings · ${t.label}`,
        icon: <SettingsIcon className={ic} />,
        keywords: 'preferences configure',
        run: () => {
          onClose();
          if (pathname === '/settings') window.location.hash = t.id;
          else router.push(`/settings#${t.id}`);
        },
      });
    }
    return list;
  }, [leads, paused, theme, go, queue, onClose, onTogglePause, setTheme, pathname, router]);

  const results = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const cap: Record<EntryGroup, number> = tokens.length ? { Leads: 8, Actions: 8, Pages: 8, Settings: 6 } : { Leads: 5, Actions: 6, Pages: 6, Settings: 0 };
    const out: Entry[] = [];
    for (const g of GROUP_ORDER) {
      const inGroup = entries.filter((e) => e.group === g && (g === 'Leads' || tokens.every((t) => `${e.label} ${e.hint ?? ''} ${e.keywords ?? ''}`.toLowerCase().includes(t))));
      out.push(...inGroup.slice(0, cap[g]));
    }
    return out;
  }, [entries, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    if (index >= results.length) setIndex(Math.max(0, results.length - 1));
  }, [results.length, index]);
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [index, open, listId]);

  if (!mounted || typeof document === 'undefined') return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void results[index]?.run();
    }
  };

  let lastGroup: EntryGroup | null = null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[10vh] sm:px-4">
      <div className={cx('absolute inset-0', closing ? 'animate-fade-out' : 'animate-fade-in')} style={{ backgroundColor: 'rgb(var(--backdrop))' }} onMouseDown={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1} className={cx(closing ? 'animate-pop-out' : 'animate-pop', 'relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-float outline-none')}>
        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          <SearchIcon className="h-4 w-4 shrink-0 text-fg-subtle" />
          <input
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${index}` : undefined}
            aria-label="Search leads, pages and actions"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leads, pages and actions…"
            className="h-12 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">Nothing matches “{query}”. Try a page name, a setting, or part of a lead title.</p>
          ) : (
            results.map((r, i) => {
              const header = r.group !== lastGroup;
              lastGroup = r.group;
              return (
                <div key={r.id}>
                  {header && (
                    <p role="presentation" className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                      {r.group === 'Leads' ? (query.trim() ? 'Leads' : 'Recent leads') : r.group === 'Actions' ? 'Quick actions' : r.group}
                    </p>
                  )}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === index}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => void r.run()}
                    className={cx('flex cursor-pointer items-center gap-3 rounded-ctl px-2.5 py-2 text-sm transition-colors duration-fast', i === index ? 'bg-primary-soft text-fg' : 'text-fg')}
                  >
                    <span className={cx('shrink-0', i === index ? 'text-primary-text' : 'text-fg-subtle')}>{r.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {r.hint && <span className="hidden max-w-[45%] shrink-0 truncate text-xs text-fg-subtle sm:block">{r.hint}</span>}
                    {i === index && <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-primary-text" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-surface-2 px-3.5 py-2 text-xs text-fg-subtle">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto hidden sm:block">Type to search leads by title</span>
        </div>
        <p className="sr-only" aria-live="polite">{results.length} results</p>
      </div>
    </div>,
    document.body,
  );
}
