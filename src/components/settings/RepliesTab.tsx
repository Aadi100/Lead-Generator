"use client";

import { useCallback, useEffect, useState } from 'react';
import { defaultSetting, loadSetting, useSettingForm } from '@/lib/settings';
import { useJob } from '@/lib/jobs';
import { fmtDateTime } from '@/lib/format';
import type { ImapState } from '@/lib/types';
import { useShell } from '../AppShell';
import { RefreshIcon } from '../Icons';
import { Card, Field, JobNote, Notice, Spinner, Toggle, btnSecondary, inputCls } from '../ui';
import SaveBar from './SettingsSaveBar';
import SecretInput from './SecretInput';
import { ResultChip } from './StatusChip';
import { hostError, portError } from '@/lib/settings-validate';

const PRESETS = [
  { label: 'Gmail', host: 'imap.gmail.com', port: 993, secure: true },
  { label: 'Outlook / Microsoft 365', host: 'outlook.office365.com', port: 993, secure: true },
  { label: 'Zoho', host: 'imap.zoho.com', port: 993, secure: true },
];

export default function RepliesTab() {
  const { pushToast } = useShell();
  const form = useSettingForm('imap');
  const [state, setState] = useState<ImapState>(() => defaultSetting('imap_state'));
  const test = useJob();
  const check = useJob();
  const i = form.draft;
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const loadState = useCallback(async () => {
    const res = await loadSetting('imap_state');
    if (!res.error) setState(res.value);
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const save = async (): Promise<boolean> => {
    const err = await form.save();
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', 'Reply tracking saved.');
    return true;
  };

  const runTest = async () => {
    if (form.dirty && !(await save())) return;
    await test.start('test_imap', {});
  };

  const runCheck = async () => {
    if (form.dirty && !(await save())) return;
    const out = await check.start('check_replies', {});
    if (out.phase === 'done') {
      const matched = typeof out.result?.matched === 'number' ? out.result.matched : null;
      pushToast('success', matched === null ? 'Checked your inbox.' : `Checked your inbox. ${matched} ${matched === 1 ? 'reply' : 'replies'} found.`);
    } else {
      pushToast('error', out.error ?? 'Could not check your inbox.');
    }
    void loadState();
  };

  const testResult = test.phase === 'done' ? test.result : null;
  const testFailed = testResult?.ok === false;

  return (
    <div className="space-y-4">
      <Card
        title="Reply tracking"
        subtitle="I look in your inbox for answers to your pitches. I only read. I never delete anything or mark messages as read."
      >
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Toggle
              id="imap-on"
              checked={i.enabled}
              onChange={(v) => form.patch({ enabled: v })}
              label="Watch my inbox for replies"
              description="When someone answers, the lead moves to Replied and follow-ups stop."
            />

            <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-fg-muted">Quick fill:</span>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => form.patch({ host: p.host, port: p.port, secure: p.secure })}
                    className={`${btnSecondary} min-h-8 px-2.5 py-1 text-xs`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mail server (host)" htmlFor="imap-host" error={touched.host ? hostError(i.host) : null}>
                  <input id="imap-host" className={inputCls} onBlur={blur('host')} value={i.host} onChange={(e) => form.patch({ host: e.target.value })} placeholder="imap.gmail.com" />
                </Field>
                <Field label="Port" htmlFor="imap-port" error={touched.port ? portError(i.port) : null}>
                  <input id="imap-port" type="number" className={inputCls} onBlur={blur('port')} value={i.port} onChange={(e) => form.patch({ port: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Username" htmlFor="imap-user">
                  <input id="imap-user" autoComplete="off" className={inputCls} value={i.user} onChange={(e) => form.patch({ user: e.target.value })} />
                </Field>
                <Field label="Password" htmlFor="imap-pass">
                  <SecretInput
                    id="imap-pass"
                    autoComplete="new-password"
                    value={i.pass}
                    onChange={(e) => form.patch({ pass: e.target.value })}
                  />
                </Field>
                <Field label="Folder to watch" htmlFor="imap-folder">
                  <input id="imap-folder" className={inputCls} value={i.folder} onChange={(e) => form.patch({ folder: e.target.value })} />
                </Field>
              </div>
              <Toggle id="imap-secure" checked={i.secure} onChange={(v) => form.patch({ secure: v })} label="Use a secure connection" description="Leave on for port 993." />
              <p className="text-xs text-fg-subtle">
                Use the inbox where replies arrive, which is the &quot;Replies go to&quot; address if you set one. Gmail needs an app password and IMAP turned on in its settings.
              </p>
            </div>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      <Card title="Try it">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void runTest()} disabled={test.running || !i.host.trim()} className={btnSecondary}>
            {test.running && <Spinner />}
            Test connection
          </button>
          <button type="button" onClick={() => void runCheck()} disabled={check.running || !i.enabled} className={btnSecondary}>
            {check.running ? <Spinner /> : <RefreshIcon className="h-4 w-4" />}
            Check for replies now
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {test.running && <ResultChip state="running" message="Connecting to your inbox…" />}
          {test.phase === 'done' && !testFailed && (
            <ResultChip
              state="ok"
              message={typeof testResult?.messages === 'number' ? `Connected. Your inbox has ${testResult.messages} messages.` : 'Connected. Reading your inbox works.'}
            />
          )}
          {testFailed && <ResultChip state="bad" message={typeof testResult?.error === 'string' ? testResult.error : 'The connection failed.'} />}
          {(test.phase === 'failed' || test.phase === 'timeout') && <ResultChip state="bad" message={test.error ?? 'The connection failed.'} />}
          <JobNote phase={check.phase} error={check.error} runningText="Reading your inbox…" />
          <p className="text-xs text-fg-subtle">
            {state.last_checked ? `Last checked ${fmtDateTime(state.last_checked)}.` : 'Not checked yet.'}
          </p>
          {state.last_error && <Notice tone="warn">Last problem: {state.last_error}</Notice>}
        </div>
      </Card>
    </div>
  );
}
