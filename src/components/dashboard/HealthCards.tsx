"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckIcon, SourcesIcon } from '@/components/Icons';
import { Badge, ProgressBar, buttonClass, cx, type Tone } from '@/components/ui';
import { setupSteps, type DashModel, type DashRaw, type SourceHealth } from '@/lib/dashboard-data';
import { timeAgo } from '@/lib/format';
import { Panel, PanelEmpty } from './Panel';

const N8N_OFFLINE_MS = 15 * 60_000;
const WORKER_OFFLINE_MS = 2 * 60_000;
const age = (iso: string | null) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);

export function n8nOnline(raw: DashRaw): boolean {
  return age(raw.n8n.last_seen) <= N8N_OFFLINE_MS;
}
export function workerSeenOnline(raw: DashRaw, shellOnline: boolean): boolean {
  return shellOnline || age(raw.settings.worker_status.last_seen) <= WORKER_OFFLINE_MS;
}

const DOT: Record<string, string> = { ok: 'bg-success-solid', warn: 'bg-warning-solid', bad: 'bg-danger-solid', off: 'bg-fg-subtle' };
const STATE_TEXT: Record<string, string> = { ok: 'text-success', warn: 'text-warning', bad: 'text-danger', off: 'text-fg-subtle' };

function Dot({ level }: { level: 'ok' | 'warn' | 'bad' | 'off' }) {
  return <span className={cx('h-2 w-2 shrink-0 rounded-full', DOT[level])} aria-hidden="true" />;
}

function Line({ level, name, value, hint, href }: { level: 'ok' | 'warn' | 'bad' | 'off'; name: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <Dot level={level} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{name}</p>
        {hint && <p className="truncate text-xs text-fg-subtle">{hint}</p>}
      </div>
      <span className={cx('shrink-0 text-[13px] font-medium', STATE_TEXT[level])}>{value}</span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-ctl bg-surface-2/60 px-3 py-2';
  return href ? (
    <Link href={href} className={cx(cls, 'transition-colors duration-fast hover:bg-surface-2')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function hoursText(h: number | null): string {
  if (h == null) return 'never';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const SRC_LEVEL = { fresh: 'ok', slow: 'warn', stale: 'bad', manual: 'off' } as const;
const SRC_WORD = { fresh: 'Working', slow: 'Slow', stale: 'Quiet', manual: 'Manual' } as const;

function SourceRow({ s }: { s: SourceHealth }) {
  const lvl = SRC_LEVEL[s.state];
  return (
    <li className="flex items-center gap-3 rounded-ctl bg-surface-2/60 px-3 py-2">
      <Dot level={lvl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{s.name}</p>
        <p className="truncate text-xs text-fg-subtle">
          Last lead {hoursText(s.hoursAgo)} · <span className="font-num">{s.count24h}</span> today
        </p>
      </div>
      <span className={cx('shrink-0 text-[13px] font-medium', STATE_TEXT[lvl])}>{SRC_WORD[s.state]}</span>
    </li>
  );
}

export function SourceHealthCard({ health, raw, workerOnline }: { health: DashModel['health']; raw: DashRaw; workerOnline: boolean }) {
  const [all, setAll] = useState(false);
  const n8nUp = n8nOnline(raw);
  const n8nSeen = raw.n8n.last_seen;
  const shown = all ? health : health.slice(0, 6);
  const stale = health.filter((h) => h.state === 'stale').length;
  const workerUp = workerSeenOnline(raw, workerOnline);
  const w = raw.settings.worker_status.last_seen;
  return (
    <Panel title="Where leads come from" subtitle={stale ? `${stale} place${stale === 1 ? ' has' : 's have'} gone quiet` : 'Is each lead finder working?'} href="/sources" linkLabel="Sources">
      <div className="space-y-1.5">
        <Line level={n8nSeen ? (n8nUp ? 'ok' : 'bad') : 'off'} name="Lead finders" value={n8nSeen ? (n8nUp ? 'Working' : 'Offline') : 'Not seen yet'} hint={n8nSeen ? `Last check-in ${timeAgo(n8nSeen)}${raw.n8n.last_error ? ` · last problem in ${raw.n8n.last_error.workflow || 'a finder'}` : ''}` : 'Start n8n so the lead finders can run'} />
        <Line level={workerUp ? 'ok' : 'bad'} name="Background helper" value={workerUp ? 'Running' : 'Offline'} hint={w ? `Last seen ${timeAgo(w)}` : 'Start it: run npm run worker'} />
      </div>
      {health.length === 0 ? (
        <div className="mt-3">
          <PanelEmpty icon={<SourcesIcon className="h-5 w-5" />} title="No leads found yet" text="When a lead finder brings its first lead it shows up here." action={<Link href="/sources" className={buttonClass('secondary', 'sm')}>Open Sources</Link>} />
        </div>
      ) : (
        <>
          <ul className="mt-1.5 space-y-1.5">
            {shown.map((s) => (
              <SourceRow key={s.name} s={s} />
            ))}
          </ul>
          {health.length > 6 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 inline-flex min-h-[32px] items-center text-[13px] font-medium text-primary-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [@media(pointer:coarse)]:min-h-[44px]">
              {all ? 'Show fewer' : `Show all ${health.length}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

function keysNeeded(raw: DashRaw): string[] {
  const i = raw.settings.integrations;
  const out: string[] = [];
  if (i.serper.enabled && !i.serper.api_key.trim()) out.push('Google (Serper)');
  if (i.x.enabled && !i.x.bearer_token.trim()) out.push('X');
  if (i.reddit_api.enabled && !i.reddit_api.client_id.trim()) out.push('Reddit API');
  return out;
}

export function SystemCard({ raw, workerOnline }: { raw: DashRaw; workerOnline: boolean }) {
  const up = workerSeenOnline(raw, workerOnline);
  const claude = raw.settings.worker_status.claude.available;
  const sending = raw.settings.sending;
  const needs = keysNeeded(raw);
  const n8nSeen = raw.n8n.last_seen;
  return (
    <Panel title="System status" subtitle="Is everything running?" href="/settings" linkLabel="Settings">
      <div className="space-y-1.5">
        <Line level={up ? 'ok' : 'bad'} name="Background helper" value={up ? 'Running' : 'Offline'} hint={up ? 'Checks, writes and sends for you' : 'Start it: run npm run worker'} />
        <Line level={!up ? 'off' : claude ? 'ok' : 'warn'} name="AI writer" value={!up ? 'Unknown' : claude ? 'Ready' : 'Needs a key'} hint={claude ? 'Messages are written by the AI you chose in Settings' : 'No AI key yet, so messages use simple templates (Settings > AI writer)'} />
        <Line level={n8nSeen ? (n8nOnline(raw) ? 'ok' : 'bad') : 'off'} name="Lead finders (n8n)" value={n8nSeen ? (n8nOnline(raw) ? 'Working' : 'Offline') : 'Not seen'} hint={raw.n8n.errors_total ? `${raw.n8n.errors_total} problem${raw.n8n.errors_total === 1 ? '' : 's'} so far` : undefined} />
        <Line
          level={sending.provider === 'none' ? 'warn' : sending.paused ? 'warn' : 'ok'}
          name="Email sending"
          value={sending.provider === 'none' ? 'Not set up' : sending.paused ? 'Paused' : 'On'}
          hint={sending.paused ? 'Nothing is sent until you resume' : sending.provider === 'none' ? 'Add an email account or email service to send messages' : `Up to ${sending.daily_limit} a day`}
          href={sending.provider === 'none' || sending.paused ? '/settings#email' : undefined}
        />
        <Line level={needs.length ? 'warn' : 'ok'} name="Connected services" value={needs.length ? `${needs.length} need a key` : 'All set'} hint={needs.length ? needs.join(', ') : undefined} href={needs.length ? '/settings#connections' : undefined} />
      </div>
    </Panel>
  );
}

const SETUP_OPEN_KEY = 'lr:dash-setup-open';

/** The one place for the full setup checklist. Open while required steps are missing, a single quiet line once they are done. */
export function SetupCard({ raw, workerOnline }: { raw: DashRaw; workerOnline: boolean }) {
  const steps = setupSteps(raw.settings, workerSeenOnline(raw, workerOnline));
  const required = steps.filter((s) => !s.optional);
  const requiredDone = required.every((s) => s.done);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.optional) ?? steps.find((s) => !s.done);
  const [pref, setPref] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(SETUP_OPEN_KEY);
      if (v === '1' || v === '0') setPref(v === '1');
    } catch {
      // default
    }
  }, []);
  if (done === steps.length) return null;
  const open = pref ?? !requiredDone;
  const toggle = () => {
    setPref(!open);
    try {
      localStorage.setItem(SETUP_OPEN_KEY, open ? '0' : '1');
    } catch {
      // not remembered
    }
  };
  return (
    <section aria-label="Finish setting up" className={cx('glass rounded-card', !requiredDone && 'border-l-2 !border-l-primary')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-fg">Finish setting up</h2>
          <p className="truncate text-[13px] text-fg-muted">
            {done} of {steps.length} done{next ? ` · Next: ${next.title}` : ''}
          </p>
        </div>
        <div className="hidden w-32 sm:block">
          <ProgressBar value={done} max={steps.length} label={`Setup progress, ${done} of ${steps.length} steps`} tone="primary" />
        </div>
        {next?.href && !open && (
          <Link href={next.href} className={buttonClass('secondary', 'sm')}>
            Do next step
          </Link>
        )}
        <button type="button" onClick={toggle} aria-expanded={open} className="min-h-[32px] rounded-ctl px-2 text-[13px] font-medium text-primary-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [@media(pointer:coarse)]:min-h-[44px]">
          {open ? 'Hide steps' : 'Show steps'}
        </button>
      </div>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 sm:px-5">
          <ul className="grid gap-1.5 md:grid-cols-2 [&>li]:min-w-0">
            {steps.map((s) => {
              const body = (
                <>
                  <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', s.done ? 'bg-success-solid text-white' : 'bg-surface-2 text-fg-subtle ring-1 ring-inset ring-border-strong')} aria-hidden="true">
                    {s.done && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-sm', s.done ? 'text-fg-subtle line-through' : 'font-medium text-fg')}>{s.title}</span>
                    {!s.done && <span className="block truncate text-xs text-fg-subtle">{s.text}</span>}
                  </span>
                  {s.optional && !s.done && <Badge tone="neutral" className="shrink-0">Optional</Badge>}
                  <span className="sr-only">{s.done ? 'done' : 'not done yet'}</span>
                </>
              );
              const cls = 'flex min-h-[40px] min-w-0 items-center gap-2.5 rounded-ctl px-2 py-1';
              return (
                <li key={s.id}>
                  {s.href && !s.done ? (
                    <Link href={s.href} className={cx(cls, 'hover:bg-surface-2')}>
                      {body}
                    </Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

export type { Tone };
