"use client";

import { memo } from 'react';
import type { Lead, OutreachRow } from '@/lib/types';
import { budgetLabel, displayDate, timeAgo } from '@/lib/format';
import { outreachChip } from '@/lib/outreach';
import { Checkbox, cx } from '@/components/ui';
import type { AlsoSeenChip } from '@/lib/lead-identity';
import { MatchTagBadge, StatusDot, leadHint } from './LeadBits';

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
  const budget = budgetLabel(lead);
  const chip = outreachChip(outreach);
  const when = displayDate(lead);

  return (
    <li
      id={`lead-${lead.id}`}
      data-lead-id={lead.id}
      title={leadHint(lead, alsoSeen)}
      className={cx(
        'glass lift relative flex flex-col rounded-card',
        selected && 'ring-2 ring-primary',
        lead.status === 'Ignored' && 'opacity-70',
        fresh && 'row-new',
        cursor && 'outline outline-2 outline-offset-2 outline-primary/60',
      )}
    >
      <div className="absolute right-1 top-1 z-10">
        <Checkbox checked={checked} onChange={(v) => onCheck(lead.id, v)} label={<span className="sr-only">Select {lead.title}</span>} className="p-2 coarse:p-3.5" />
      </div>
      <button type="button" onClick={() => onOpen(lead.id)} aria-current={selected ? 'true' : undefined} className="flex flex-1 flex-col gap-2 rounded-card p-4 pr-11 text-left">
        <span className="flex items-center gap-2">
          <StatusDot status={lead.status} />
          <MatchTagBadge lead={lead} alsoSeen={alsoSeen} />
        </span>
        <span className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-fg">{lead.title}</span>
        <span className="line-clamp-2 break-words text-sm leading-relaxed text-fg-muted">{lead.description || 'No description provided.'}</span>
        <span className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5 text-[13px] text-fg-subtle">
          <span className="min-w-0 truncate">
            {lead.source} · <time dateTime={when}>{timeAgo(when, now)}</time>
            {chip ? ` · ${chip.label}` : ''}
          </span>
          {budget && <span className="font-num max-w-[7rem] shrink-0 truncate text-sm font-medium text-fg-muted">{budget}</span>}
        </span>
      </button>
    </li>
  );
}

export default memo(LeadGridCardImpl);
