"use client";

import { useMemo, useState } from 'react';
import type { Lead, OutreachRow } from '@/lib/types';
import type { LeadLink } from '@/lib/types-intel';
import { buildTimeline, type LeadGroupInfo, type LinkView } from '@/lib/lead-identity';
import { fmtDateTime, isHttpUrl, timeAgo } from '@/lib/format';
import type { ToastItem } from '@/components/ui';
import { Badge, Button, cx } from '@/components/ui';
import { AlertIcon, CheckIcon, ExternalIcon } from '@/components/Icons';
import { SectionTitle } from './LeadBits';

type Decide = (link: LeadLink, state: 'confirmed' | 'split' | 'auto' | 'suspected') => Promise<string | null>;

function reasonText(reasons: string[]): string {
  const text = reasons.filter((r) => !/^but a different/.test(r)).join(', ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Looks like the same post';
}

function MatchRow({ view, other, now, busy, onConfirm, onSplit }: { view: LinkView; other: Lead | undefined; now: number; busy: boolean; onConfirm?: () => void; onSplit: () => void }) {
  const { link } = view;
  const confirmed = link.state === 'confirmed';
  return (
    <li className="rounded-card border border-border bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone="info">{other?.source ?? 'Another source'}</Badge>
        {other?.source_detail && <span className="text-xs text-fg-subtle">{other.source_detail}</span>}
        {other && <span className="text-xs text-fg-subtle">{timeAgo(other.posted_at ?? other.created_at, now)}</span>}
        {confirmed && <Badge tone="success" icon={<CheckIcon className="h-3 w-3" aria-hidden="true" />}>Confirmed</Badge>}
        {link.state === 'suspected' && <Badge tone="warning">Possible match</Badge>}
      </div>
      <p className="mt-1.5 break-words text-sm font-medium text-fg">{other?.title ?? 'This lead is not loaded in the list'}</p>
      <p className="mt-0.5 break-words text-xs text-fg-subtle">{reasonText(link.reasons)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {other && isHttpUrl(other.url) && (
          <a
            href={other.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn inline-flex min-h-8 items-center gap-1.5 rounded-ctl border border-border-strong bg-surface px-2.5 text-[13px] font-medium text-fg hover:bg-surface-2 coarse:min-h-11"
          >
            Open on {other.source}
            <ExternalIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
        {onConfirm && (
          <Button size="sm" variant="primary" onClick={onConfirm} disabled={busy}>
            Confirm same
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onSplit} disabled={busy} className="hover:!bg-danger-soft hover:!text-danger">
          {link.state === 'suspected' ? 'Not the same' : 'Split'}
        </Button>
      </div>
    </li>
  );
}

export default function LeadAlsoSeen({
  lead,
  info,
  leadsById,
  outreachByLead,
  now,
  decide,
  pushToast,
}: {
  lead: Lead;
  info: LeadGroupInfo | undefined;
  leadsById: Map<string, Lead>;
  outreachByLead: Map<string, OutreachRow[]>;
  now: number;
  decide: Decide;
  pushToast: (kind: ToastItem['kind'], message: string, action?: { label: string; onClick: () => void }) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [allTime, setAllTime] = useState(false);
  const same = info?.same ?? [];
  const suspected = info?.suspected ?? [];
  const blast = info?.blast ?? [];

  const members = useMemo(() => {
    const list: Lead[] = [lead];
    for (const v of same) {
      const o = leadsById.get(v.otherId);
      if (o) list.push(o);
    }
    return list;
  }, [lead, same, leadsById]);
  const timeline = useMemo(() => buildTimeline(members, lead.id, outreachByLead), [members, lead.id, outreachByLead]);

  if (same.length === 0 && suspected.length === 0 && blast.length === 0) return null;

  const act = async (view: LinkView, state: 'confirmed' | 'split') => {
    setBusy(view.link.id);
    const prev = view.link.state;
    const err = await decide(view.link, state);
    setBusy(null);
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return;
    }
    if (state === 'split') pushToast('info', 'Split. These two are treated as different leads.', { label: 'Undo', onClick: () => void decide(view.link, prev) });
    else pushToast('success', 'Confirmed. They stay together.');
  };

  const shownTimeline = allTime ? timeline : timeline.slice(0, 5);

  return (
    <section aria-label="Also seen on" className="space-y-3">
      {(same.length > 0 || suspected.length > 0) && (
        <div className="rounded-card border border-primary-border bg-primary-soft/40 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Also seen on</SectionTitle>
            <span className="text-xs text-fg-subtle">{same.length > 0 ? `${same.length} other ${same.length === 1 ? 'post' : 'posts'}` : 'Needs your check'}</span>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {same.length > 0
              ? 'The same person or ad was found in more than one place. Nothing was deleted: split any match that is wrong.'
              : 'These look similar but are not certain. Confirm or split each one.'}
          </p>
          {same.length > 0 && (
            <ul className="mt-2.5 space-y-2">
              {same.map((v) => (
                <MatchRow
                  key={v.link.id}
                  view={v}
                  other={leadsById.get(v.otherId)}
                  now={now}
                  busy={busy === v.link.id}
                  onConfirm={v.link.state === 'auto' ? () => void act(v, 'confirmed') : undefined}
                  onSplit={() => void act(v, 'split')}
                />
              ))}
            </ul>
          )}
          {suspected.length > 0 && (
            <ul className={cx('space-y-2', same.length > 0 ? 'mt-3 border-t border-border pt-3' : 'mt-2.5')}>
              {suspected.map((v) => (
                <MatchRow
                  key={v.link.id}
                  view={v}
                  other={leadsById.get(v.otherId)}
                  now={now}
                  busy={busy === v.link.id}
                  onConfirm={() => void act(v, 'confirmed')}
                  onSplit={() => void act(v, 'split')}
                />
              ))}
            </ul>
          )}
          {same.length > 0 && timeline.length > 1 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs font-semibold text-fg-subtle">Combined history</p>
              <ol className="mt-1.5 space-y-1.5">
                {shownTimeline.map((e, i) => (
                  <li key={`${e.leadId}-${e.at}-${i}`} className="flex items-baseline gap-2 text-sm">
                    <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', e.current ? 'bg-primary-text' : 'bg-fg-subtle')} aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words text-fg">
                      {e.label}
                      {!e.current && <span className="text-fg-subtle"> (other post)</span>}
                    </span>
                    <time dateTime={e.at} title={fmtDateTime(e.at)} className="shrink-0 text-xs text-fg-subtle">
                      {timeAgo(e.at, now)}
                    </time>
                  </li>
                ))}
              </ol>
              {timeline.length > 5 && (
                <button type="button" onClick={() => setAllTime((v) => !v)} aria-expanded={allTime} className="mt-1.5 rounded text-sm font-medium text-primary-text hover:underline">
                  {allTime ? 'Show fewer' : `Show all ${timeline.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {blast.length > 0 && (
        <div role="note" className="rounded-card border border-warning-border bg-warning-soft px-3.5 py-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <AlertIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            Same text, different contacts
          </p>
          <p className="mt-1 text-fg">
            {blast.length === 1 ? 'Another post has' : `${blast.length} other posts have`} almost the same words but a different contact or account. Copy-pasted posts like this are often spam.
            {blast.length >= 2 ? ' This lead was flagged.' : ''}
          </p>
          <ul className="mt-2 space-y-1">
            {blast.slice(0, 4).map((v) => {
              const o = leadsById.get(v.otherId);
              return (
                <li key={v.link.id} className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                  <Badge>{o?.source ?? 'Another source'}</Badge>
                  <span className="min-w-0 break-words">{o?.author ?? o?.title ?? 'Another lead'}</span>
                  <button type="button" onClick={() => void act(v, 'split')} disabled={busy === v.link.id} className="rounded font-medium text-primary-text hover:underline">
                    Not related
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
