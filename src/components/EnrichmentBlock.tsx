"use client";

import { useState } from 'react';
import type { Lead } from '@/lib/types';
import { EMAIL_STATUS_INFO, hostOf, isHttpUrl, timeAgo } from '@/lib/format';
import CopyChip from './CopyChip';
import { ChevronIcon, ExternalIcon, GlobeIcon, PhoneIcon, RefreshIcon, UserIcon } from './Icons';
import { Spinner, btnPrimary, btnSecondary, pill } from './ui';

const KIND_NOTE: Record<string, string> = {
  provided: 'from the post',
  personal: 'found on their site',
  role: 'found on their site',
  guessed: 'guessed from their name',
};

function Chip({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'plain'; children: React.ReactNode }) {
  const tones = {
    good: 'bg-success-soft text-success ring-success-border',
    warn: 'bg-warning-soft text-warning ring-warning-border',
    bad: 'bg-danger-soft text-danger ring-danger-border',
    plain: 'bg-surface-2 text-fg-muted ring-border',
  } as const;
  return <span className={`${pill} ${tones[tone]}`}>{children}</span>;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function EnrichmentBlock({
  lead,
  busy,
  onEnrich,
  now,
  defaultOpen = false,
}: {
  lead: Lead;
  busy: boolean;
  onEnrich: () => void;
  now: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sig = lead.site_signals;
  const socials = Object.entries(lead.socials);
  const year = new Date(now).getFullYear();
  const hasSignals = Object.keys(sig).length > 0;
  const hasData =
    !!lead.website ||
    !!lead.company_name ||
    !!lead.owner_name ||
    lead.emails.length > 0 ||
    lead.phones.length > 0 ||
    socials.length > 0 ||
    !!lead.opportunity ||
    hasSignals;
  const working = busy || lead.enrich_status === 'pending' || lead.enrich_status === 'running';

  if (!hasData && !working && lead.enrich_status !== 'failed') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border-strong p-4 text-sm text-fg-subtle">
        <span>No company details yet. Enrich this lead and I will look up their website, owner, email addresses and phone numbers.</span>
        <button type="button" onClick={onEnrich} className={`${btnPrimary}`}>
          <RefreshIcon className="h-4 w-4" />
          Enrich now
        </button>
      </div>
    );
  }

  const best = lead.best_email
    ? lead.emails.find((e) => e.email.toLowerCase() === lead.best_email?.toLowerCase())
    : undefined;

  return (
    <section aria-label="About this business" className="rounded-card border border-border bg-surface-2/60 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">About this business</h3>
        {working ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle" role="status">
            <Spinner className="h-3.5 w-3.5" />
            Checking their website…
          </span>
        ) : lead.enrich_status === 'failed' ? (
          <Chip tone="bad">Check failed</Chip>
        ) : lead.enriched_at ? (
          <span className="text-xs text-fg-subtle">checked {timeAgo(lead.enriched_at, now)}</span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onEnrich}
            disabled={working}
            className={`${btnSecondary} min-h-8 px-2.5 py-1 text-xs`}
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            Enrich now
          </button>
          {hasData && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-fg-muted hover:bg-surface-2"
            >
              {open ? 'Less' : 'Details'}
              <ChevronIcon className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </span>
      </div>

      {lead.enrich_status === 'failed' && lead.enrich_error && (
        <p className="mt-2 break-words text-sm text-danger">{lead.enrich_error}</p>
      )}

      {hasData && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
          {lead.website && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <GlobeIcon className="h-4 w-4 shrink-0 text-fg-subtle" />
              {isHttpUrl(lead.website) ? (
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-primary-text hover:underline">
                  {hostOf(lead.website)}
                </a>
              ) : (
                <span className="truncate">{lead.website}</span>
              )}
              <ExternalIcon className="h-3 w-3 shrink-0 text-fg-subtle" />
            </span>
          )}
          {lead.company_name && <span className="min-w-0 break-words font-medium">{lead.company_name}</span>}
          {lead.owner_name && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <UserIcon className="h-4 w-4 shrink-0 text-fg-subtle" />
              <span className="break-words">
                {lead.owner_name}
                {lead.owner_title && <span className="text-fg-subtle">, {lead.owner_title}</span>}
              </span>
            </span>
          )}
          {lead.best_email && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <CopyChip label="Email" value={lead.best_email} />
              {best && <Chip tone={best.status === 'valid' ? 'good' : EMAIL_STATUS_INFO[best.status].usable ? 'warn' : 'bad'}>{EMAIL_STATUS_INFO[best.status].label}</Chip>}
              {!best && lead.best_email_status && (
                <Chip tone={lead.best_email_status === 'valid' ? 'good' : EMAIL_STATUS_INFO[lead.best_email_status].usable ? 'warn' : 'bad'}>
                  {EMAIL_STATUS_INFO[lead.best_email_status].label}
                </Chip>
              )}
            </span>
          )}
        </div>
      )}

      {lead.opportunity && (
        <p className="mt-2 rounded-md border border-primary-border bg-primary-soft px-3 py-2 text-sm text-primary-text">
          <span className="font-semibold">Where you can help: </span>
          {lead.opportunity}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
          {lead.emails.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Email addresses</p>
              <ul className="space-y-1.5">
                {lead.emails.map((e) => {
                  const info = EMAIL_STATUS_INFO[e.status];
                  return (
                    <li key={e.email} className="flex flex-wrap items-center gap-2">
                      <CopyChip label={null} value={e.email} />
                      <Chip tone={e.status === 'valid' ? 'good' : info.usable ? 'warn' : 'bad'}>{info.label}</Chip>
                      {e.kind && <span className="text-xs text-fg-subtle">{KIND_NOTE[e.kind] ?? e.kind}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {lead.phones.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <PhoneIcon className="h-4 w-4 text-fg-subtle" />
              {lead.phones.map((p) => (
                <CopyChip key={p} label={null} value={p} />
              ))}
            </div>
          )}

          {socials.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Profiles</span>
              {socials.map(([name, url]) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2/60 px-2 py-1 text-xs font-medium text-primary-text hover:bg-primary-soft"
                >
                  {titleCase(name)}
                  <ExternalIcon className="h-3 w-3" />
                </a>
              ))}
            </div>
          )}

          {hasSignals && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Their website</p>
              <div className="flex flex-wrap gap-1.5">
                {sig.reachable === false && <Chip tone="bad">Site did not load</Chip>}
                {sig.platform && <Chip tone="plain">Built with {sig.platform}</Chip>}
                {sig.https === true && <Chip tone="good">Secure (HTTPS)</Chip>}
                {sig.https === false && <Chip tone="bad">Not secure</Chip>}
                {sig.mobile_viewport === true && <Chip tone="good">Works on phones</Chip>}
                {sig.mobile_viewport === false && <Chip tone="bad">Not made for phones</Chip>}
                {sig.copyright_year !== undefined && (
                  <Chip tone={sig.copyright_year < year - 2 ? 'warn' : 'plain'}>
                    © {sig.copyright_year}
                    {sig.copyright_year < year - 2 ? ' (looks old)' : ''}
                  </Chip>
                )}
                {sig.has_contact_form === true && <Chip tone="plain">Has a contact form</Chip>}
                {sig.has_contact_form === false && <Chip tone="warn">No contact form</Chip>}
                {sig.has_blog === true && <Chip tone="plain">Has a blog</Chip>}
                {sig.load_ms !== undefined && (
                  <Chip tone={sig.load_ms > 3000 ? 'warn' : 'plain'}>{(sig.load_ms / 1000).toFixed(1)}s to load</Chip>
                )}
              </div>
              {sig.title && <p className="mt-2 break-words text-fg-muted">{sig.title}</p>}
              {sig.description && <p className="mt-1 break-words text-xs text-fg-subtle">{sig.description}</p>}
              {sig.issues && sig.issues.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-fg-muted">
                  {sig.issues.map((issue) => (
                    <li key={issue} className="break-words">
                      {issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
