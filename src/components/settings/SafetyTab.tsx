"use client";

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { patchSetting, useSettingForm } from '@/lib/settings';
import { fmtDateTime, looksLikeEmail } from '@/lib/format';
import type { SendingSettings } from '@/lib/types';
import { useShell } from '../AppShell';
import { PauseIcon, PlusIcon, TrashIcon } from '../Icons';
import { Card, Field, Notice, Toggle, btnDanger, btnPrimary, btnSecondary, inputCls } from '../ui';
import Advanced from './Advanced';
import SaveBar from './SettingsSaveBar';

const OWNED: (keyof SendingSettings)[] = ['require_confirm_suspicious', 'auto_draft', 'auto_draft_per_hour', 'min_trust_for_auto_draft'];

type Suppression = { email: string; reason: string | null; created_at: string };

export default function SafetyTab() {
  const { pushToast, sending: shellSending, refreshSending } = useShell();
  const form = useSettingForm('sending', OWNED);
  const [pausing, setPausing] = useState(false);
  const [list, setList] = useState<Suppression[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const s = form.draft;

  const loadList = useCallback(async () => {
    const { data, error } = await supabase.from('suppressions').select('email, reason, created_at').order('created_at', { ascending: false }).limit(500);
    if (error) {
      setListError(error.message);
      return;
    }
    setListError(null);
    setList(
      ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        email: String(r.email ?? ''),
        reason: typeof r.reason === 'string' ? r.reason : null,
        created_at: typeof r.created_at === 'string' ? r.created_at : '',
      })),
    );
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const togglePause = async () => {
    setPausing(true);
    const next = !shellSending.paused;
    const res = await patchSetting('sending', { paused: next });
    setPausing(false);
    if (res.error) {
      pushToast('error', `Could not change it: ${res.error}`);
      return;
    }
    await refreshSending();
    pushToast('success', next ? 'Sending is paused. Nothing will go out.' : 'Sending is back on.');
  };

  const save = async () => {
    const err = await form.save();
    if (err) pushToast('error', `Could not save: ${err}`);
    else {
      await refreshSending();
      pushToast('success', 'Safety settings saved.');
    }
  };

  const add = async () => {
    const value = email.trim().toLowerCase();
    if (!looksLikeEmail(value)) {
      pushToast('error', 'That does not look like an email address.');
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('suppressions').upsert({ email: value, reason: reason.trim() || 'Added by you' });
    setAdding(false);
    if (error) {
      pushToast('error', `Could not add it: ${error.message}`);
      return;
    }
    setEmail('');
    setReason('');
    pushToast('success', `${value} will never be contacted.`);
    void loadList();
  };

  const remove = async (value: string) => {
    const { error } = await supabase.from('suppressions').delete().eq('email', value);
    if (error) {
      pushToast('error', `Could not remove it: ${error.message}`);
      return;
    }
    pushToast('success', 'Removed from the list.');
    void loadList();
  };

  const paused = shellSending.paused;

  return (
    <div className="space-y-4">
      <section
        className={`rounded-xl border p-4 shadow-sm sm:p-5 ${paused ? 'border-danger-border bg-danger-soft' : 'border-border bg-surface'}`}
        aria-label="Pause all sending"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${paused ? 'bg-danger-solid text-white' : 'bg-surface-2 text-fg-muted'}`}>
            <PauseIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-fg">{paused ? 'Sending is paused' : 'Pause everything'}</h2>
            <p className="text-sm text-fg-muted">
              {paused
                ? 'No emails and no follow-ups go out until you resume. Messages already queued wait.'
                : 'One switch that stops every email and follow-up straight away. Use it if something looks wrong.'}
            </p>
          </div>
          <button type="button" onClick={() => void togglePause()} disabled={pausing} className={paused ? btnPrimary : btnDanger}>
            {paused ? 'Resume sending' : 'Pause all sending'}
          </button>
        </div>
      </section>

      <Card title="Rules I follow" subtitle="These protect your name and your email reputation.">
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Toggle
              id="sf-susp"
              checked={s.require_confirm_suspicious}
              onChange={(v) => form.patch({ require_confirm_suspicious: v })}
              label="Ask me to confirm before I contact a lead marked Be careful"
              description="Recommended. Leads marked Be careful are shown in red, and you tick a box to say you checked them."
            />
            <Toggle
              id="sf-auto"
              checked={s.auto_draft}
              onChange={(v) => form.patch({ auto_draft: v })}
              label="Write messages for my best leads automatically"
              description="They wait in your Outbox. Nothing is sent without you."
            />
            <Advanced id="safety" hint="How many messages the AI writer drafts per hour, and the minimum trust it needs.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Most messages written per hour" htmlFor="sf-hour" hint="Writing uses your AI writer plan, so keep this modest.">
                <input
                  id="sf-hour"
                  type="number"
                  min={0}
                  className={inputCls}
                  disabled={!s.auto_draft}
                  value={s.auto_draft_per_hour}
                  onChange={(e) => form.patch({ auto_draft_per_hour: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
              <Field label="Only write for leads that look real (0 to 100)" htmlFor="sf-trust" hint="Higher means fewer, safer leads. Try 60.">
                <input
                  id="sf-trust"
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  disabled={!s.auto_draft}
                  value={s.min_trust_for_auto_draft}
                  onChange={(e) => form.patch({ min_trust_for_auto_draft: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                />
              </Field>
            </div>
            </Advanced>
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
              <li>I never contact the same address twice for different leads.</li>
              <li>I never email anyone on the do-not-contact list below, or addresses that bounced.</li>
              <li>I hold back emails that link to websites that are not yours, or that still contain placeholder text.</li>
            </ul>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      <Card title="Do-not-contact list" subtitle="I never email these addresses. People who said no, and addresses that bounced, are added here automatically.">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Email address" htmlFor="sp-email">
              <input id="sp-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </Field>
          </div>
          <div className="min-w-0 flex-1">
            <Field label="Why (optional)" htmlFor="sp-reason">
              <input id="sp-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <button type="button" onClick={() => void add()} disabled={adding || !email.trim()} className={`${btnSecondary} min-h-10`}>
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>

        {listError && <div className="mt-3"><Notice tone="error">Could not load the list: {listError}</Notice></div>}
        {list.length === 0 && !listError ? (
          <p className="mt-3 text-sm text-fg-subtle">The list is empty.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {list.map((item) => (
              <li key={item.email} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 break-all font-medium text-fg">{item.email}</span>
                {item.reason && <span className="min-w-0 break-words text-fg-subtle">{item.reason}</span>}
                <span className="ml-auto text-xs text-fg-subtle">{fmtDateTime(item.created_at)}</span>
                <button type="button" onClick={() => void remove(item.email)} aria-label={`Remove ${item.email}`} className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
