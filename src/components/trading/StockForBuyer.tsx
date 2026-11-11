"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { Badge, Button } from '@/components/ui';
import { releaseStock, reserveStock, useStock, usePriceRates } from '@/lib/stock-data';
import { fmtMoney } from '@/lib/stock-stats';
import { money } from '@/lib/trading-stats';
import type { Lead } from '@/lib/types';
import type { StockItem } from '@/lib/types-stock';
import { matchStock } from '../../../worker/lib/stock-match.mjs';
import SellDialog from './SellDialog';

type Match = { item: StockItem; ask_usd: number | null; budget_usd: number | null; fits: boolean; diff_pct: number | null };

/** "Ask vs budget" sentence for one match. */
export function askVsBudget(m: Match, lead: Lead): string {
  const ask = fmtMoney(m.item.ask_price, m.item.currency);
  if (m.item.ask_price === null) return 'No asking price set';
  if (lead.budget_amount === null || m.budget_usd === null) return `Ask ${ask}, buyer's budget unknown`;
  if (m.diff_pct === null || m.diff_pct === 0) return `Ask ${ask}, same as the buyer's ${money(m.budget_usd)}`;
  return `Ask ${ask}, ${Math.abs(m.diff_pct)}% ${m.diff_pct < 0 ? 'under' : 'over'} the buyer's ${money(m.budget_usd)}`;
}

/** Detail-panel section for a buyer lead: stock that fits, "Reserve for this buyer", and closing the loop with Mark sold. */
export default function StockForBuyer({ lead }: { lead: Lead }) {
  const { pushToast } = useShell();
  const { items, loading } = useStock();
  const { rates } = usePriceRates();
  const [selling, setSelling] = useState<StockItem | null>(null);
  const live = useMemo(() => items.filter((i) => i.status !== 'archived'), [items]);
  const reserved = useMemo(() => live.filter((i) => i.status === 'reserved' && i.buyer_lead_id === lead.id), [live, lead.id]);
  const matches = useMemo(() => (matchStock(lead, items, { rates }) as Match[]).slice(0, 3), [lead, items, rates]);

  if (loading) return null;

  const act = async (p: Promise<string | null>, ok: string) => {
    const err = await p;
    if (err) pushToast('error', err);
    else pushToast('success', ok);
  };

  return (
    <section aria-label="Your stock for this buyer">
      <h3 className="mb-1.5 text-sm font-semibold text-fg">Your stock for this buyer</h3>
      {live.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">
          You have not added any stock yet, so buyers are matched against your catalog.{' '}
          <Link href="/trading/stock" className="font-medium text-primary-text hover:underline">
            Add stock
          </Link>
        </p>
      ) : (
        <div className="space-y-2">
          {reserved.map((i) => (
            <div key={i.id} className="rounded-ctl border border-warning-border bg-warning-soft px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-fg">{i.title}</p>
                  <p className="text-xs text-fg-muted">Reserved for this buyer. {i.ask_price !== null ? `Asking ${fmtMoney(i.ask_price, i.currency)}.` : ''}</p>
                </div>
                <Badge tone="warning">Reserved</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => setSelling(i)}>
                  Mark sold
                </Button>
                <Button size="sm" onClick={() => void act(releaseStock(i), 'Released back to stock.')}>
                  Release
                </Button>
              </div>
            </div>
          ))}
          {reserved.length === 0 && matches.length === 0 && <p className="text-[13px] text-fg-subtle">Nothing you have in stock matches this buyer&apos;s game and kind of item.</p>}
          {reserved.length === 0 &&
            matches.map((m) => (
              <div key={m.item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-border bg-surface-2/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-fg">{m.item.title}</p>
                  <p className="text-xs text-fg-muted">
                    {askVsBudget(m, lead)}
                    {!m.fits && ' (above what they offer)'}
                  </p>
                </div>
                <Button size="sm" onClick={() => void act(reserveStock(m.item, lead.id), 'Reserved for this buyer.')}>
                  Reserve for this buyer
                </Button>
              </div>
            ))}
        </div>
      )}
      <SellDialog item={selling} rates={rates} defaultPrice={selling?.ask_price ?? lead.budget_amount} open={!!selling} onClose={() => setSelling(null)} />
    </section>
  );
}
