"use client";

import { memo } from 'react';
import type { Lead, OutreachRow } from '@/lib/types';
import { budgetLabel, displayDate, timeAgo } from '@/lib/format';
import { outreachChip } from '@/lib/outreach';
import { Badge, Checkbox, cx } from '@/components/ui';
import type { AlsoSeenChip } from '@/lib/lead-identity';
import { MatchTagBadge, StatusDot, leadHint } from './LeadBits';

type RowProps = {
  lead: Lead;
  now: number;
  outreach: OutreachRow[];
  selected: boolean; // open in the detail panel
  checked: boolean; // bulk selection
  cursor: boolean; // keyboard cursor
  fresh: boolean;
  alsoSeen?: AlsoSeenChip | null;
  onOpen: (id: string) => void;
  onCheck: (id: string, value: boolean) => void;
};

/** One calm line: title, where from + how long ago, budget and ONE tag. Numbers and extras are in the tooltip and the detail panel. */
function LeadRowImpl({ lead, now, outreach, selected, checked, cursor, fresh, alsoSeen, onOpen, onCheck }: RowProps) {
  const budget = budgetLabel(lead);
  const chip = outreachChip(outreach);
  const when = displayDate(lead);

  return (
    <li
      id={`lead-${lead.id}`}
      data-lead-id={lead.id}
      title={leadHint(lead, alsoSeen)}
      className={cx(
        'group relative flex items-stretch border-b border-border last:border-b-0',
        selected ? 'bg-primary-soft' : checked ? 'bg-primary-soft/50' : 'hover:bg-surface-2/60',
        lead.status === 'Ignored' && 'opacity-70',
        fresh && 'row-new',
        cursor && 'outline outline-2 -outline-offset-2 outline-primary/60',
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden="true" />}
      <div className="flex shrink-0 items-center pl-2">
        <Checkbox checked={checked} onChange={(v) => onCheck(lead.id, v)} label={<span className="sr-only">Select {lead.title}</span>} className="p-2 coarse:p-3.5" />
      </div>
      <button type="button" onClick={() => onOpen(lead.id)} aria-current={selected ? 'true' : undefined} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-1 pr-4 text-left">
        <StatusDot status={lead.status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-fg">{lead.title}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-x-1.5 text-[13px] text-fg-subtle">
            <span className="truncate">{lead.source}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={when} className="shrink-0">
              {timeAgo(when, now)}
            </time>
            {chip && (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0 text-fg-muted">{chip.label}</span>
              </>
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          {budget && <span className="font-num max-w-[11rem] whitespace-nowrap text-sm font-medium text-fg-muted">{budget}</span>}
          {fresh ? <Badge tone="primary" className="shrink-0">New</Badge> : <MatchTagBadge lead={lead} alsoSeen={alsoSeen} />}
        </span>
      </button>
    </li>
  );
}

export default memo(LeadRowImpl);
