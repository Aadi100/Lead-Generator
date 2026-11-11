"use client";

import Link from 'next/link';
import type { QuickAddOutcome } from '@/lib/capture';
import { Notice, pill } from '../ui';

export type OutcomeRow = { label: string; outcome: QuickAddOutcome | null };

const OUTCOME_STYLE = {
  inserted: { cls: 'bg-success-soft text-success ring-success-border', text: 'Saved' },
  duplicate: { cls: 'bg-surface-2 text-fg-muted ring-border', text: 'Already in your leads' },
  skipped: { cls: 'bg-warning-soft text-warning ring-warning-border', text: 'Skipped' },
} as const;

const KIND_TEXT: Record<string, string> = { trade: 'Game trade', request: 'Service request', service: 'Service request', prospect: 'Prospect' };

export default function OutcomeList({
  summary,
  rows,
}: {
  summary: { inserted: number; duplicates: number; skipped: number };
  rows: OutcomeRow[];
}) {
  const tone = summary.inserted > 0 ? 'ok' : 'warn';
  return (
    <div className="mt-4 space-y-3">
      <Notice tone={tone}>
        <p className="font-medium">
          {summary.inserted} saved · {summary.duplicates} already there · {summary.skipped} skipped
        </p>
        {summary.inserted > 0 && (
          <p className="mt-1">
            They are in your leads now.{' '}
            <Link href="/leads" className="font-medium underline underline-offset-2">
              Open Leads
            </Link>
          </p>
        )}
      </Notice>
      <ul className="divide-y divide-border rounded-card border border-border bg-surface-2/40">
        {rows.map((row, i) => {
          const o = row.outcome;
          const style = OUTCOME_STYLE[o?.outcome ?? 'skipped'];
          const chips = [
            o?.kind ? KIND_TEXT[o.kind] ?? o.kind : null,
            o?.game ?? null,
            o?.item_type ?? null,
            o?.side === 'buyer' ? 'Wants to buy' : o?.side === 'seller' ? 'Selling' : null,
            o?.trust !== undefined ? `Trust ${o.trust}` : null,
          ].filter((c): c is string => Boolean(c));
          return (
            <li key={i} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
              <span className={`${pill} shrink-0 self-start ${style.cls}`}>{o ? style.text : 'No answer'}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-fg">{o?.title || row.label}</p>
                {(o?.reason || chips.length > 0 || o?.trade_match) && (
                  <p className="mt-0.5 break-words text-xs text-fg-subtle">
                    {[o?.trade_match, ...chips, o?.reason].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
