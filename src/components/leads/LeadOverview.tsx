"use client";

import { useState } from 'react';
import type { Lead, OutreachRow } from '@/lib/types';
import { budgetLabel, displayDate, fmtDateTime, isFlagged, itemLabel, splitContact, timeAgo } from '@/lib/format';
import { outreachChip } from '@/lib/outreach';
import { Badge, CategoryChip, ProgressBar, TrustBadge, cx } from '@/components/ui';
import { AlertIcon, SparkIcon, UserIcon } from '@/components/Icons';
import CopyChip from '@/components/CopyChip';
import { FitBadge, SectionTitle } from './LeadBits';
import LeadWhyRank from './LeadWhyRank';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

export default function LeadOverview({ lead, rows, now }: { lead: Lead; rows: OutreachRow[]; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const flagged = isFlagged(lead);
  const budget = budgetLabel(lead);
  const contacts = splitContact(lead.contact);
  const when = displayDate(lead);
  const description = lead.description ?? '';
  const long = description.length > 600;
  const chip = outreachChip(rows);
  const trustTone = lead.trust_level === 'High' ? 'success' : lead.trust_level === 'Medium' ? 'warning' : 'danger';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {lead.category && <CategoryChip category={lead.category} />}
        <Badge tone="info" title="Where this lead was found">
          {lead.source}
          {lead.source_detail ? ` · ${lead.source_detail}` : ''}
        </Badge>
        <Badge>{lead.type}</Badge>
        {chip && <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', chip.tone)}>{chip.label}</span>}
        {lead.item_type && <Badge>{itemLabel(lead.item_type)}</Badge>}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-fg-subtle">Budget</p>
          <p className={cx('font-num text-lg font-semibold', budget ? 'text-success' : 'text-fg-subtle')}>{budget ?? 'Not stated'}</p>
        </div>
        <div>
          <p className="text-xs text-fg-subtle">Posted by</p>
          <p className="flex items-center gap-1 text-sm font-medium text-fg">
            <UserIcon className="h-3.5 w-3.5 text-fg-subtle" aria-hidden="true" />
            <span className="break-all">{lead.author ?? 'Unknown'}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-fg-subtle">Found</p>
          <p className="text-sm text-fg" title={new Date(when).toLocaleString()}>
            {timeAgo(when, now)}
          </p>
        </div>
      </div>
      {lead.author_info && <p className="-mt-3 break-words text-sm text-fg-muted">{lead.author_info}</p>}

      {flagged && (
        <div role="alert" className="rounded-card border border-danger-border bg-danger-soft px-3.5 py-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <AlertIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            Check this lead before replying
          </p>
          {lead.flags.length > 0 ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-9 text-fg">
              {lead.flags.map((flag) => (
                <li key={flag} className="break-words">
                  {flag}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 pl-6 text-fg">The trust score is low. Verify who posted it first.</p>
          )}
        </div>
      )}

      <section aria-label="Description">
        <SectionTitle>What they wrote</SectionTitle>
        {description ? (
          <>
            <p className={cx('mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg', !expanded && long && 'line-clamp-[12]')}>{description}</p>
            {long && (
              <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="mt-1 rounded text-sm font-medium text-primary-text hover:underline">
                {expanded ? 'Show less' : 'Show the whole post'}
              </button>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-sm italic text-fg-subtle">No description provided.</p>
        )}
      </section>

      {lead.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {lead.tags.map((tag) => (
            <li key={tag} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-muted ring-1 ring-inset ring-border">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {contacts.length > 0 && (
        <section aria-label="Contact details">
          <SectionTitle>Contact</SectionTitle>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {contacts.map((item) => (
              <CopyChip key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Why this lead scored the way it did" className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-surface-2/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Match</SectionTitle>
            <FitBadge lead={lead} />
          </div>
          {lead.fit_score === null ? (
            <p className="mt-2 text-sm text-fg-subtle">Not scored yet.</p>
          ) : (
            <>
              <ProgressBar value={lead.fit_score} label="Match score" className="mt-2" tone={lead.fit_score >= 70 ? 'primary' : 'warning'} />
              {lead.fit_reasons.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-fg-muted">
                  {lead.fit_reasons.map((r) => (
                    <li key={r} className="flex gap-1.5 break-words">
                      <SparkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-text" aria-hidden="true" />
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-fg-subtle">How well this fits what you offer.</p>
              )}
            </>
          )}
        </div>
        <div className="rounded-card border border-border bg-surface-2/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Trust</SectionTitle>
            <TrustBadge level={lead.trust_level} score={lead.trust_score} />
          </div>
          {lead.trust_score === null ? (
            <p className="mt-2 text-sm text-fg-subtle">Not scored yet.</p>
          ) : (
            <>
              <ProgressBar value={lead.trust_score} label="Trust score" className="mt-2" tone={trustTone} />
              <p className="mt-2 text-sm text-fg-muted">
                {lead.flags.length > 0 ? `${lead.flags.length} warning sign${lead.flags.length === 1 ? '' : 's'} found (see above).` : 'No warning signs found.'}
              </p>
            </>
          )}
        </div>
      </section>

      <LeadWhyRank lead={lead} />

      <section aria-label="Timeline">
        <SectionTitle>Dates</SectionTitle>
        <dl className="mt-1.5 grid grid-cols-2 gap-3">
          <Fact label="Added">{fmtDateTime(lead.created_at)}</Fact>
          {lead.posted_at && <Fact label="Posted">{fmtDateTime(lead.posted_at)}</Fact>}
          {lead.pitched_at && <Fact label="Pitched">{fmtDateTime(lead.pitched_at)}</Fact>}
          {lead.replied_at && <Fact label="Replied">{fmtDateTime(lead.replied_at)}</Fact>}
          {lead.outcome_note && <Fact label="Outcome note">{lead.outcome_note}</Fact>}
        </dl>
      </section>
    </div>
  );
}
