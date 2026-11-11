"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MenuIcon, SearchIcon } from '@/components/Icons';
import { IconButton, Kbd, RadarMark } from '@/components/ui';
import { LiveDot, WorkerStatus } from './WorkerStatus';
import { NotificationsBell, QuickCreate, ThemeMenu, UserMenu } from './TopbarMenus';
import type { LiveState, WorkerInfo } from './types';

export default function Topbar({
  title,
  email,
  worker,
  live,
  onOpenPalette,
  onOpenSheet,
  onSignOut,
  pushToast,
}: {
  title: string;
  email: string;
  worker: WorkerInfo;
  live: LiveState;
  onOpenPalette: () => void;
  onOpenSheet: () => void;
  onSignOut: () => void;
  pushToast: (kind: 'success' | 'info' | 'error', message: string) => void;
}) {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    try {
      setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    } catch {
      // keep Ctrl
    }
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 glass-edge-b px-3 sm:px-4 lg:px-6">
      <Link href="/" className="flex min-w-0 items-center gap-2 md:hidden" aria-label="Lead Radar home">
        <RadarMark />
        <span className="truncate text-[15px] font-semibold text-fg">{title}</span>
      </Link>

      <button
        type="button"
        onClick={onOpenPalette}
        className="btn hidden h-9 w-full max-w-md cursor-pointer items-center gap-2.5 field rounded-ctl px-3 text-sm text-fg-subtle transition-colors duration-fast hover:border-border-strong hover:text-fg-muted md:flex"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Search leads, pages and actions…</span>
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </span>
        <span className="sr-only">Open command palette ({mac ? 'Command' : 'Control'} K)</span>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <IconButton label="Search" className="md:hidden" onClick={onOpenPalette}>
          <SearchIcon className="h-[18px] w-[18px]" />
        </IconButton>
        <QuickCreate pushToast={pushToast} />
        <NotificationsBell />
        <ThemeMenu />
        <span className="ml-1 hidden lg:block">
          <WorkerStatus worker={worker} variant="pill" />
        </span>
        <span className="mx-1.5 hidden sm:inline-flex">
          <LiveDot live={live} />
        </span>
        <span className="hidden md:block">
          <UserMenu email={email} onSignOut={onSignOut} />
        </span>
        <IconButton label="Open menu" className="md:hidden" onClick={onOpenSheet}>
          <MenuIcon className="h-[18px] w-[18px]" />
        </IconButton>
      </div>
    </header>
  );
}
