"use client";

import Link from 'next/link';
import { ChevronIcon, PanelLeftIcon, PauseIcon, PlayIcon } from '@/components/Icons';
import { Button, CountBadge, IconButton, RadarMark, cx, useSlider } from '@/components/ui';
import { activeItemFor, NAV_GROUPS, type NavGroup, type NavItem } from './nav';
import type { BadgeCounts } from './counts';
import { WorkerStatus } from './WorkerStatus';
import type { WorkerInfo } from './types';

function NavLink({ item, active, accent, rail, count }: { item: NavItem; active: boolean; accent?: boolean; rail: boolean; count: number | null }) {
  const Icon = item.icon;
  const center = rail ? 'justify-center' : 'justify-center lg:justify-start';
  const label = rail ? 'hidden' : 'hidden lg:inline';
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={cx(
        'btn group relative flex h-9 items-center gap-3 rounded-ctl px-2.5 text-sm transition-colors duration-fast',
        center,
        active ? cx('z-10 font-medium', accent ? 'text-accent-text' : 'text-primary-text') : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
      data-on={active ? 'true' : undefined}
      data-accent={accent ? 'true' : undefined}
    >
      <Icon className={cx('h-[18px] w-[18px] shrink-0 transition-transform duration-base ease-soft group-hover:translate-x-0.5', active && 'translate-x-0.5')} />
      <span className={cx('nav-label-in min-w-0 flex-1 truncate', label)}>{item.label}</span>
      {count ? (
        <CountBadge
          n={count}
          tone={accent ? 'accent' : 'primary'}
          label={`${count} ${item.label}`}
          className={cx('absolute right-1 top-0.5 !min-w-[1rem] !px-1 !leading-4', !rail && 'lg:static lg:!px-1.5 lg:!leading-5')}
        />
      ) : null}
    </Link>
  );
}

function Group({
  group,
  pathname,
  rail,
  collapsed,
  onToggle,
  counts,
}: {
  group: NavGroup;
  pathname: string;
  rail: boolean;
  collapsed: boolean;
  onToggle: () => void;
  counts: BadgeCounts;
}) {
  const active = activeItemFor(pathname);
  const GroupIcon = group.icon;
  return (
    <div className="px-2">
      {group.collapsible && (
        <>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls={`nav-group-${group.id}`}
            className={cx('btn mt-3 items-center gap-2 px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle hover:text-fg', rail ? 'hidden' : 'hidden lg:flex')}
          >
            {GroupIcon && <GroupIcon className={cx('h-3.5 w-3.5', group.accent && 'text-accent-text')} />}
            <span className="flex-1 text-left">{group.label}</span>
            <ChevronIcon className={cx('h-3.5 w-3.5 transition-transform duration-base', collapsed && '-rotate-90')} />
          </button>
          <div aria-hidden="true" className={cx('mx-2 my-2.5 h-px bg-border', rail ? 'block' : 'lg:hidden')} />
        </>
      )}
      <ul id={`nav-group-${group.id}`} className={cx('space-y-0.5', collapsed && (rail ? '' : 'lg:hidden'))}>
        {group.items.map((item) => (
          <li key={item.id}>
            <NavLink item={item} active={active?.id === item.id} accent={group.accent} rail={rail} count={item.badge ? counts[item.badge] : null} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Sidebar({
  pathname,
  rail,
  onToggleRail,
  collapsedGroups,
  onToggleGroup,
  counts,
  worker,
  paused,
  pausing,
  onTogglePause,
}: {
  pathname: string;
  rail: boolean;
  onToggleRail: () => void;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
  counts: BadgeCounts;
  worker: WorkerInfo;
  paused: boolean;
  pausing: boolean;
  onTogglePause: () => void;
}) {
  const label = rail ? 'hidden' : 'hidden lg:inline';
  const activeId = activeItemFor(pathname)?.id ?? '';
  const slider = useSlider<HTMLElement>(activeId, [rail, collapsedGroups]);
  const pillAccent = NAV_GROUPS.some((g) => g.accent && g.items.some((i) => i.id === activeId));
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
          <p className="truncate text-xs text-fg-subtle">Leads, deals and trading</p>
        </div>
      </div>

      <nav ref={slider.ref} aria-label="Main" className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-3 pt-1">
        <span
          aria-hidden="true"
          className={cx('slider-thumb nav-pill', pillAccent ? 'bg-accent-soft text-accent-text' : 'bg-primary-soft text-primary-text')}
          data-ready={slider.ready}
          style={slider.style}
        />
        {NAV_GROUPS.map((g) => (
          <Group key={g.id} group={g} pathname={pathname} rail={rail} collapsed={!!collapsedGroups[g.id]} onToggle={() => onToggleGroup(g.id)} counts={counts} />
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border p-2">
        {rail ? <WorkerStatus worker={worker} variant="icon" /> : (
          <>
            <div className="lg:hidden">
              <WorkerStatus worker={worker} variant="icon" />
            </div>
            <div className="hidden lg:block">
              <WorkerStatus worker={worker} variant="row" />
            </div>
          </>
        )}

        <div className={cx(rail ? 'flex justify-center' : 'flex justify-center lg:block')}>
          <span className={cx(rail ? 'inline-flex' : 'inline-flex lg:hidden')}>
            <IconButton label={paused ? 'Resume sending' : 'Pause sending'} onClick={onTogglePause} disabled={pausing} variant={paused ? 'primary' : 'ghost'}>
              {paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
            </IconButton>
          </span>
          {!rail && (
            <Button
              variant={paused ? 'primary' : 'secondary'}
              size="md"
              fullWidth
              onClick={onTogglePause}
              loading={pausing}
              leftIcon={paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
              className="hidden lg:inline-flex"
            >
              {paused ? 'Resume sending' : 'Pause sending'}
            </Button>
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
