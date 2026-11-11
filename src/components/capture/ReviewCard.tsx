"use client";

import { useMemo, useState } from 'react';
import { useJob } from '@/lib/jobs';
import { previewTitle, readOutcomes, siteLabel, toQuickAddItems, type CapturePayload } from '@/lib/capture';
import { useShell } from '../AppShell';
import { Card, Field, JobNote, Notice, Spinner, btnPrimary, btnSecondary, inputCls } from '../ui';
import { ExternalIcon } from '../Icons';
import OutcomeList, { type OutcomeRow } from './OutcomeList';

export default function ReviewCard({ payload, onDismiss }: { payload: CapturePayload; onDismiss: () => void }) {
  const { workerOnline, pushToast } = useShell();
  const job = useJob();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(payload.items.map((_, i) => i)));
  const [label, setLabel] = useState(siteLabel(payload.site));
  const [sentIndexes, setSentIndexes] = useState<number[]>([]);

  const count = selected.size;
  const allOn = count === payload.items.length;
  const finished = job.phase === 'done';

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const save = async () => {
    const indexes = Array.from(selected).sort((a, b) => a - b);
    if (!indexes.length) return;
    setSentIndexes(indexes);
    const items = toQuickAddItems(indexes.map((i) => payload.items[i]), payload.site, payload.page_title);
    const body: Record<string, unknown> = { items };
    if (label.trim()) body.source_label = label.trim();
    const out = await job.start('quick_add', body);
    if (out.phase === 'done') pushToast('success', 'Captured leads were added.');
    else pushToast('error', out.error ?? 'Could not save the captured leads.');
  };

  const outcomes = useMemo(() => readOutcomes(job.result), [job.result]);
  const rows: OutcomeRow[] = sentIndexes.map((idx, pos) => ({
    label: previewTitle(payload.items[idx]),
    outcome: outcomes.items.find((o) => o.index === pos) ?? null,
  }));

  return (
    <Card
      className="glass"
      title={`Captured from ${siteLabel(payload.site) || 'a page'}`}
      subtitle={payload.page_title || undefined}
      actions={
        <button type="button" onClick={onDismiss} className={btnSecondary}>
          Close
        </button>
      }
    >
      {!workerOnline && !finished && (
        <div className="mb-3">
          <Notice tone="warn">The worker is not running, so saving will wait. Run npm run worker in the project folder first.</Notice>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          Found <span className="font-semibold tabular-nums">{payload.items.length}</span> {payload.items.length === 1 ? 'item' : 'items'}. Untick anything you do not want.
        </p>
        {!finished && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelected(new Set(payload.items.map((_, i) => i)))} disabled={allOn} className={btnSecondary}>
              Select all
            </button>
            <button type="button" onClick={() => setSelected(new Set())} disabled={count === 0} className={btnSecondary}>
              Select none
            </button>
          </div>
        )}
      </div>

      {!finished && (
        <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto rounded-card border border-border bg-surface-2/40">
          {payload.items.map((item, i) => (
            <li key={i} className="flex gap-3 px-3 py-2.5">
              <input
                id={`cap-item-${i}`}
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
                className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
              />
              <div className="min-w-0 flex-1">
                <label htmlFor={`cap-item-${i}`} className="block cursor-pointer break-words text-sm text-fg">
                  {previewTitle(item)}
                </label>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
                  {item.author && <span>by {item.author}</span>}
                  {item.channel_label && <span className="break-all">{item.channel_label}</span>}
                  <span>{siteLabel(payload.site)}</span>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all text-primary-text hover:underline">
                      <ExternalIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.url.replace(/^https?:\/\//, '')}</span>
                    </a>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!finished && (
        <div className="glass-strong sticky bottom-[4.75rem] z-20 mt-4 flex flex-wrap items-end gap-3 rounded-card border border-border px-4 py-3 shadow-float md:bottom-4">
          <div className="w-full sm:w-64">
            <Field label="Where is this from? (optional)" htmlFor="cap-source" hint="Shown on the lead, for example Eldorado.">
              <input id="cap-source" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} className={inputCls} />
            </Field>
          </div>
          <button type="button" onClick={save} disabled={count === 0 || job.running} className={`${btnPrimary} sm:ml-auto`}>
            {job.running ? <Spinner /> : null}
            {job.running ? 'Saving…' : `Save ${count} to my leads`}
          </button>
        </div>
      )}

      <JobNote phase={job.phase} error={job.error} runningText="The worker is reading each item and scoring it…" />
      {finished && (
        <>
          <OutcomeList summary={outcomes} rows={rows} />
          <div className="mt-3">
            <button type="button" onClick={onDismiss} className={btnSecondary}>
              Done
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
