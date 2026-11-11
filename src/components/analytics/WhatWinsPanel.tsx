"use client";

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useJob } from '@/lib/jobs';
import { fmtDateTime } from '@/lib/format';
import type { OutcomeFeature, OutcomeModelInfo } from '@/lib/types-intel';
import { Button, Card, JobNote, ProgressBar, Skeleton, cx } from '@/components/ui';
import { RefreshIcon } from '@/components/Icons';

function parseModel(v: unknown): OutcomeModelInfo | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const feats = (x: unknown): OutcomeFeature[] =>
    Array.isArray(x)
      ? x
          .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
          .map((f) => ({
            key: String(f.key ?? ''),
            group: String(f.group ?? ''),
            label: String(f.label ?? ''),
            n: Number(f.n) || 0,
            pos: Number(f.pos) || 0,
            neg: Number(f.neg) || 0,
            share: Number(f.share) || 0,
            contrib: Number(f.contrib) || 0,
          }))
      : [];
  return {
    status: o.status === 'ready' ? 'ready' : 'insufficient',
    generated_at: typeof o.generated_at === 'string' ? o.generated_at : null,
    note: typeof o.note === 'string' ? o.note : null,
    examples: Number(o.examples) || 0,
    positives: Number(o.positives) || 0,
    negatives: Number(o.negatives) || 0,
    base_rate: typeof o.base_rate === 'number' ? o.base_rate : null,
    weight: Number(o.weight) || 0,
    min_examples: Number(o.min_examples) || 20,
    top_positive: feats(o.top_positive),
    top_negative: feats(o.top_negative),
  };
}

function SignalList({ title, items, tone, base }: { title: string; items: OutcomeFeature[]; tone: 'success' | 'danger'; base: number | null }) {
  return (
    <div className="min-w-0">
      <h3 className={cx('text-xs font-semibold uppercase tracking-wide', tone === 'success' ? 'text-success' : 'text-danger')}>{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-fg-subtle">Nothing stands out yet. A signal needs at least 5 leads with a clear result.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {items.map((f) => {
            const share = tone === 'success' ? f.share : 1 - f.share;
            return (
              <li key={f.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-medium text-fg">{f.label}</span>
                  <span className="font-num shrink-0 text-xs text-fg-subtle">
                    {tone === 'success' ? f.pos : f.neg} of {f.n}
                  </span>
                </div>
                <ProgressBar value={Math.round(share * 100)} label={`${f.label}: ${tone === 'success' ? 'replied or won' : 'ignored or lost'}`} tone={tone} className="mt-1" />
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {Math.round(share * 100)}% {tone === 'success' ? 'got a reply or a win' : 'were ignored or lost'}
                  {tone === 'success' && base !== null ? `, you average ${Math.round(base * 100)}%` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "What wins for you": the signals the Best match order has learned from replies, wins, ignored and lost leads. */
export default function WhatWinsPanel() {
  const [model, setModel] = useState<OutcomeModelInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dupMsg, setDupMsg] = useState<string | null>(null);
  const job = useJob();
  const dup = useJob();

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'outcome_model').maybeSingle();
    setModel(parseModel(data?.value));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recompute = async () => {
    await job.start('recompute_learned');
    await load();
  };
  const recheck = async () => {
    const out = await dup.start('dedupe_backfill');
    setDupMsg(out.phase === 'done' ? `Checked ${String(out.result?.matched ?? 0)} leads, ${String(out.result?.links ?? 0)} matches in total.` : null);
  };

  const ready = model?.status === 'ready';
  const progress = model ? Math.min(100, Math.round((model.examples / model.min_examples) * 100)) : 0;

  return (
    <Card
      id="what-wins"
      title="What wins for you"
      subtitle={model?.generated_at ? `Learned from your results, updated ${fmtDateTime(model.generated_at)}` : 'Learned from the leads you reply to, win, ignore or lose'}
      actions={
        <Button variant="secondary" size="sm" onClick={() => void recompute()} disabled={job.running} loading={job.running} leftIcon={<RefreshIcon className="h-4 w-4" />}>
          Recompute now
        </Button>
      }
    >
      <JobNote phase={job.phase} error={job.error} runningText="Working it out…" />
      {!loaded ? (
        <Skeleton className="h-24 w-full" />
      ) : !ready ? (
        <div>
          <p className="text-sm text-fg-muted">
            Not enough data yet. {model?.note ?? 'Mark leads as replied, won, ignored or lost and this fills in.'}
          </p>
          <ProgressBar value={progress} label="Leads with a clear result" tone="primary" className="mt-3" />
          <p className="mt-1.5 text-xs text-fg-subtle">
            <span className="font-num">{model?.examples ?? 0}</span> of <span className="font-num">{model?.min_examples ?? 20}</span> leads with a clear result so far (
            <span className="font-num">{model?.positives ?? 0}</span> replied or won, <span className="font-num">{model?.negatives ?? 0}</span> ignored or lost). Until then the Best match order uses the fit score only.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            Based on <span className="font-num font-semibold text-fg">{model.examples}</span> leads with a clear result: <span className="font-num">{model.positives}</span> replied or won, <span className="font-num">{model.negatives}</span> ignored or lost.
            The Best match order is <span className="font-num font-semibold text-fg">{Math.round(model.weight * 100)}%</span> this and {Math.round((1 - model.weight) * 100)}% your fit score. Your fit score is never replaced.
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <SignalList title="Helps" items={model.top_positive} tone="success" base={model.base_rate} />
            <SignalList title="Hurts" items={model.top_negative} tone="danger" base={model.base_rate} />
          </div>
        </>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-fg-subtle">
        <span>Same person on several sources?</span>
        <button type="button" onClick={() => void recheck()} disabled={dup.running} className="rounded font-medium text-primary-text hover:underline disabled:opacity-60">
          {dup.running ? 'Checking all leads…' : 'Re-check duplicates on all leads'}
        </button>
        <JobNote phase={dup.phase === 'done' ? 'idle' : dup.phase} error={dup.error} runningText="This can take a few minutes." />
        {dupMsg && <span className="text-success">{dupMsg}</span>}
      </div>
    </Card>
  );
}
