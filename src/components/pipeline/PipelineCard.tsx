"use client";

import { memo } from 'react';
import { Badge, cx } from '@/components/ui';
import { budgetLabel, displayDate, timeAgo } from '@/lib/format';
import type { Lead, Status } from '@/lib/types';
import { OUTREACH_LABEL } from '@/lib/pipeline-data';
import { matchTag, leadHint } from '@/components/leads/LeadBits';
import { MoveMenu } from './MoveMenu';

/** Calm card: title, where from, ONE tag and the amount. Everything else opens on click. */
export const PipelineCard = memo(function PipelineCard({
  lead,
  outreach,
  dragging,
  showIgnored,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  lead: Lead;
  outreach: string | undefined;
  dragging: boolean;
  showIgnored: boolean;
  onOpen: (lead: Lead) => void;
  onMove: (lead: Lead, to: Status) => void;
  onDragStart: (lead: Lead) => void;
  onDragEnd: () => void;
}) {
  const budget = budgetLabel(lead);
  const isTrade = lead.lead_kind === 'trade';
  const tag = isTrade ? null : matchTag(lead);
  const extra = outreach && OUTREACH_LABEL[outreach] ? ` | ${OUTREACH_LABEL[outreach]}` : '';
  return (
    <li
      draggable
      title={leadHint(lead) + extra}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(lead);
      }}
      onDragEnd={onDragEnd}
      className={cx(
        'group cursor-grab rounded-card border border-border bg-surface p-3.5 shadow-sm transition-[box-shadow,opacity,border-color] duration-fast hover:border-border-strong hover:shadow-md active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <button type="button" onClick={() => onOpen(lead)} className="ctl block w-full cursor-pointer rounded-ctl text-left text-sm font-medium leading-snug text-fg hover:text-primary-text">
        <span className="line-clamp-2 break-words">{lead.title}</span>
      </button>
      <p className="mt-1 truncate text-[13px] text-fg-subtle">
        {isTrade && lead.trade_side ? `${lead.trade_side === 'buyer' ? 'Buyer' : 'Seller'} · ` : ''}
        {lead.source} · {timeAgo(displayDate(lead))}
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {tag && (
            <Badge tone={tag.tone} className="whitespace-nowrap">
              {tag.label}
            </Badge>
          )}
          {budget && <span className="font-num truncate text-[13px] font-medium text-fg-muted">{budget}</span>}
        </div>
        <MoveMenu current={lead.status} title={lead.title} showIgnored={showIgnored} onMove={(to) => onMove(lead, to)} />
      </div>
    </li>
  );
});
