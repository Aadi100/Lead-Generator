"use client";

import Link from 'next/link';
import { MoreIcon, PauseIcon, PlayIcon, SignOutIcon } from '@/components/Icons';
import { Button, CountBadge, Drawer, SegmentedControl, cx } from '@/components/ui';
import { useTheme, type Theme } from '@/components/theme/ThemeProvider';
import { areaFor, MOBILE_PRIMARY_IDS, NAV_AREAS, type NavArea } from './nav';
import type { BadgeCounts } from './counts';
import { WorkerStatus } from './WorkerStatus';
import type { WorkerInfo } from './types';

const PRIMARY = MOBILE_PRIMARY_IDS.map((id) => NAV_AREAS.find((a) => a.id === id)!).filter(Boolean);

function areaCount(area: NavArea, counts: BadgeCounts): number | null {
  const n = (area.badges ?? []).reduce((sum, k) => sum + (counts[k] || 0), 0);
  return n > 0 ? n : null;
}

/** Phone tab bar: Home, Leads, Messages, My work, and More (opens the sheet). Hidden from 768 px up. */
export function BottomNav({ pathname, counts, onMore, moreActive }: { pathname: string; counts: BadgeCounts; onMore: () => void; moreActive: boolean }) {
  const active = areaFor(pathname);
  const onPrimary = active ? PRIMARY.some((p) => p.id === active.id) : false;
  const tab = 'btn relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors duration-fast';
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 glass-edge-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {PRIMARY.map((item) => {
          const on = active?.id === item.id;
          const Icon = item.icon;
          const n = areaCount(item, counts);
          return (
            <li key={item.id}>
              <Link href={item.href} aria-current={on ? 'page' : undefined} className={cx(tab, on ? 'text-primary-text' : 'text-fg-subtle')}>
                <span className={cx('relative inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-base', on && 'bg-primary-soft')}>
                  <Icon className="h-5 w-5" />
                  {n ? <CountBadge n={n} className="absolute -right-0.5 -top-1 !min-w-[1rem] !px-1 !leading-4" label={`${n} ${item.label}`} /> : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMore} aria-haspopup="dialog" className={cx(tab, 'w-full cursor-pointer', moreActive || (active && !onPrimary) ? 'text-primary-text' : 'text-fg-subtle')}>
            <span className={cx('inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-base', active && !onPrimary && 'bg-primary-soft')}>
              <MoreIcon className="h-5 w-5" />
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Bottom sheet with every module that is not on the tab bar, grouped, plus theme, pause and sign out. */
export function MobileSheet({
  open,
  onClose,
  pathname,
  counts,
  worker,
  paused,
  pausing,
  onTogglePause,
  onSignOut,
  email,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  counts: BadgeCounts;
  worker: WorkerInfo;
  paused: boolean;
  pausing: boolean;
  onTogglePause: () => void;
  onSignOut: () => void;
  email: string;
}) {
  const { theme, setTheme } = useTheme();
  const active = areaFor(pathname);
  const primaryIds = new Set<string>(MOBILE_PRIMARY_IDS);
  const themes: { id: Theme; label: string }[] = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'System' },
  ];
  return (
    <Drawer open={open} onClose={onClose} side="bottom" title="Menu" description={email || undefined}>
      <div className="space-y-5">
        <section aria-label="More">
          <ul className="grid grid-cols-3 gap-2">
            {NAV_AREAS.filter((a) => !primaryIds.has(a.id)).map((item) => {
              const Icon = item.icon;
              const on = active?.id === item.id;
              const n = areaCount(item, counts);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={on ? 'page' : undefined}
                    className={cx(
                      'btn relative flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-card border px-1.5 py-2 text-center text-[13px] font-medium transition-colors duration-fast',
                      on ? (item.accent ? 'border-success-border bg-accent-soft text-accent-text' : 'border-primary-border bg-primary-soft text-primary-text') : 'border-border bg-surface text-fg hover:bg-surface-2',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="leading-tight">{item.label}</span>
                    {n ? <CountBadge n={n} className="absolute right-1.5 top-1.5" label={`${n} ${item.label}`} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Preferences" className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-fg">Theme</span>
            <SegmentedControl label="Theme" value={theme} onChange={setTheme} options={themes} size="sm" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <WorkerStatus worker={worker} variant="row" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button title="Stops every email until you resume" variant={paused ? 'primary' : 'secondary'} onClick={onTogglePause} loading={pausing} leftIcon={paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}>
              {paused ? 'Resume sending' : 'Pause sending'}
            </Button>
            <Button variant="danger" onClick={onSignOut} leftIcon={<SignOutIcon className="h-4 w-4" />}>
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
