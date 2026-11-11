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
const SRC_WORD = { fresh: 'Healthy', slow: 'Slowing', stale: 'Quiet', manual: 'Manual' } as const;

function SourceRow({ s }: { s: SourceHealth }) {
  const lvl = SRC_LEVEL[s.state];
  return (
    <li className="flex items-center gap-3 rounded-ctl bg-surface-2/60 px-3 py-2">
      <Dot level={lvl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{s.name}</p>
        <p className="truncate text-xs text-fg-subtle">
          Last lead {hoursText(s.hoursAgo)} · <span className="font-num">{s.count24h}</span> in 24 h
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
    <Panel title="Source health" subtitle={stale ? `${stale} source${stale === 1 ? ' has' : 's have'} gone quiet` : 'Where your leads come from'} href="/sources" linkLabel="Sources">
      <div className="space-y-1.5">
        <Line level={n8nSeen ? (n8nUp ? 'ok' : 'bad') : 'off'} name="n8n scrapers" value={n8nSeen ? (n8nUp ? 'Online' : 'Offline') : 'Not seen yet'} hint={n8nSeen ? `Heartbeat ${timeAgo(n8nSeen)}${raw.n8n.last_error ? ` · last error in ${raw.n8n.last_error.workflow || 'a workflow'}` : ''}` : 'Start n8n so the feeds can run'} />
        <Line level={workerUp ? 'ok' : 'bad'} name="Worker" value={workerUp ? 'Online' : 'Offline'} hint={w ? `Last seen ${timeAgo(w)}` : 'Run npm run worker'} />
      </div>
      {health.length === 0 ? (
        <div className="mt-3">
          <PanelEmpty icon={<SourcesIcon className="h-5 w-5" />} title="No sources have delivered yet" text="When a feed finds its first lead it shows up here with its freshness." action={<Link href="/sources" className={buttonClass('secondary', 'sm')}>Open sources</Link>} />
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
              {all ? 'Show fewer' : `Show all ${health.length} sources`}
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
  if (raw.settings.trading.discord.enabled && !i.discord.bot_token.trim()) out.push('Discord');
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
        <Line level={up ? 'ok' : 'bad'} name="Worker" value={up ? 'Running' : 'Stopped'} hint={up ? 'Checks, writes and sends for you' : 'Run npm run worker to start it'} />
        <Line level={!up ? 'off' : claude ? 'ok' : 'warn'} name="Claude CLI" value={!up ? 'Unknown' : claude ? 'Ready' : 'Not found'} hint={claude ? 'Pitches written with your Claude plan' : 'Pitches use simple templates'} />
        <Line level={n8nSeen ? (n8nOnline(raw) ? 'ok' : 'bad') : 'off'} name="n8n" value={n8nSeen ? (n8nOnline(raw) ? 'Online' : 'Offline') : 'Not seen'} hint={raw.n8n.errors_total ? `${raw.n8n.errors_total} workflow error${raw.n8n.errors_total === 1 ? '' : 's'} so far` : undefined} />
        <Line
          level={sending.provider === 'none' ? 'warn' : sending.paused ? 'warn' : 'ok'}
          name="Email sending"
          value={sending.provider === 'none' ? 'Not set up' : sending.paused ? 'Paused' : 'On'}
          hint={sending.paused ? 'Nothing is sent until you resume' : sending.provider === 'none' ? 'Add SMTP or Resend to send pitches' : `Up to ${sending.daily_limit} a day`}
          href={sending.provider === 'none' || sending.paused ? '/settings#email' : undefined}
        />
        <Line level={needs.length ? 'warn' : 'ok'} name="Integrations" value={needs.length ? `${needs.length} need a key` : 'All set'} hint={needs.length ? needs.join(', ') : undefined} href={needs.length ? '/settings#connections' : undefined} />
      </div>
    </Panel>
  );
}

const KEY = 'lr:dash-setup-hidden';

export function SetupCard({ raw, workerOnline }: { raw: DashRaw; workerOnline: boolean }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === '1');
    } catch {
      setHidden(false);
    }
  }, []);
  const steps = setupSteps(raw.settings, workerSeenOnline(raw, workerOnline));
  const required = steps.filter((s) => !s.optional);
  if (hidden || required.every((s) => s.done)) return null;
  const done = steps.filter((s) => s.done).length;
  const next = steps.filter((s) => !s.done);
  return (
    <Panel
      title="Finish setting up"
      subtitle={`${done} of ${steps.length} done`}
      aside={
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(KEY, '1');
            } catch {
              // returns next visit
            }
          }}
          className="min-h-[28px] rounded-ctl px-1.5 text-[13px] font-medium text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [@media(pointer:coarse)]:min-h-[44px]"
        >
          Hide
        </button>
      }
    >
      <ProgressBar value={done} max={steps.length} label={`Setup progress, ${done} of ${steps.length} steps`} tone="primary" />
      <ul className="mt-3 space-y-1.5">
        {steps.map((s) => {
          const body = (
            <>
              <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', s.done ? 'bg-success-solid text-white' : 'bg-surface-2 text-fg-subtle ring-1 ring-inset ring-border-strong')} aria-hidden="true">
                {s.done && <CheckIcon className="h-3.5 w-3.5" />}
              </span>
              <span className={cx('min-w-0 flex-1 truncate text-sm', s.done ? 'text-fg-subtle line-through' : 'font-medium text-fg')}>{s.title}</span>
              {s.optional && !s.done && <Badge tone="neutral">Optional</Badge>}
              <span className="sr-only">{s.done ? 'done' : 'not done yet'}</span>
            </>
          );
          const cls = 'flex min-h-[32px] items-center gap-2.5 rounded-ctl px-1';
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
      {next[0] && <p className="mt-2 text-xs text-fg-subtle">Next: {next[0].text}</p>}
    </Panel>
  );
}

export type { Tone };
