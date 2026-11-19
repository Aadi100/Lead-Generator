"use client";

import Link from 'next/link';
import { verdictText } from '../../../worker/lib/price-market.mjs';
import { Badge, cx, type Tone } from '@/components/ui';
import { money } from '@/lib/trading-stats';
import type { Lead } from '@/lib/types';

type Verdict = NonNullable<Lead['price_verdict']>;

// Whether a lower price is good news depends on the side: a cheap seller is a bargain for you, a low-balling buyer is not.
function toneFor(v: Verdict, side: Lead['trade_side']): Tone {
  if (v === 'fair') return 'neutral';
  const goodWhenBelow = side !== 'buyer';
  return (v === 'below') === goodWhenBelow ? 'success' : 'warning';
}

const stats = (l: Lead) => ({ basis: l.market_basis, n: l.market_samples ?? 0, median: l.market_median });

/** Short badge for lists: "18% below market". Renders nothing when there is no verdict (the detail view explains why). */
export function PriceVerdictBadge({ lead }: { lead: Lead }) {
  if (!lead.price_verdict || lead.price_pct === null) return null;
  const abs = Math.abs(Math.round(lead.price_pct));
  const text = lead.price_verdict === 'fair' ? 'Fair price' : `${abs}% ${lead.price_verdict} market`;
  return (
    <Badge tone={toneFor(lead.price_verdict, lead.trade_side)} title={verdictText({ verdict: lead.price_verdict, pct: lead.price_pct }, stats(lead))}>
      {text}
      {lead.market_basis === 'asking' ? ' (asks)' : ''}
    </Badge>
  );
}

const PANEL: Record<Tone, string> = {
  success: 'border-success-border bg-success-soft',
  warning: 'border-warning-border bg-warning-soft',
  neutral: 'border-border bg-surface-2',
  primary: 'border-border bg-surface-2',
  accent: 'border-border bg-surface-2',
  danger: 'border-danger-border bg-danger-soft',
  info: 'border-border bg-surface-2',
};

/** The full "Price vs market" block for a lead, including the honest no-data state. */
export function PriceVerdictPanel({ lead }: { lead: Lead }) {
  const has = !!lead.price_verdict && lead.price_pct !== null;
  const noPrice = lead.budget_amount === null || lead.budget_amount <= 0;
  const tone = has ? toneFor(lead.price_verdict as Verdict, lead.trade_side) : 'neutral';
  return (
    <div className={cx('mt-3 rounded-ctl border px-3 py-2.5', PANEL[tone])} role="note" aria-label="Price versus market">
      <p className="text-xs font-medium text-fg-subtle">Price vs market</p>
      {has ? (
        <>
          <p className="mt-0.5 text-sm font-semibold text-fg">{verdictText({ verdict: lead.price_verdict, pct: lead.price_pct }, stats(lead))}</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Typical price {money(lead.market_median)}.{' '}
            {lead.market_basis === 'asking'
              ? 'Based on asking prices from posts, which are weaker evidence than real sales. Log your own sales for a firmer number.'
              : 'Based on prices things actually sold for.'}
          </p>
        </>
      ) : noPrice ? (
        <p className="mt-0.5 text-sm text-fg-muted">This post does not state a price, so there is nothing to compare.</p>
      ) : (
        <p className="mt-0.5 text-sm text-fg-muted">
          No market data yet for this game and item. At least 3 saved prices are needed.{' '}
          <Link href="/trading/market" className="font-medium text-primary-text hover:underline">
            Log a sale
          </Link>
        </p>
      )}
      {has && <span className="sr-only">Compared in US dollars using approximate exchange rates.</span>}
    </div>
  );
}
