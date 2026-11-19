import type { Lead, Status } from '@/lib/types';
import { budgetLabel, isFlagged } from '@/lib/format';
import { Badge, cx } from '@/components/ui';
import { chipLabel, type AlsoSeenChip } from '@/lib/lead-identity';
import { learnedShare } from '@/lib/rank';

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
  const base = lead.fit_reasons.length > 0 ? lead.fit_reasons.join('. ') : 'How well this lead matches what you offer';
  const why = lead.learned_score !== null && learnedShare(lead) > 0 ? `${base}. Learned from your results: ${lead.learned_score} out of 100` : base;
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

/** Small chip when the same person or ad was found on other sources. Nothing is hidden: it is a hint. */
export function AlsoSeenBadge({ chip, className }: { chip: AlsoSeenChip; className?: string }) {
  const title =
    chip.count > 0
      ? `The same ${chip.sources > 0 ? 'person or ad' : 'ad'} was found ${chip.count} other time${chip.count === 1 ? '' : 's'}. Open the lead to see where.`
      : 'This looks like another lead you have. Open it to confirm or split.';
  return (
    <Badge tone={chip.count > 0 ? 'info' : 'neutral'} title={title} className={className}>
      {chipLabel(chip)}
    </Badge>
  );
}

export type MatchTag = { label: 'Strong match' | 'Good match' | 'Check first' | 'Be careful'; tone: 'primary' | 'info' | 'warning' | 'danger' };

/** The ONE plain status tag for a lead (glossary: Strong / Good match, Check first, Be careful). Weak, unscored leads show none. */
export function matchTag(lead: Lead): MatchTag | null {
  if (isFlagged(lead)) return { label: 'Be careful', tone: 'danger' };
  const fit = lead.fit_score;
  if (lead.trust_level === 'Medium' && (fit === null || fit < 70)) return { label: 'Check first', tone: 'warning' };
  if (fit !== null && fit >= 70) return { label: 'Strong match', tone: 'primary' };
  if (fit !== null && fit >= 45) return { label: 'Good match', tone: 'info' };
  return null;
}

const TRUST_WORDS: Record<string, string> = { High: 'Looks real', Medium: 'Check first', Low: 'Be careful' };

/** Plain text for the hover tooltip: the numbers and extras that no longer sit on the row. */
export function leadHint(lead: Lead, alsoSeen?: AlsoSeenChip | null): string {
  const parts: string[] = [];
  if (lead.fit_score !== null) parts.push(`Fit ${lead.fit_score}/100`);
  if (lead.trust_level) parts.push(`${TRUST_WORDS[lead.trust_level] ?? lead.trust_level}${lead.trust_score != null ? ` (${lead.trust_score}/100)` : ''}`);
  if (lead.category) parts.push(`Type: ${lead.category}`);
  if (lead.best_email) parts.push(`Email found: ${lead.best_email}`);
  if (alsoSeen) parts.push(`Also seen: ${chipLabel(alsoSeen)}`);
  if (lead.fit_reasons.length > 0) parts.push(lead.fit_reasons.slice(0, 3).join('. '));
  if (lead.flags.length > 0) parts.push(`Warning: ${lead.flags.slice(0, 2).join('; ')}`);
  return parts.join(' | ') || 'Not scored yet';
}

export function MatchTagBadge({ lead, alsoSeen, className }: { lead: Lead; alsoSeen?: AlsoSeenChip | null; className?: string }) {
  const t = matchTag(lead);
  if (!t) return null;
  return (
    <Badge tone={t.tone} title={leadHint(lead, alsoSeen)} className={cx('shrink-0 whitespace-nowrap', className)}>
      {t.label}
    </Badge>
  );
}

/** One short sentence for the top of the detail panel. */
export function leadSummary(lead: Lead): string {
  const tag = matchTag(lead);
  const budget = budgetLabel(lead);
  const first =
    tag?.label === 'Be careful'
      ? 'Be careful: this one has warning signs. Check who posted it before you reply.'
      : tag?.label === 'Check first'
        ? 'Worth a quick check on who posted it before you reply.'
        : tag?.label === 'Strong match'
          ? 'A strong match for what you offer.'
          : tag?.label === 'Good match'
            ? 'A good match for what you offer.'
            : 'Not scored as a strong match.';
  return `${first} ${budget ? `Budget ${budget}.` : 'No budget stated.'}`;
}
