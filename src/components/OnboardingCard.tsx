"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadSettings } from '@/lib/settings';
import { useShell } from './AppShell';

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
        (alerts.email.to || (alerts.whatsapp.phone && alerts.whatsapp.apikey));
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

  const required = [...steps.filter((s) => !s.optional), { id: 'worker', done: workerOnline }];
  if (required.every((s) => s.done)) return null;
  const left = required.filter((s) => !s.done).length;
  void openPref;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-fg-muted" role="note">
      <span>
        Setup is not finished yet ({left} step{left === 1 ? '' : 's'} left).
      </span>
      <Link href="/" className="font-medium text-primary-text hover:underline">
        Finish it on the dashboard
      </Link>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(DISMISS_KEY, '1');
          } catch {
            // storage unavailable, the hint just returns next visit
          }
        }}
        className="btn cursor-pointer rounded-ctl px-1.5 py-0.5 text-[13px] text-fg-subtle hover:bg-surface-2 hover:text-fg"
      >
        Hide
      </button>
    </p>
  );
}
