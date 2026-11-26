"use client";

import Link from 'next/link';
import { ChevronIcon, PanelLeftIcon, PauseIcon, PlayIcon } from '@/components/Icons';
import { Button, CountBadge, IconButton, RadarMark, cx, useSlider } from '@/components/ui';
import { areaFor, NAV_AREAS, type NavArea } from './nav';
import type { BadgeCounts } from './counts';

const PAUSE_HINT = 'Stops every email until you resume';

function AreaLink({ area, active, rail, count }: { area: NavArea; active: boolean; rail: boolean; count: number | null }) {
  const Icon = area.icon;
  const center = rail ? 'justify-center' : 'justify-center lg:justify-start';
  const label = rail ? 'hidden' : 'hidden lg:inline';
  return (
    <Link
      href={area.href}
      aria-current={active ? 'page' : undefined}
      title={area.hint}
      className={cx(
        'btn group relative flex h-10 items-center gap-3 rounded-ctl px-2.5 text-[15px] transition-colors duration-fast',
        center,
        active ? cx('z-10 font-medium', area.accent ? 'text-accent-text' : 'text-primary-text') : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
      data-on={active ? 'true' : undefined}
      data-accent={area.accent ? 'true' : undefined}
    >
      <Icon className={cx('h-5 w-5 shrink-0 transition-transform duration-base ease-soft group-hover:translate-x-0.5', active && 'translate-x-0.5')} />
      <span className={cx('nav-label-in min-w-0 flex-1 truncate', label)}>{area.label}</span>
      {count ? (
        <CountBadge
          n={count}
          tone={area.accent ? 'accent' : 'primary'}
          label={`${count} ${area.label}`}
          className={cx('absolute right-1 top-0.5 !min-w-[1rem] !px-1 !leading-4', !rail && 'lg:static lg:!px-1.5 lg:!leading-5')}
        />
      ) : null}
    </Link>
  );
}

function areaCount(area: NavArea, counts: BadgeCounts): number | null {
  const n = (area.badges ?? []).reduce((sum, k) => sum + (counts[k] || 0), 0);
  return n > 0 ? n : null;
}

export default function Sidebar({
  pathname,
  rail,
  onToggleRail,
  counts,
  paused,
  pausing,
  onTogglePause,
}: {
  pathname: string;
  rail: boolean;
  onToggleRail: () => void;
  counts: BadgeCounts;
  paused: boolean;
  pausing: boolean;
  onTogglePause: () => void;
}) {
  const label = rail ? 'hidden' : 'hidden lg:inline';
  const activeArea = areaFor(pathname);
  const activeId = activeArea?.id ?? '';
  const slider = useSlider<HTMLElement>(activeId, [rail]);
  const pillAccent = !!activeArea?.accent;
  const top = NAV_AREAS.filter((a) => !a.bottom);
  const bottom = NAV_AREAS.filter((a) => a.bottom);
  return (
    <aside
      aria-label="Sidebar"
      className={cx(
        'sticky top-0 hidden h-screen shrink-0 flex-col glass-edge-r transition-[width] duration-base ease-soft md:flex',
        rail ? 'w-[68px]' : 'w-[68px] lg:w-[240px]',
      )}
    >
      <div className={cx('flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3', rail ? 'justify-center' : 'justify-center lg:justify-start')}>
        <Link href="/" aria-label="Lead Radar home" className="inline-flex shrink-0 rounded-lg">
          <RadarMark />
        </Link>
        <div className={cx('nav-label-in min-w-0', label)}>
          <p className="truncate text-[15px] font-semibold leading-tight text-fg">Lead Radar</p>
          <p className="truncate text-xs text-fg-subtle">Find and win clients</p>
        </div>
      </div>

      <nav ref={slider.ref} aria-label="Main" className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-3 pt-1">
        <span
          aria-hidden="true"
          className={cx('slider-thumb nav-pill', pillAccent ? 'bg-accent-soft text-accent-text' : 'bg-primary-soft text-primary-text')}
          data-ready={slider.ready}
          style={slider.style}
        />
        <ul className="space-y-1 px-2 pt-2">
          {top.map((a) => (
            <li key={a.id}>
              <AreaLink area={a} active={activeId === a.id} rail={rail} count={areaCount(a, counts)} />
            </li>
          ))}
        </ul>
        <ul className="mt-auto space-y-1 border-t border-border px-2 pt-2">
          {bottom.map((a) => (
            <li key={a.id}>
              <AreaLink area={a} active={activeId === a.id} rail={rail} count={areaCount(a, counts)} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border p-2">
        <div className={cx(rail ? 'flex justify-center' : 'flex justify-center lg:block')}>
          <span title={PAUSE_HINT} className={cx(rail ? 'inline-flex' : 'inline-flex lg:hidden')}>
            <IconButton label={paused ? 'Resume sending' : 'Pause sending'} onClick={onTogglePause} disabled={pausing} variant={paused ? 'primary' : 'ghost'}>
              {paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
            </IconButton>
          </span>
          {!rail && (
            <span title={PAUSE_HINT} className="hidden w-full lg:block">
            <Button
              variant={paused ? 'primary' : 'secondary'}
              size="md"
              fullWidth
              onClick={onTogglePause}
              loading={pausing}
              leftIcon={paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
              className="inline-flex"
            >
              {paused ? 'Resume sending' : 'Pause sending'}
            </Button>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleRail}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          className="btn hidden h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-ctl text-[13px] text-fg-subtle transition-colors duration-fast hover:bg-surface-2 hover:text-fg lg:flex"
        >
          <PanelLeftIcon className="h-4 w-4" />
          {!rail && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
