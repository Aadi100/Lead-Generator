"use client";

import { memo } from 'react';
import type { Lead, OutreachRow } from '@/lib/types';
import { budgetLabel, displayDate, isFlagged, timeAgo } from '@/lib/format';
import { outreachChip } from '@/lib/outreach';
import { Badge, CategoryChip, Checkbox, TrustBadge, cx } from '@/components/ui';
import { AlertIcon } from '@/components/Icons';
import type { AlsoSeenChip } from '@/lib/lead-identity';
import { AlsoSeenBadge, FitBadge, StatusDot } from './LeadBits';

type Props = {
  lead: Lead;
  now: number;
  outreach: OutreachRow[];
  selected: boolean;
  checked: boolean;
  cursor: boolean;
  fresh: boolean;
  alsoSeen?: AlsoSeenChip | null;
  onOpen: (id: string) => void;
  onCheck: (id: string, value: boolean) => void;
};

function LeadGridCardImpl({ lead, now, outreach, selected, checked, cursor, fresh, alsoSeen, onOpen, onCheck }: Props) {
  const flagged = isFlagged(lead);
  const budget = budgetLabel(lead);
  const chip = outreachChip(outreach);
  const when = displayDate(lead);

  return (
    <li
      id={`lead-${lead.id}`}
      data-lead-id={lead.id}
      className={cx(
        'glass lift relative flex flex-col rounded-card',
        selected && 'ring-2 ring-primary',
        flagged && !selected && 'ring-1 ring-danger-border',
        lead.status === 'Ignored' && 'opacity-70',
        fresh && 'row-new',
        cursor && 'outline outline-2 outline-offset-2 outline-primary/60',
      )}
    >
      <div className="absolute right-1 top-1 z-10">
        <Checkbox checked={checked} onChange={(v) => onCheck(lead.id, v)} label={<span className="sr-only">Select {lead.title}</span>} className="p-2 coarse:p-3.5" />
      </div>
      <button type="button" onClick={() => onOpen(lead.id)} aria-current={selected ? 'true' : undefined} className="flex flex-1 flex-col gap-2 rounded-card p-3.5 pr-10 text-left">
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusDot status={lead.status} />
          <span className="text-xs font-medium text-fg-muted">{lead.status}</span>
          {lead.category && <CategoryChip category={lead.category} />}
          {fresh && <Badge tone="primary">New</Badge>}
          {alsoSeen && <AlsoSeenBadge chip={alsoSeen} />}
          {flagged && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
              <AlertIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Check first
            </span>
          )}
        </span>
        <span className="line-clamp-2 break-words text-sm font-semibold leading-snug text-fg">{lead.title}</span>
        <span className="line-clamp-2 break-words text-[13px] leading-relaxed text-fg-muted">{lead.description || 'No description provided.'}</span>
        <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <FitBadge lead={lead} />
          <TrustBadge level={lead.trust_level} score={lead.trust_score} />
          {chip && <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', chip.tone)}>{chip.label}</span>}
        </span>
        <span className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-fg-subtle">
          <span className="min-w-0 truncate">
            {lead.source} · <time dateTime={when}>{timeAgo(when, now)}</time>
          </span>
          {budget && <span className="font-num shrink-0 text-[13px] font-medium text-success">{budget}</span>}
        </span>
      </button>
    </li>
  );
}

export default memo(LeadGridCardImpl);
