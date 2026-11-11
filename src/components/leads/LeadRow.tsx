"use client";

import { memo } from 'react';
import type { Lead, OutreachRow } from '@/lib/types';
import { budgetLabel, displayDate, isFlagged, timeAgo } from '@/lib/format';
import { outreachChip } from '@/lib/outreach';
import { Badge, CategoryChip, Checkbox, TrustBadge, cx } from '@/components/ui';
import { AlertIcon, MailIcon } from '@/components/Icons';
import type { AlsoSeenChip } from '@/lib/lead-identity';
import { AlsoSeenBadge, FitBadge, StatusDot } from './LeadBits';

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

function LeadRowImpl({ lead, now, outreach, selected, checked, cursor, fresh, alsoSeen, onOpen, onCheck }: RowProps) {
  const flagged = isFlagged(lead);
  const budget = budgetLabel(lead);
  const chip = outreachChip(outreach);
  const when = displayDate(lead);

  return (
    <li
      id={`lead-${lead.id}`}
      data-lead-id={lead.id}
      className={cx(
        'group relative flex items-stretch border-b border-border last:border-b-0',
        selected ? 'bg-primary-soft' : checked ? 'bg-primary-soft/50' : 'hover:bg-surface-2/60',
        lead.status === 'Ignored' && 'opacity-70',
        fresh && 'row-new',
        cursor && 'outline outline-2 -outline-offset-2 outline-primary/60',
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden="true" />}
      <div className="flex shrink-0 items-start pl-2 pt-1.5 coarse:pt-0.5">
        <Checkbox
          checked={checked}
          onChange={(v) => onCheck(lead.id, v)}
          label={<span className="sr-only">Select {lead.title}</span>}
          className="p-2 coarse:p-3.5"
        />
      </div>
      <button
        type="button"
        onClick={() => onOpen(lead.id)}
        aria-current={selected ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-start gap-3 py-2.5 pl-1 pr-3 text-left"
      >
        <span className="mt-1.5">
          <StatusDot status={lead.status} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium text-fg">{lead.title}</span>
            {flagged && (
              <span className="shrink-0 text-danger" title="Check this lead before replying">
                <AlertIcon className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Needs checking</span>
              </span>
            )}
            {fresh && <Badge tone="primary" className="shrink-0">New</Badge>}
            {alsoSeen && <AlsoSeenBadge chip={alsoSeen} className="shrink-0" />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
            <span className="truncate">
              {lead.source}
              {lead.source_detail ? ` · ${lead.source_detail}` : ''}
            </span>
            {lead.author && <span className="max-w-[10rem] truncate">{lead.author}</span>}
            <time dateTime={when}>{timeAgo(when, now)}</time>
            {lead.best_email && (
              <span className="inline-flex items-center gap-1 text-success" title={`Email found: ${lead.best_email}`}>
                <MailIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Email found</span>
              </span>
            )}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
            <FitBadge lead={lead} />
            <TrustBadge level={lead.trust_level} score={lead.trust_score} />
            {budget && <span className="font-num text-xs font-medium text-success">{budget}</span>}
          </span>
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          <span className="flex items-center gap-1.5">
            {lead.category && <CategoryChip category={lead.category} />}
            {chip && <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', chip.tone)}>{chip.label}</span>}
          </span>
          <span className="flex items-center gap-1.5">
            {budget && <span className="font-num mr-1 text-[13px] font-medium text-success">{budget}</span>}
            <FitBadge lead={lead} />
            <TrustBadge level={lead.trust_level} score={lead.trust_score} />
          </span>
        </span>
      </button>
    </li>
  );
}

export default memo(LeadRowImpl);
