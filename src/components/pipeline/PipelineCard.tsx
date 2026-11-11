"use client";

import { memo } from 'react';
import { Badge, CategoryChip, cx } from '@/components/ui';
import { budgetLabel, displayDate, timeAgo } from '@/lib/format';
import type { Lead, Status } from '@/lib/types';
import { OUTREACH_LABEL } from '@/lib/pipeline-data';
import { MoveMenu } from './MoveMenu';

function fitTone(score: number | null): 'success' | 'warning' | 'neutral' {
  if (score == null) return 'neutral';
  return score >= 70 ? 'success' : score >= 45 ? 'warning' : 'neutral';
}

function trustText(lead: Lead): string | null {
  if (lead.trust_score == null) return null;
  return `Trust ${lead.trust_score}`;
}

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
  const trust = trustText(lead);
  const isTrade = lead.lead_kind === 'trade';
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(lead);
      }}
      onDragEnd={onDragEnd}
      className={cx(
        'group cursor-grab rounded-card border border-border bg-surface p-3 shadow-sm transition-[box-shadow,opacity,border-color] duration-fast hover:border-border-strong hover:shadow-md active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(lead)}
        className="ctl block w-full cursor-pointer rounded-ctl text-left text-sm font-medium leading-snug text-fg hover:text-primary-text"
      >
        <span className="line-clamp-2 break-words">{lead.title}</span>
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={isTrade ? 'accent' : 'neutral'} title={lead.source_detail ?? lead.source}>
          {lead.source}
        </Badge>
        {!isTrade && lead.category && <CategoryChip category={lead.category} />}
        {isTrade && lead.trade_side && <Badge tone="accent">{lead.trade_side === 'buyer' ? 'Buyer' : 'Seller'}</Badge>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {lead.fit_score != null && (
          <Badge tone={fitTone(lead.fit_score)} title="How well this matches what you do">
            Fit <span className="font-num">{lead.fit_score}</span>
          </Badge>
        )}
        {trust && <span className="font-num text-fg-muted">{trust}</span>}
        {budget && <span className="font-num font-medium text-fg">{budget}</span>}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-fg-subtle">
          <span>{timeAgo(displayDate(lead))}</span>
          {outreach && OUTREACH_LABEL[outreach] && <span className="block truncate text-fg-muted">{OUTREACH_LABEL[outreach]}</span>}
        </div>
        <MoveMenu current={lead.status} title={lead.title} showIgnored={showIgnored} onMove={(to) => onMove(lead, to)} />
      </div>
    </li>
  );
});
