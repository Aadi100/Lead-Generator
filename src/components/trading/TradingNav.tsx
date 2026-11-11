"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BuyersIcon, CatalogIcon, MarketIcon, SellersIcon, TradingIcon } from '@/components/Icons';
import { cx } from '@/components/ui';

const LINKS = [
  { href: '/trading', label: 'Overview', icon: TradingIcon },
  { href: '/trading/buyers', label: 'Buyers', icon: BuyersIcon },
  { href: '/trading/sellers', label: 'Sellers', icon: SellersIcon },
  { href: '/trading/market', label: 'Market', icon: MarketIcon },
  { href: '/trading/catalog', label: 'My catalog', icon: CatalogIcon },
];

/** Quick links between the five trading pages (helps on phones where the sidebar is hidden). */
export default function TradingNav() {
  const path = usePathname() ?? '';
  return (
    <nav aria-label="Game Trading pages" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden">
      {LINKS.map((l) => {
        const on = path === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? 'page' : undefined}
            className={cx(
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-fast',
              on ? 'border-accent bg-accent-soft text-accent-text' : 'border-border bg-surface text-fg-muted hover:text-fg',
            )}
          >
            <l.icon className="h-4 w-4" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
