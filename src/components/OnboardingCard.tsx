"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadSettings } from '@/lib/settings';
import { useShell } from './AppShell';
import { CheckIcon, ChevronIcon } from './Icons';
import { ProgressBar, cx } from './ui';

const DISMISS_KEY = 'lead-radar:onboarding-dismissed:v1';
const OPEN_KEY = 'lead-radar:onboarding-open:v1';

type Step = { id: string; title: string; text: string; href?: string; done: boolean; optional?: boolean };

/** Collapsible "Setup progress" banner: one slim row by default, expanded state remembered. */
export default function OnboardingCard() {
  const { workerOnline } = useShell();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [openPref, setOpenPref] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
      const o = localStorage.getItem(OPEN_KEY);
      if (o === '1' || o === '0') setOpenPref(o === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { values, error } = await loadSettings(['profile', 'profile_summary', 'sending', 'smtp', 'resend', 'imap', 'alerts', 'trading']);
      if (cancelled || error) return;
      const { profile, profile_summary: summary, sending, smtp, resend, imap, alerts, trading } = values;
      const hasLinks = profile.websites.some((w) => w.trim()) || profile.links.some((l) => l.trim());
      const emailReady =
        sending.from_email.trim() !== '' &&
        ((sending.provider === 'smtp' && smtp.host.trim() !== '') || (sending.provider === 'resend' && resend.api_key.trim() !== ''));
      const alertsReady =
        alerts.enabled &&
        (alerts.discord.webhook_url || (alerts.telegram.bot_token && alerts.telegram.chat_id) || alerts.email.to || (alerts.whatsapp.phone && alerts.whatsapp.apikey));
      setSteps([
        {
          id: 'profile',
          title: 'Tell me about you',
          text: profile.your_name && hasLinks ? 'Press "Learn from my links" so I can read your sites.' : 'Add your name, website and social links, then press "Learn from my links".',
          href: '/settings#profile',
          done: !!profile.your_name.trim() && hasLinks && !!summary.generated_at,
        },
        {
          id: 'trading',
          title: 'Tell me what you sell or want',
          text: 'Optional. Add game accounts, boosting or top-ups you sell or want to buy, and I find buyers and sellers.',
          href: '/trading/catalog',
          done: trading.enabled && trading.i_sell.length + trading.i_want.length > 0,
          optional: true,
        },
        {
          id: 'email',
          title: 'Connect email sending',
          text: 'Add SMTP details or a Resend key so one click can send a pitch.',
          href: '/settings#email',
          done: emailReady,
        },
        {
          id: 'inbox',
          title: 'Connect your inbox for replies',
          text: 'Optional. Lets me spot replies and move leads to "Replied" for you.',
          href: '/settings#replies',
          done: imap.enabled && imap.host.trim() !== '' && imap.user.trim() !== '',
          optional: true,
        },
        {
          id: 'alerts',
          title: 'Turn on instant alerts',
          text: 'Optional. Get a message the moment a strong lead arrives.',
          href: '/settings#alerts',
          done: !!alertsReady,
          optional: true,
        },
      ]);
    };
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!steps || dismissed) return null;

  const all: Step[] = [
    ...steps,
    {
      id: 'worker',
      title: 'Start the worker',
      text: 'Run npm run worker in the project folder and leave the window open. It does the checking, writing and sending.',
      done: workerOnline,
    },
  ];
  const required = all.filter((s) => !s.optional);
  if (required.every((s) => s.done)) return null;
  const doneCount = all.filter((s) => s.done).length;
  const open = openPref ?? false;

  const toggle = () => {
    setOpenPref(!open);
    try {
      localStorage.setItem(OPEN_KEY, open ? '0' : '1');
    } catch {
      // storage unavailable, the choice just is not remembered
    }
  };

  return (
    <section aria-label="Setup progress" className="glass rounded-card border border-primary-border/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="setup-steps"
          className="btn -ml-1 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-ctl px-1 py-1 text-left coarse:min-h-11"
        >
          <ChevronIcon className={cx('h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-fast', open && 'rotate-180')} aria-hidden="true" />
          <span className="text-sm font-semibold text-fg">Setup progress</span>
          <span className="font-num text-sm text-fg-muted">
            {doneCount}/{all.length}
          </span>
        </button>
        <ProgressBar value={doneCount} max={all.length} label="Setup progress" className="w-28 sm:w-40" />
        <button
          type="button"
          onClick={toggle}
          className="btn btn-secondary inline-flex min-h-8 cursor-pointer items-center rounded-ctl px-3 py-1 text-[13px] font-medium coarse:min-h-11"
        >
          {open ? 'Close steps' : 'Continue setup'}
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, '1');
            } catch {
              // storage unavailable, the card just returns next visit
            }
          }}
          className="btn cursor-pointer rounded-ctl px-2 py-1 text-[13px] font-medium text-fg-subtle hover:bg-surface-2 hover:text-fg coarse:min-h-11"
        >
          Hide
        </button>
      </div>
      {open && (
        <ol id="setup-steps" className="grid gap-2 border-t border-border px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
          {all.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3 rounded-ctl bg-surface-2/60 p-3 ring-1 ring-inset ring-border">
              <span
                className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.done ? 'bg-success-solid text-white' : 'bg-surface text-fg-subtle ring-1 ring-inset ring-border-strong')}
                aria-hidden="true"
              >
                {s.done ? <CheckIcon className="h-4 w-4" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">
                  {s.title}
                  {s.optional && <span className="ml-1 text-xs font-normal text-fg-subtle">(optional)</span>}
                  <span className="sr-only">{s.done ? ', done' : ', not done yet'}</span>
                </p>
                <p className="text-xs text-fg-subtle">{s.text}</p>
                {s.href && !s.done && (
                  <Link href={s.href} className="mt-1 inline-block text-xs font-semibold text-primary-text hover:underline">
                    Open settings
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
