import { cx } from '@/components/ui';
import { ExternalIcon } from '@/components/Icons';
import { EMAIL_STATUS_INFO } from '@/lib/format';
import { OUTREACH_STATE_LABEL, type OutreachState } from '@/lib/contacts-data';

export function EmailChip({ status }: { status: keyof typeof EMAIL_STATUS_INFO | null }) {
  if (!status) return null;
  const info = EMAIL_STATUS_INFO[status];
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', info.tone)}>{info.label}</span>;
}

const OUTREACH_TONE: Record<OutreachState, string> = {
  replied: 'bg-success-soft text-success ring-success-border',
  sent: 'bg-info-soft text-info ring-info-border',
  scheduled: 'bg-primary-soft text-primary-text ring-primary-border',
  draft: 'bg-warning-soft text-warning ring-warning-border',
  failed: 'bg-danger-soft text-danger ring-danger-border',
  none: 'bg-surface-2 text-fg-muted ring-border',
};
export function OutreachChip({ state }: { state: OutreachState }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', OUTREACH_TONE[state])}>{OUTREACH_STATE_LABEL[state]}</span>;
}

export function SocialLinks({ socials, dash }: { socials: Record<string, string>; dash?: boolean }) {
  const entries = Object.entries(socials).filter(([, u]) => /^https?:\/\//i.test(u));
  if (!entries.length) return dash ? <span className="text-fg-subtle" aria-label="None">&mdash;</span> : <span className="text-fg-subtle">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([name, url]) => (
        <a key={name} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex min-h-6 items-center gap-1 rounded-md bg-surface-2 px-1.5 text-xs capitalize text-fg-muted ring-1 ring-inset ring-border hover:text-fg coarse:min-h-9">
          {name}
          <ExternalIcon className="h-3 w-3" />
        </a>
      ))}
    </span>
  );
}

