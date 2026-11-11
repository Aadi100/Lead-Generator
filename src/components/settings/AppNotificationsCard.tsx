"use client";

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useJob } from '@/lib/jobs';
import { useShell } from '../AppShell';
import { Badge, Card, JobNote, Spinner, Toggle, btnPrimary, btnSecondary, cx } from '../ui';

type Device = { id: string; endpoint: string; label: string | null; user_agent: string | null; created_at: string; last_used_at: string | null };
type PushCfg = { public_key: string; enabled: boolean; events: Record<string, boolean> };
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const EVENTS: { id: string; label: string; hint: string }[] = [
  { id: 'new_lead', label: 'New strong lead', hint: 'A lead that passes your alert trust threshold.' },
  { id: 'reply', label: 'New reply', hint: 'Someone answered one of your emails.' },
  { id: 'task_due', label: 'Task due', hint: 'A task reaches its due time.' },
  { id: 'send_failed', label: 'Send failed', hint: 'An email could not be sent.' },
];

const DEFAULT_CFG: PushCfg = { public_key: '', enabled: true, events: { new_lead: true, reply: true, task_due: true, send_failed: true } };

function b64ToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const toB64 = (buf: ArrayBuffer | null): string => (buf ? btoa(Array.from(new Uint8Array(buf), (c) => String.fromCharCode(c)).join("")) : '');

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} ${br}`;
}

function when(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AppNotificationsCard() {
  const { pushToast } = useShell();
  const test = useJob();
  const [cfg, setCfg] = useState<PushCfg>(DEFAULT_CFG);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [secure, setSecure] = useState(true);
  const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  const supported = perm !== 'unsupported';

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'push').maybeSingle(),
      supabase.from('push_subscriptions').select('id,endpoint,label,user_agent,created_at,last_used_at').order('created_at', { ascending: false }),
    ]);
    const v = (s.data?.value ?? {}) as Partial<PushCfg>;
    setCfg({ public_key: typeof v.public_key === 'string' ? v.public_key : '', enabled: v.enabled !== false, events: { ...DEFAULT_CFG.events, ...(v.events ?? {}) } });
    setDevices((d.data ?? []) as Device[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    setSecure(window.isSecureContext);
    setPerm('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? Notification.permission : 'unsupported');
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      void navigator.serviceWorker.getRegistration('/sw.js').then((r) => r?.pushManager.getSubscription()).then((s) => setThisEndpoint(s?.endpoint ?? null)).catch(() => undefined);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [load]);

  const saveCfg = async (patch: Partial<Pick<PushCfg, 'enabled' | 'events'>>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'push').maybeSingle();
    const cur = (data?.value ?? {}) as Record<string, unknown>;
    const { error } = await supabase.from('app_settings').upsert({ key: 'push', value: { ...cur, enabled: next.enabled, events: next.events }, updated_at: new Date().toISOString() });
    if (error) pushToast('error', `Could not save: ${error.message}`);
  };

  const install = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    await installEvt.userChoice.catch(() => undefined);
    setInstallEvt(null);
  };

  const enable = async () => {
    setBusy(true);
    try {
      if (!cfg.public_key) throw new Error('Push keys are not set up yet. Run node scripts/gen-vapid.mjs once, then reload.');
      const reg = (await navigator.serviceWorker.getRegistration('/sw.js')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      setPerm(permission);
      if (permission !== 'granted') throw new Error('Notifications were not allowed. You can allow them in the browser site settings.');
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.public_key) as BufferSource }));
      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh ?? toB64(sub.getKey('p256dh'));
      const auth = json.keys?.auth ?? toB64(sub.getKey('auth'));
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({ endpoint: sub.endpoint, p256dh, auth, user_agent: navigator.userAgent.slice(0, 300), label: deviceLabel(), enabled: true }, { onConflict: 'endpoint' });
      if (error) throw new Error(error.message);
      setThisEndpoint(sub.endpoint);
      await load();
      pushToast('success', 'Notifications are on for this device.');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: Device) => {
    if (d.endpoint === thisEndpoint) {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
      setThisEndpoint(null);
    }
    const { error } = await supabase.from('push_subscriptions').delete().eq('id', d.id);
    if (error) pushToast('error', error.message);
    else setDevices((x) => x.filter((y) => y.id !== d.id));
  };

  const thisDeviceOn = !!thisEndpoint && devices.some((d) => d.endpoint === thisEndpoint);

  return (
    <Card title="App & notifications" subtitle="Install Lead Radar like an app and get a push when something needs you.">
      <div className="space-y-6">
        {/* Install */}
        <section className="space-y-2" aria-labelledby="pwa-install">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="pwa-install" className="text-sm font-semibold text-fg">Install app</h3>
            {installed && <Badge tone="success">Installed</Badge>}
          </div>
          {installed ? (
            <p className="text-sm text-fg-muted">You are using the installed app.</p>
          ) : installEvt ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={install} className={btnPrimary}>Install app</button>
              <span className="text-xs text-fg-subtle">Opens in its own window, no browser bar.</span>
            </div>
          ) : ios ? (
            <p className="text-sm text-fg-muted">On iPhone or iPad: open this page in Safari, tap the Share button, choose <strong className="text-fg">Add to Home Screen</strong>, then open Lead Radar from your home screen. Notifications only work from the home screen app (iOS 16.4 or newer).</p>
          ) : (
            <p className="text-sm text-fg-muted">
              {secure
                ? 'Use your browser menu: "Install Lead Radar" (Chrome, Edge) or "Add to Home screen" (Android). If you do not see it, the app may already be installed.'
                : 'Installing needs a secure (https) address. On localhost it works only on this computer; on a phone the dashboard must be deployed over https.'}
            </p>
          )}
        </section>

        {/* Notifications */}
        <section className="space-y-3" aria-labelledby="pwa-push">
          <h3 id="pwa-push" className="text-sm font-semibold text-fg">Notifications</h3>
          {loading ? (
            <p className="text-sm text-fg-subtle">Loading…</p>
          ) : !supported || !secure ? (
            <p className="text-sm text-fg-muted">
              {!secure
                ? 'Push notifications need a secure (https) address, or localhost on this computer. A phone cannot reach localhost, so deploy the dashboard first.'
                : ios && !installed
                  ? 'On iPhone, add Lead Radar to your Home Screen first (see above), then open it from there to turn notifications on.'
                  : 'This browser does not support push notifications.'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                {thisDeviceOn ? (
                  <Badge tone="success">On for this device</Badge>
                ) : (
                  <button type="button" onClick={enable} disabled={busy || perm === 'denied'} className={btnPrimary}>
                    {busy && <Spinner />} Enable notifications on this device
                  </button>
                )}
                {perm === 'denied' && <span className="text-xs text-danger">Blocked in the browser. Allow notifications for this site, then try again.</span>}
                <button
                  type="button"
                  disabled={!devices.length || test.running}
                  onClick={() => void test.start('push_test')}
                  className={btnSecondary}
                >
                  Send test notification
                </button>
              </div>
              <JobNote phase={test.phase} error={test.error} runningText="Sending through the worker…" doneText="Test sent. It should appear in a moment." />

              <div className="space-y-3 pt-1">
                <Toggle id="push-on" checked={cfg.enabled} onChange={(v) => void saveCfg({ enabled: v })} label="Send push notifications" description="Master switch for all devices." />
                <div className={cx('space-y-3', !cfg.enabled && 'opacity-50')}>
                  {EVENTS.map((ev) => (
                    <Toggle
                      key={ev.id}
                      id={`push-${ev.id}`}
                      checked={cfg.events[ev.id] !== false}
                      onChange={(v) => void saveCfg({ events: { ...cfg.events, [ev.id]: v } })}
                      label={ev.label}
                      description={ev.hint}
                    />
                  ))}
                </div>
                <p className="text-xs text-fg-subtle">Notifications are sent by the worker, so it must be running. Titles are short and never include contact details.</p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">Devices</p>
                {devices.length === 0 ? (
                  <p className="text-sm text-fg-subtle">No device yet.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-card border border-border">
                    {devices.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg">
                            {d.label || 'Device'} {d.endpoint === thisEndpoint && <span className="text-xs font-normal text-fg-subtle">(this device)</span>}
                          </p>
                          <p className="text-xs text-fg-subtle">Added {when(d.created_at)} · last push {when(d.last_used_at)}</p>
                        </div>
                        <button type="button" onClick={() => void remove(d)} className={cx(btnSecondary, 'shrink-0')} aria-label={`Remove ${d.label || 'device'}`}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Card>
  );
}
