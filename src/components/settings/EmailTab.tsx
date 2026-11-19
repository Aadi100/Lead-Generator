"use client";

import { useEffect, useState } from 'react';
import { loadSetting, useSettingForm } from '@/lib/settings';
import { useJob } from '@/lib/jobs';
import { looksLikeEmail } from '@/lib/format';
import { emailError, hostError, portError } from '@/lib/settings-validate';
import type { SendingSettings } from '@/lib/types';
import { useShell } from '../AppShell';
import { MailIcon } from '../Icons';
import { Card, Field, JobNote, Notice, Spinner, TagInput, Toggle, btnSecondary, inputCls } from '../ui';
import Advanced from './Advanced';
import SaveBar from './SettingsSaveBar';
import SecretInput from './SecretInput';
import { ResultChip } from './StatusChip';

const OWNED: (keyof SendingSettings)[] = [
  'provider',
  'daily_limit',
  'auto_followups',
  'followup_days',
  'from_name',
  'from_email',
  'reply_to',
  'footer',
  'owned_domains',
];

const PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false },
  { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, secure: false },
  { label: 'Zoho', host: 'smtp.zoho.com', port: 587, secure: false },
  { label: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, secure: false },
];

export default function EmailTab() {
  const { pushToast, refreshSending } = useShell();
  const sending = useSettingForm('sending', OWNED);
  const smtp = useSettingForm('smtp');
  const resend = useSettingForm('resend');
  const test = useJob();
  const [testTo, setTestTo] = useState('');
  const [d1, setD1] = useState('4');
  const [d2, setD2] = useState('9');
  const s = sending.draft;
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));
  const err = (k: string, e: string | null) => (touched[k] ? e : null);

  const loading = sending.loading || smtp.loading || resend.loading;
  const dirty = sending.dirty || smtp.dirty || resend.dirty;
  const saving = sending.saving || smtp.saving || resend.saving;
  const error = sending.error ?? smtp.error ?? resend.error;

  const savedDays = JSON.stringify(sending.saved.followup_days);
  useEffect(() => {
    const days = sending.saved.followup_days;
    setD1(days[0] !== undefined ? String(days[0]) : '');
    setD2(days[1] !== undefined ? String(days[1]) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedDays]);

  useEffect(() => {
    void loadSetting('profile').then((r) => {
      if (!r.error) setTestTo((cur) => cur || r.value.email);
    });
  }, []);

  const setDays = (a: string, b: string) => {
    setD1(a);
    setD2(b);
    const days = [a, b].map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    sending.patch({ followup_days: days });
  };

  const saveAll = async (): Promise<boolean> => {
    let err: string | null = null;
    if (sending.dirty) err = await sending.save();
    if (!err && smtp.dirty) err = await smtp.save();
    if (!err && resend.dirty) err = await resend.save();
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    await refreshSending();
    pushToast('success', 'Email settings saved.');
    return true;
  };

  const sendTest = async () => {
    if (dirty && !(await saveAll())) return;
    const to = testTo.trim() || sending.saved.from_email;
    const out = await test.start('test_email', to ? { to } : {});
    const ok = out.phase === 'done' && out.result?.ok !== false;
    if (ok) pushToast('success', `Test email sent${to ? ` to ${to}` : ''}. Check that inbox.`);
    else pushToast('error', (typeof out.result?.error === 'string' ? out.result.error : null) ?? out.error ?? 'The test email failed.');
  };

  const testError = test.phase === 'done' && test.result?.ok === false ? (typeof test.result.error === 'string' ? test.result.error : 'The test email failed.') : null;

  return (
    <div className="space-y-4">
      <Card title="Where emails go out from" subtitle="Pick one. Nothing is ever sent until you press Send now on a message.">
        {loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg-muted">Send with</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { v: 'smtp', t: 'My own email account', d: 'Gmail, Outlook, your hosting or any mail server' },
                    { v: 'resend', t: 'An email service (Resend)', d: 'A sending service that only needs one key' },
                    { v: 'none', t: 'Not set up yet', d: 'You can still write and copy messages' },
                  ] as const
                ).map((o) => (
                  <label
                    key={o.v}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${
                      s.provider === o.v ? 'border-primary-border bg-primary-soft' : 'border-border hover:bg-surface-2'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      checked={s.provider === o.v}
                      onChange={() => sending.patch({ provider: o.v })}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium text-fg">{o.t}</span>
                      <span className="text-sm text-fg-subtle">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {s.provider === 'smtp' && (
              <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-fg-muted">Quick fill:</span>
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => smtp.patch({ host: p.host, port: p.port, secure: p.secure })}
                      className={`${btnSecondary} min-h-8 px-2.5 py-1 text-xs`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Mail server" hint="The address of your email provider, for example smtp.gmail.com." htmlFor="smtp-host" error={err('host', hostError(smtp.draft.host))}>
                    <input id="smtp-host" className={inputCls} onBlur={blur('host')} value={smtp.draft.host} onChange={(e) => smtp.patch({ host: e.target.value })} placeholder="smtp.gmail.com" />
                  </Field>
                  <Field label="Port" htmlFor="smtp-port" error={err('port', portError(smtp.draft.port))}>
                    <input
                      id="smtp-port"
                      onBlur={blur('port')}
                      type="number"
                      className={inputCls}
                      value={smtp.draft.port}
                      onChange={(e) => smtp.patch({ port: Number(e.target.value) || 0 })}
                    />
                  </Field>
                  <Field label="Email login (username)" htmlFor="smtp-user">
                    <input id="smtp-user" autoComplete="off" className={inputCls} value={smtp.draft.user} onChange={(e) => smtp.patch({ user: e.target.value })} />
                  </Field>
                  <Field label="Email password" htmlFor="smtp-pass">
                    <SecretInput
                      id="smtp-pass"
                      autoComplete="new-password"
                      value={smtp.draft.pass}
                      onChange={(e) => smtp.patch({ pass: e.target.value })}
                    />
                  </Field>
                </div>
                <Toggle
                  id="smtp-secure"
                  checked={smtp.draft.secure}
                  onChange={(v) => smtp.patch({ secure: v })}
                  label="Use a secure connection from the start"
                  description="Turn on for port 465. Leave off for port 587, which upgrades by itself."
                />
                <p className="text-sm text-fg-subtle">
                  Where do I get this? Gmail and Outlook need an app password, not your normal one. In Gmail: Google Account, Security, 2-Step Verification, App passwords.
                </p>
              </div>
            )}

            {s.provider === 'resend' && (
              <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
                <Field label="Email service key" htmlFor="rs-key" hint="Where do I get this? Create a free account at resend.com and make a key. Your From address must use a domain you verified there.">
                  <SecretInput
                    id="rs-key"
                    autoComplete="new-password"
                    value={resend.draft.api_key}
                    onChange={(e) => resend.patch({ api_key: e.target.value })}
                    placeholder="re_..."
                  />
                </Field>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From name" htmlFor="from-name">
                <input id="from-name" className={inputCls} value={s.from_name} onChange={(e) => sending.patch({ from_name: e.target.value })} />
              </Field>
              <Field label="From email" htmlFor="from-email" error={err('from', emailError(s.from_email, s.provider !== 'none'))}>
                <input id="from-email" type="email" className={inputCls} onBlur={blur('from')} value={s.from_email} onChange={(e) => sending.patch({ from_email: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Card>

      <Card title="Sending limits">
        {!loading && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Most emails per day" htmlFor="daily-limit" hint="A low number protects your email reputation. Start with 20.">
                <input
                  id="daily-limit"
                  type="number"
                  min={0}
                  className={inputCls}
                  value={s.daily_limit}
                  onChange={(e) => sending.patch({ daily_limit: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
            </div>
            <Toggle
              id="auto-fu"
              checked={s.auto_followups}
              onChange={(v) => sending.patch({ auto_followups: v })}
              label="Write follow-ups with every message"
              description="They only go out if the person has not replied, and only after you press Send now on the first email."
            />
            <Advanced id="email" hint="Reply address, follow-up timing, email footer and your own domains.">
              <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Replies go to" htmlFor="reply-to" hint="Optional. Leave empty to use the From email." error={err('reply', emailError(s.reply_to))}>
                <input id="reply-to" type="email" className={inputCls} onBlur={blur('reply')} value={s.reply_to} onChange={(e) => sending.patch({ reply_to: e.target.value })} />
              </Field>
              <Field label="First follow-up after (days)" htmlFor="fu1">
                <input id="fu1" type="number" min={1} className={inputCls} value={d1} disabled={!s.auto_followups} onChange={(e) => setDays(e.target.value, d2)} />
              </Field>
              <Field label="Second follow-up after (days)" htmlFor="fu2" hint="Leave empty for only one follow-up.">
                <input id="fu2" type="number" min={1} className={inputCls} value={d2} disabled={!s.auto_followups} onChange={(e) => setDays(d1, e.target.value)} />
              </Field>
              </div>
            <Field label="Line added at the bottom of every email" htmlFor="footer" hint="Keep a way for people to opt out. It is good manners and often the law.">
              <textarea id="footer" rows={2} className={`${inputCls} resize-y`} value={s.footer} onChange={(e) => sending.patch({ footer: e.target.value })} />
            </Field>
            <Field label="Websites that are yours" htmlFor="owned" hint="Links to these are allowed in pitches. Your websites from your profile are already allowed.">
              <TagInput id="owned" label="Your domains" value={s.owned_domains} onChange={(v) => sending.patch({ owned_domains: v })} placeholder="yourwebsite.com" />
            </Field>
            </Advanced>
          </div>
        )}
        <SaveBar dirty={dirty} saving={saving} onSave={() => void saveAll()} onReset={() => { sending.reset(); smtp.reset(); resend.reset(); }} error={error} />
      </Card>

      <Card title="Send a test email" subtitle="Sends one plain message so you know the settings work.">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Field label="Send the test to" htmlFor="test-to" error={err('to', emailError(testTo))}>
              <input id="test-to" type="email" className={inputCls} onBlur={blur('to')} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={test.running || s.provider === 'none' || (!!testTo && !looksLikeEmail(testTo))}
            className={`${btnSecondary} min-h-10`}
          >
            {test.running ? <Spinner /> : <MailIcon className="h-4 w-4" />}
            Send test email
          </button>
        </div>
        <div className="mt-2">
          {test.running && <ResultChip state="running" message="Sending…" />}
          {test.phase === 'done' && !testError && <ResultChip state="ok" message="Test email sent. Check the inbox." />}
          {testError && <ResultChip state="bad" message={testError} />}
          {(test.phase === 'failed' || test.phase === 'timeout') && <ResultChip state="bad" message={test.error ?? 'The test email failed.'} />}
          {s.provider === 'none' && <p className="text-sm text-fg-subtle">Choose an email account or service above first.</p>}
        </div>
      </Card>
    </div>
  );
}
