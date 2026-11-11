"use client";

import { useEffect, useState } from 'react';
import { loadSetting, loadSettings } from '@/lib/settings';
import type { SettingsTabId } from '@/lib/settings-nav';
import { cx, pill } from '../ui';

export type Health = 'ready' | 'setup' | 'problem';

const TONE: Record<Health, string> = {
  ready: 'bg-success-soft text-success ring-success-border',
  setup: 'bg-warning-soft text-warning ring-warning-border',
  problem: 'bg-danger-soft text-danger ring-danger-border',
};
const LABEL: Record<Health, string> = { ready: 'Ready', setup: 'Needs setup', problem: 'Problem' };

export function HealthChip({ health, className }: { health: Health; className?: string }) {
  return (
    <span className={cx(pill, TONE[health], className)}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABEL[health]}
    </span>
  );
}

/** Inline result chip for a "Test" button: running, passed or failed, with the message beside it. */
export function ResultChip({ state, message }: { state: 'running' | 'ok' | 'bad'; message?: string }) {
  const tone = state === 'ok' ? TONE.ready : state === 'bad' ? TONE.problem : 'bg-surface-2 text-fg-muted ring-border';
  const text = state === 'running' ? 'Checking' : state === 'ok' ? 'Passed' : 'Failed';
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2" role="status" aria-live="polite">
      <span className={cx(pill, tone)}>{text}</span>
      {message && <span className={cx('min-w-0 break-words text-sm', state === 'bad' ? 'text-danger' : 'text-fg-muted')}>{message}</span>}
    </span>
  );
}

type Report = { health: Health; note: string };

/** Works out Ready / Needs setup / Problem for each integration tab from the saved settings. */
export function useHealth(): Partial<Record<SettingsTabId, Report>> {
  const [reports, setReports] = useState<Partial<Record<SettingsTabId, Report>>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ values, error }, st] = await Promise.all([loadSettings(['sending', 'smtp', 'resend', 'imap', 'alerts', 'integrations']), loadSetting('imap_state')]);
      if (cancelled || error) return;
      const { sending, smtp, resend, imap, alerts, integrations } = values;
      const out: Partial<Record<SettingsTabId, Report>> = {};

      const emailOk = sending.from_email.trim() !== '' && ((sending.provider === 'smtp' && smtp.host.trim() !== '') || (sending.provider === 'resend' && resend.api_key.trim() !== ''));
      out.email = emailOk ? { health: 'ready', note: 'Emails can be sent when you press Send now.' } : { health: 'setup', note: 'Pick how emails are sent and add a From address. You can still write and copy pitches meanwhile.' };

      const imapOk = imap.enabled && imap.host.trim() !== '' && imap.user.trim() !== '' && imap.pass.trim() !== '';
      if (!st.error && st.value.last_error) out.imap = { health: 'problem', note: `The last inbox check failed: ${st.value.last_error}` };
      else out.imap = imapOk ? { health: 'ready', note: 'Replies are being watched.' } : { health: 'setup', note: 'Add your inbox details so I can spot replies.' };

      const alertsOk = !!(alerts.discord.webhook_url || alerts.email.to || (alerts.telegram.bot_token && alerts.telegram.chat_id) || (alerts.whatsapp.phone && alerts.whatsapp.apikey));
      out.alerts = alertsOk && alerts.enabled ? { health: 'ready', note: 'Alerts are on.' } : { health: 'setup', note: alertsOk ? 'A channel is set up but alerts are switched off.' : 'Add a channel to get alerts.' };

      const sources = [integrations.serper, integrations.x, integrations.reddit_api, integrations.upwork_inbox];
      const statuses = Object.values(integrations.status ?? {});
      const anyBad = statuses.some((s) => s && s.ok === false);
      const anyOn = sources.some((s) => s && 'enabled' in s && s.enabled);
      out.connections = anyBad ? { health: 'problem', note: 'At least one connection failed its last test.' } : anyOn ? { health: 'ready', note: 'Your switched-on connections have no known problems.' } : { health: 'setup', note: 'No connection is switched on yet.' };

      setReports(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return reports;
}
