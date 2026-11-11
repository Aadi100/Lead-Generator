"use client";

import { useState } from 'react';
import { useSettingForm } from '@/lib/settings';
import { useJob } from '@/lib/jobs';
import { emailError, webhookError } from '@/lib/settings-validate';
import { useShell } from '../AppShell';
import { SendIcon } from '../Icons';
import { Card, Field, JobNote, Spinner, Toggle, btnSecondary, inputCls, pill } from '../ui';
import SaveBar from './SettingsSaveBar';
import SecretInput from './SecretInput';

type Channel = 'all' | 'discord' | 'telegram' | 'email' | 'whatsapp';

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
      <Card title="Instant alerts" subtitle="Get a message the moment a strong lead arrives, so you can reply first.">
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Toggle id="al-on" checked={a.enabled} onChange={(v) => form.patch({ enabled: v })} label="Send me alerts" />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Only alert when trust is at least" htmlFor="al-trust" hint="From 0 to 100. 70 means High trust only.">
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
                  label="Skip suspicious leads"
                />
                <Toggle id="al-reply" checked={a.on_reply} onChange={(v) => form.patch({ on_reply: v })} label="Also alert me when someone replies" />
              </div>
            </div>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      {!form.loading && (
        <>
          <Card title="Discord" subtitle="Free, and it works on networks where Telegram is blocked. Recommended.">
            <Field label="Webhook address" htmlFor="dc-hook" hint="It starts with https://discord.com/api/webhooks/" error={touched.hook ? webhookError(a.discord.webhook_url) : null}>
              <SecretInput
                onBlur={blur('hook')}
                id="dc-hook"
                autoComplete="off"
                value={a.discord.webhook_url}
                onChange={(e) => form.patch({ discord: { webhook_url: e.target.value.trim() } })}
              />
            </Field>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-fg-subtle">
              <li>Make a private Discord server just for yourself, or use one you own. Install the Discord app on your phone to get the alerts there.</li>
              <li>Open Server Settings, then Integrations, then Webhooks, then New Webhook. Pick the channel for the alerts.</li>
              <li>Press Copy Webhook URL and paste it above.</li>
            </ol>
          </Card>

          <Card title="Telegram" subtitle="Free and fast, but Telegram is blocked on some networks. If the test fails, use Discord or email.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bot token" htmlFor="tg-token">
                <SecretInput
                  id="tg-token"
                  autoComplete="off"
                  value={a.telegram.bot_token}
                  onChange={(e) => form.patch({ telegram: { ...a.telegram, bot_token: e.target.value } })}
                />
              </Field>
              <Field label="Chat ID" htmlFor="tg-chat">
                <input id="tg-chat" className={inputCls} value={a.telegram.chat_id} onChange={(e) => form.patch({ telegram: { ...a.telegram, chat_id: e.target.value } })} />
              </Field>
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-fg-subtle">
              <li>In Telegram, search for @BotFather and send /newbot. It gives you the bot token.</li>
              <li>Open a chat with your new bot and send it any message.</li>
              <li>
                Open this address in your browser, with your token in place of TOKEN:{' '}
                <span className="break-all font-mono">https://api.telegram.org/botTOKEN/getUpdates</span>. Your chat ID is the number after &quot;chat&quot;:{' '}
                {'{"id":'}.
              </li>
            </ol>
          </Card>

          <Card title="Email" subtitle="Uses the email sending you set up in the Email sending tab.">
            <Field label="Send alerts to" htmlFor="al-email" error={touched.email ? emailError(a.email.to) : null}>
              <input id="al-email" type="email" className={inputCls} onBlur={blur('email')} value={a.email.to} onChange={(e) => form.patch({ email: { to: e.target.value } })} placeholder="you@example.com" />
            </Field>
          </Card>

          <Card title="WhatsApp" subtitle="Free through CallMeBot. Setup takes about two minutes.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Your WhatsApp number" htmlFor="wa-phone" hint="With country code, for example +923001234567.">
                <input id="wa-phone" className={inputCls} value={a.whatsapp.phone} onChange={(e) => form.patch({ whatsapp: { ...a.whatsapp, phone: e.target.value } })} />
              </Field>
              <Field label="CallMeBot API key" htmlFor="wa-key">
                <SecretInput
                  id="wa-key"
                  autoComplete="off"
                  value={a.whatsapp.apikey}
                  onChange={(e) => form.patch({ whatsapp: { ...a.whatsapp, apikey: e.target.value } })}
                />
              </Field>
            </div>
            <p className="mt-2 text-xs text-fg-subtle">
              Follow the short setup steps on callmebot.com for WhatsApp. It gives you the API key after you send its bot one message.
            </p>
          </Card>

          <Card title="Send a test alert">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="sm:w-56">
                <Field label="Where to test" htmlFor="al-channel">
                  <select id="al-channel" className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                    <option value="all">Every channel I set up</option>
                    <option value="discord">Discord</option>
                    <option value="telegram">Telegram</option>
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
