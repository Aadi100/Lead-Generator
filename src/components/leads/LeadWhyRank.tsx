"use client";

import Link from 'next/link';
import type { Lead } from '@/lib/types';
import { learnedShare, rankScore } from '@/lib/rank';
import { ProgressBar, cx } from '@/components/ui';
import { SectionTitle } from './LeadBits';

/** "Why this rank": the original fit score, what your own history says, and how they were combined. */
export default function LeadWhyRank({ lead }: { lead: Lead }) {
  const share = learnedShare(lead);
  const rank = rankScore(lead);
  const hasLearned = lead.learned_score !== null && share > 0;

  return (
    <section aria-label="Why this rank" className="rounded-card border border-border bg-surface-2/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Why this rank</SectionTitle>
        {rank !== null && (
          <span className="text-xs text-fg-subtle">
            Best match <span className="font-num font-semibold text-fg">{rank}</span>
          </span>
        )}
      </div>
      <dl className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-fg-subtle">Fit with what you offer</dt>
          <dd className="mt-1">
            <span className="font-num text-base font-semibold text-fg">{lead.fit_score ?? 'Not scored'}</span>
            {lead.fit_score !== null && <ProgressBar value={lead.fit_score} label="Fit score" className="mt-1.5" tone={lead.fit_score >= 70 ? 'primary' : 'warning'} />}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Learned from your results</dt>
          <dd className="mt-1">
            {hasLearned && lead.learned_score !== null ? (
              <>
                <span className="font-num text-base font-semibold text-fg">{lead.learned_score}</span>
                <ProgressBar value={lead.learned_score} label="Learned score" className="mt-1.5" tone={lead.learned_score >= 55 ? 'success' : lead.learned_score >= 40 ? 'primary' : 'warning'} />
              </>
            ) : (
              <span className="text-sm text-fg-subtle">Not enough results yet</span>
            )}
          </dd>
        </div>
      </dl>

      {hasLearned ? (
        <>
          <p className="mt-2.5 text-xs text-fg-subtle">
            The order uses {Math.round((1 - share) * 100)}% fit and {Math.round(share * 100)}% what has worked for you. Your fit score is unchanged.
          </p>
          {lead.learned_reasons.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {lead.learned_reasons.map((r) => (
                <li key={r.text} className="flex gap-2 break-words">
                  <span className={cx('mt-0.5 inline-block w-3 shrink-0 text-center font-semibold', r.effect === 'up' ? 'text-success' : 'text-danger')} aria-hidden="true">
                    {r.effect === 'up' ? '+' : '−'}
                  </span>
                  <span className="text-fg-muted">
                    <span className="sr-only">{r.effect === 'up' ? 'Raises the rank: ' : 'Lowers the rank: '}</span>
                    {r.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">Nothing in this lead stands out from your usual results.</p>
          )}
        </>
      ) : (
        <p className="mt-2.5 text-sm text-fg-muted">
          The order uses the fit score only. After you have a few more replies, wins and ignored leads, it also learns what works for you.{' '}
          <Link href="/analytics#what-wins" className="font-medium text-primary-text hover:underline">
            See progress
          </Link>
        </p>
      )}
    </section>
  );
}
