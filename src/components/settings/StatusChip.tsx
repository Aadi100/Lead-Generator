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
const LABEL: Record<Health, string> = { ready: 'Working', setup: 'Not set up yet', problem: 'Problem' };

/** Status chip with a plain-words label (never a bare dot). */
export function HealthChip({ health, label, className }: { health: Health; label?: string; className?: string }) {
  return (
    <span className={cx(pill, TONE[health], 'max-w-full', className)}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{label ?? LABEL[health]}</span>
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

export type Report = { health: Health; /** Short chip text, e.g. 'Needs a key' */ label: string; note: string };

/** Works out the status of each tab from the saved settings, with short plain labels. */
export function useHealth(): Partial<Record<SettingsTabId, Report>> {
  const [reports, setReports] = useState<Partial<Record<SettingsTabId, Report>>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ values, error }, st] = await Promise.all([
        loadSettings(['profile', 'targeting', 'prospecting', 'sending', 'smtp', 'resend', 'imap', 'alerts', 'integrations']),
        loadSetting('imap_state'),
      ]);
      if (cancelled || error) return;
      const { profile, targeting, prospecting, sending, smtp, resend, imap, alerts, integrations } = values;
      const out: Partial<Record<SettingsTabId, Report>> = {};
      const short = (m: string) => (m.length > 40 ? `${m.slice(0, 38)}…` : m);

      const profileOk = profile.your_name.trim() !== '' && profile.services.length > 0;
      out.profile = profileOk
        ? { health: 'ready', label: 'Done', note: 'I know what you sell.' }
        : { health: 'setup', label: 'Not set up yet', note: 'Add your name and what you sell so messages sound like you.' };

      const targetOk = targeting.keywords.length > 0 || targeting.topics.length > 0;
      out.targeting = targetOk
        ? { health: 'ready', label: 'Done', note: 'Leads are ranked with your words.' }
        : { health: 'setup', label: 'Not set up yet', note: 'Add a few words describing the work you want.' };

      const emailOk = sending.from_email.trim() !== '' && ((sending.provider === 'smtp' && smtp.host.trim() !== '') || (sending.provider === 'resend' && resend.api_key.trim() !== ''));
      out.email = emailOk
        ? { health: 'ready', label: 'Working', note: 'Emails can be sent when you press Send now.' }
        : { health: 'setup', label: 'Not set up yet', note: 'Pick how emails are sent and add a From address. You can still write and copy messages meanwhile.' };

      const imapOk = imap.enabled && imap.host.trim() !== '' && imap.user.trim() !== '' && imap.pass.trim() !== '';
      if (!st.error && st.value.last_error) out.imap = { health: 'problem', label: `Problem: ${short(st.value.last_error)}`, note: `The last inbox check failed: ${st.value.last_error}` };
      else out.imap = imapOk ? { health: 'ready', label: 'Working', note: 'Replies are being watched.' } : { health: 'setup', label: 'Not set up yet', note: 'Add your inbox details so I can spot replies.' };

      const alertsOk = !!(alerts.email.to || (alerts.whatsapp.phone && alerts.whatsapp.apikey));
      out.alerts =
        alertsOk && alerts.enabled
          ? { health: 'ready', label: 'On', note: 'Alerts are on.' }
          : { health: 'setup', label: alertsOk ? 'Switched off' : 'Not set up yet', note: alertsOk ? 'Alerts are set up but switched off.' : 'Add a place to get alerts, such as email or WhatsApp.' };

      const sources = [integrations.serper, integrations.x, integrations.reddit_api, integrations.upwork_inbox];
      const hasKey: Record<string, boolean> = {
        serper: integrations.serper.api_key.trim() !== '',
        x: integrations.x.bearer_token.trim() !== '',
        reddit_api: integrations.reddit_api.client_id.trim() !== '' && integrations.reddit_api.client_secret.trim() !== '',
        producthunt: true,
        upwork_inbox: imap.enabled && imap.host.trim() !== '',
      };
      // Only count a failed test if the connection still has its key and is not switched off.
      const bad = Object.entries(integrations.status ?? {}).find(([name, s]) => {
        if (!s || s.ok !== false || !hasKey[name]) return false;
        const cfg = (integrations as unknown as Record<string, { enabled?: boolean } | undefined>)[name];
        return cfg?.enabled !== false;
      })?.[1];
      const anyOn = sources.some((s) => s && 'enabled' in s && s.enabled);
      const needsKey = integrations.serper.enabled && integrations.serper.api_key.trim() === '';
      out.connections = bad
        ? { health: 'problem', label: `Problem: ${short(bad.message || 'a test failed')}`, note: 'At least one connection failed its last test. Open it to see why.' }
        : needsKey || !anyOn
          ? { health: 'setup', label: 'Needs a key', note: 'Add a key for at least one service so I can find leads on the web.' }
          : { health: 'ready', label: 'Working', note: 'Your switched-on connections have no known problems.' };

      const pOk = prospecting.enabled && prospecting.cities.length > 0;
      out.prospecting = pOk
        ? { health: 'ready', label: 'On', note: 'Local businesses are searched on a schedule.' }
        : { health: 'setup', label: prospecting.enabled ? 'Add a city' : 'Switched off', note: 'Optional. Add a city and switch it on to find local businesses.' };

      setReports(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return reports;
}
