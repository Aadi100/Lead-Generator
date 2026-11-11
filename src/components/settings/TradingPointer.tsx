"use client";

import Link from 'next/link';
import { ArrowRightIcon, TradingIcon } from '../Icons';
import { Card, btnPrimary } from '../ui';

/** The trading editor now lives in the Game Trading catalog. Settings only points to it. */
export default function TradingPointer() {
  return (
    <Card title="Game trading settings">
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
          <TradingIcon className="h-5 w-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-fg-muted">
          Games, items, sources and the market rules for trading leads are edited in the Game Trading catalog now, next to the data they affect. Nothing is duplicated here.
        </p>
        <Link href="/trading/catalog" className={btnPrimary}>
          Open the catalog
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
