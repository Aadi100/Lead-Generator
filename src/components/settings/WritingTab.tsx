"use client";

import { useCallback, useEffect, useState } from 'react';
import { defaultSetting, loadSetting, patchSetting } from '@/lib/settings';
import { useJob } from '@/lib/jobs';
import { fmtDateTime } from '@/lib/format';
import type { WritingRules } from '@/lib/types';
import { useShell } from '../AppShell';
import { SparkIcon } from '../Icons';
import { Card, Field, JobNote, Spinner, btnPrimary, inputCls } from '../ui';
import SaveBar from './SettingsSaveBar';

const SOURCE_LABEL = { default: 'the starting rules', learned: 'learned from your edits', manual: 'written by you' } as const;

export default function WritingTab() {
  const { pushToast } = useShell();
  const [rules, setRules] = useState<WritingRules>(() => defaultSetting('writing_rules'));
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openHistory, setOpenHistory] = useState<number | null>(null);
  const learn = useJob();

  const load = useCallback(async () => {
    const res = await loadSetting('writing_rules');
    if (!res.error) {
      setRules(res.value);
      setText(res.value.markdown);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = text !== rules.markdown;

  const save = async () => {
    setSaving(true);
    const fresh = await loadSetting('writing_rules');
    if (fresh.error) {
      setSaving(false);
      pushToast('error', `Could not save: ${fresh.error}`);
      return;
    }
    const prev = fresh.value;
    const now = new Date().toISOString();
    const history = prev.markdown.trim()
      ? [{ at: prev.updated_at ?? now, source: prev.source, markdown: prev.markdown }, ...prev.history].slice(0, 10)
      : prev.history;
    const res = await patchSetting('writing_rules', { markdown: text, source: 'manual', updated_at: now, history });
    setSaving(false);
    if (res.error || !res.value) {
      pushToast('error', `Could not save: ${res.error ?? 'unknown error'}`);
      return;
    }
    setRules(res.value);
    setText(res.value.markdown);
    pushToast('success', 'Rules saved. New pitches follow them.');
  };

  const learnNow = async () => {
    const out = await learn.start('learn_writing', {});
    if (out.phase === 'done') pushToast('success', out.result?.changed === false ? 'Nothing new to learn yet.' : 'Rules updated from your edits.');
    else pushToast('error', out.error ?? 'Could not learn from your edits.');
    await load();
  };

  const notes = Array.isArray(learn.result?.notes) ? (learn.result?.notes as unknown[]).filter((n): n is string => typeof n === 'string') : [];

  return (
    <div className="space-y-4">
      <Card
        title="How I write your pitches"
        subtitle={`These rules are ${SOURCE_LABEL[rules.source]}${rules.updated_at ? `, updated ${fmtDateTime(rules.updated_at)}` : ''}. Every pitch follows them.`}
        actions={
          <button type="button" onClick={() => void learnNow()} disabled={learn.running} className={btnPrimary}>
            {learn.running ? <Spinner /> : <SparkIcon className="h-4 w-4" />}
            Learn from my edits now
          </button>
        }
      >
        {loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <>
            <Field
              label="Writing rules"
              htmlFor="wr-text"
              hint="One rule per line, each starting with a dash. When you edit a pitch before sending, rate it or ask for a rewrite, I update these for you. What you type here always wins."
            >
              <textarea id="wr-text" rows={14} className={`${inputCls} resize-y font-mono text-[13px] leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={() => setText(rules.markdown)} savedLabel="Rules are up to date" />
          </>
        )}
        <div className="mt-3 space-y-2">
          <JobNote phase={learn.phase} error={learn.error} runningText="Reading your edits. This takes about half a minute…" />
          {notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
              {notes.map((n) => (
                <li key={n} className="break-words">
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Earlier versions" subtitle="Each time the rules change, the old version is kept here.">
        {rules.history.length === 0 ? (
          <p className="text-sm text-fg-subtle">No earlier versions yet.</p>
        ) : (
          <ul className="space-y-2">
            {rules.history.map((h, idx) => (
              <li key={`${h.at}-${idx}`} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg">{fmtDateTime(h.at) || 'Earlier version'}</span>
                  <span className="text-xs text-fg-subtle">{h.source}</span>
                  <span className="ml-auto flex gap-2">
                    <button type="button" onClick={() => setOpenHistory(openHistory === idx ? null : idx)} aria-expanded={openHistory === idx} className="text-sm font-medium text-primary-text hover:underline">
                      {openHistory === idx ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setText(h.markdown);
                        pushToast('info', 'Put back in the editor. Press Save rules to keep it.');
                      }}
                      className="text-sm font-medium text-primary-text hover:underline"
                    >
                      Restore
                    </button>
                  </span>
                </div>
                {openHistory === idx && <p className="mt-2 whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-xs text-fg-muted">{h.markdown}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
