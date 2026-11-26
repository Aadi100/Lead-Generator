"use client";

import Link from 'next/link';
import { activeItemFor, areaFor, tabsFor } from './nav';
import { cx } from '@/components/ui';

/**
 * Tabs shown at the top of an area that holds several pages (Leads, My work, Game trading, Reports).
 * Rendered once by the shell, so no page needs its own.
 */
export default function SectionTabs({ pathname }: { pathname: string }) {
  const tabs = tabsFor(pathname);
  if (tabs.length === 0) return null;
  const area = areaFor(pathname);
  const active = activeItemFor(pathname);
  return (
    <div className="border-b border-border">
      <nav aria-label={area ? `${area.label} pages` : 'Pages'} className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {tabs.map((t) => {
          const on = active?.id === t.id;
          const accent = area?.accent;
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={cx(
                'relative inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-medium transition-colors duration-fast',
                on ? (accent ? 'text-accent-text' : 'text-primary-text') : 'text-fg-muted hover:text-fg',
              )}
            >
              {t.tabLabel ?? t.label}
              {on && <span aria-hidden="true" className={cx('absolute inset-x-2 -bottom-px h-0.5 rounded-full', accent ? 'bg-accent' : 'bg-primary')} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
