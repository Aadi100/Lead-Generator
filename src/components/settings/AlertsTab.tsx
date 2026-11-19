"use client";

import { useState } from 'react';
import { useSettingForm } from '@/lib/settings';
import { useJob } from '@/lib/jobs';
import { emailError } from '@/lib/settings-validate';
import { useShell } from '../AppShell';
import { SendIcon } from '../Icons';
import { Card, Field, JobNote, Spinner, Toggle, btnSecondary, inputCls, pill } from '../ui';
import Advanced from './Advanced';
import SaveBar from './SettingsSaveBar';
import SecretInput from './SecretInput';

type Channel = 'all' | 'email' | 'whatsapp';

export default function AlertsTab() {
  const { pushToast } = useShell();
  const form = useSettingForm('alerts');
  const test = useJob();
  const [channel, setChannel] = useState<Channel>('all');
  const a = form.draft;
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const save = async (): Promise<boolean> => {
    const err = await form.save();
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', 'Alert settings saved.');
    return true;
  };

  const runTest = async () => {
    if (form.dirty && !(await save())) return;
    await test.start('test_alert', { channel });
  };

  const results =
    test.phase === 'done' && test.result?.results && typeof test.result.results === 'object'
      ? (test.result.results as Record<string, { ok?: boolean; error?: string }>)
      : null;

  return (
    <div className="space-y-4">
      <Card title="Instant alerts" subtitle="Switch on, then add at least one place to get them below.">
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Toggle id="al-on" checked={a.enabled} onChange={(v) => form.patch({ enabled: v })} label="Send me alerts" />

            <Toggle id="al-reply" checked={a.on_reply} onChange={(v) => form.patch({ on_reply: v })} label="Also alert me when someone replies" />
            <Advanced id="alerts" hint="Only alert for leads that look real, and skip leads marked Be careful.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Only alert for leads that look real (0 to 100)" htmlFor="al-trust" hint="70 means only leads that look real.">
                <input
                  id="al-trust"
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={a.min_trust}
                  onChange={(e) => form.patch({ min_trust: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                />
              </Field>
              <div className="space-y-3 sm:pt-6">
                <Toggle
                  id="al-safe"
                  checked={a.only_non_suspicious}
                  onChange={(v) => form.patch({ only_non_suspicious: v })}
                  label="Skip leads marked Be careful"
                />
              </div>
            </div>
            </Advanced>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      {!form.loading && (
        <>
          <Card title="Email" subtitle="Free and quick to set up. Recommended. Uses the email account you set up in the Email account tab.">
            <Field label="Send alerts to" htmlFor="al-email" error={touched.email ? emailError(a.email.to) : null}>
              <input id="al-email" type="email" className={inputCls} onBlur={blur('email')} value={a.email.to} onChange={(e) => form.patch({ email: { to: e.target.value } })} placeholder="you@example.com" />
            </Field>
          </Card>

          <Advanced id="alerts-more" title="Show more ways to get alerts" hint="WhatsApp. Optional.">
          <Card title="WhatsApp" subtitle="Free through CallMeBot. Setup takes about two minutes.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Your WhatsApp number" htmlFor="wa-phone" hint="With country code, for example +923001234567.">
                <input id="wa-phone" className={inputCls} value={a.whatsapp.phone} onChange={(e) => form.patch({ whatsapp: { ...a.whatsapp, phone: e.target.value } })} />
              </Field>
              <Field label="CallMeBot key" htmlFor="wa-key">
                <SecretInput
                  id="wa-key"
                  autoComplete="off"
                  value={a.whatsapp.apikey}
                  onChange={(e) => form.patch({ whatsapp: { ...a.whatsapp, apikey: e.target.value } })}
                />
              </Field>
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Follow the short setup steps on callmebot.com for WhatsApp. It gives you the API key after you send its bot one message.
            </p>
          </Card>

          </Advanced>

          <Card title="Send a test alert">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="sm:w-56">
                <Field label="Where to test" htmlFor="al-channel">
                  <select id="al-channel" className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                    <option value="all">Every channel I set up</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </Field>
              </div>
              <button type="button" onClick={() => void runTest()} disabled={test.running} className={`${btnSecondary} min-h-10`}>
                {test.running ? <Spinner /> : <SendIcon className="h-4 w-4" />}
                Send test alert
              </button>
            </div>
            <div className="mt-3 space-y-1.5">
              <JobNote phase={results ? 'idle' : test.phase} error={test.error} runningText="Sending…" doneText="Sent." />
              {results &&
                Object.entries(results).map(([name, r]) => (
                  <p key={name} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`${pill} ${r.ok ? 'bg-success-soft text-success ring-success-border' : 'bg-danger-soft text-danger ring-danger-border'}`}>
                      {name} {r.ok ? 'worked' : 'failed'}
                    </span>
                    {!r.ok && r.error && <span className="break-words text-danger">{r.error}</span>}
                  </p>
                ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
