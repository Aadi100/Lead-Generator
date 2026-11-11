import type { Lead, Status } from '@/lib/types';
import { Badge, cx } from '@/components/ui';

export const STATUS_DOT: Record<Status, string> = {
  New: 'bg-info',
  Pitched: 'bg-primary-text',
  Replied: 'bg-accent-text',
  Won: 'bg-success',
  Lost: 'bg-danger',
  Ignored: 'bg-fg-subtle',
};

export const NEXT_STEP: Partial<Record<Status, Status>> = { New: 'Pitched', Pitched: 'Replied', Replied: 'Won' };

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', STATUS_DOT[status], className)} role="img" aria-label={`Status: ${status}`} title={status} />
  );
}

export function fitTone(score: number): 'primary' | 'info' | 'neutral' {
  return score >= 70 ? 'primary' : score >= 45 ? 'info' : 'neutral';
}

/** Match score chip. Reasons are in the tooltip and, for screen readers, in the label. */
export function FitBadge({ lead, className }: { lead: Lead; className?: string }) {
  if (lead.fit_score === null) return null;
  const why = lead.fit_reasons.length > 0 ? lead.fit_reasons.join('. ') : 'How well this lead matches what you offer';
  return (
    <Badge tone={fitTone(lead.fit_score)} title={why} className={className}>
      <span className="sr-only">Match score </span>
      Match <span className="font-num">{lead.fit_score}</span>
    </Badge>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cx('text-xs font-semibold uppercase tracking-wider text-fg-subtle', className)}>{children}</h3>;
}
