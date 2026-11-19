"use client";

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell';
import { Skeleton, cx } from '@/components/ui';
import { SETTINGS_GROUPS, SETTINGS_TABS, parseSettingsTab, settingsHref, type SettingsTabId } from '@/lib/settings-nav';
import ProfileTab from '@/components/settings/ProfileTab';
import TargetingTab from '@/components/settings/TargetingTab';
import ConnectionsTab from '@/components/settings/ConnectionsTab';
import EmailTab from '@/components/settings/EmailTab';
import RepliesTab from '@/components/settings/RepliesTab';
import AlertsTab from '@/components/settings/AlertsTab';
import ProspectingTab from '@/components/settings/ProspectingTab';
import WritingTab from '@/components/settings/WritingTab';
import SafetyTab from '@/components/settings/SafetyTab';
import AppearanceTab from '@/components/settings/AppearanceTab';
import DataTab from '@/components/settings/DataTab';
import ProposalsTab from '@/components/settings/ProposalsTab';
import TradingPointer, { StockPointer } from '@/components/settings/TradingPointer';
import { HealthChip, useHealth, type Report } from '@/components/settings/StatusChip';
import { CheckIcon } from '@/components/Icons';

function Panel({ tab }: { tab: SettingsTabId }) {
  switch (tab) {
    case 'profile':
      return <ProfileTab />;
    case 'targeting':
      return <TargetingTab />;
    case 'writing':
      return <WritingTab />;
    case 'email':
      return <EmailTab />;
    case 'imap':
      return <RepliesTab />;
    case 'safety':
      return <SafetyTab />;
    case 'connections':
      return <ConnectionsTab />;
    case 'alerts':
      return <AlertsTab />;
    case 'prospecting':
      return <ProspectingTab />;
    case 'trading':
      return (
        <div className="space-y-4">
          <TradingPointer />
          <StockPointer />
        </div>
      );
    case 'proposals':
      return <ProposalsTab />;
    case 'appearance':
      return <AppearanceTab />;
    case 'data':
      return <DataTab />;
  }
}

const SUMMARY_KEY = 'lr:settings-status-open';

/** Top summary: what is done and what is missing, each item opens the right tab. */
function SetupStatus({ health }: { health: Partial<Record<SettingsTabId, Report>> }) {
  const items = SETTINGS_TABS.filter((t) => health[t.id]);
  const missing = items.filter((t) => health[t.id]!.health !== 'ready');
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(SUMMARY_KEY);
      setOpen(v === null ? null : v === '1');
    } catch {
      setOpen(null);
    }
  }, []);
  if (items.length === 0) return <div className="glass h-14 animate-pulse rounded-card" aria-hidden="true" />;
  const isOpen = open ?? false;
  const toggle = () => {
    setOpen(!isOpen);
    try {
      localStorage.setItem(SUMMARY_KEY, isOpen ? '0' : '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <section aria-label="Setup status" className="glass mb-5 rounded-card px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-fg">Setup status</h2>
        <p className="min-w-0 flex-1 text-sm text-fg-muted">
          {missing.length === 0 ? 'Everything you need is set up.' : `${items.length - missing.length} of ${items.length} done. ${missing.length} still to do.`}
        </p>
        <button type="button" onClick={toggle} aria-expanded={isOpen} className="ctl rounded-ctl px-2 py-1 text-sm font-semibold text-primary-text hover:underline">
          {isOpen ? 'Hide' : 'Show'}
        </button>
      </div>
      {isOpen && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((t) => {
            const r = health[t.id]!;
            const done = r.health === 'ready';
            return (
              <li key={t.id}>
                <Link
                  href={settingsHref(t.id)}
                  replace
                  scroll={false}
                  className="ctl flex min-h-11 items-center gap-2.5 rounded-ctl bg-surface-2/60 px-3 py-2 transition-colors duration-fast hover:bg-surface-2"
                >
                  <span className={cx('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full', done ? 'bg-success-soft text-success' : r.health === 'problem' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                    {done ? <CheckIcon className="h-3.5 w-3.5" /> : <span aria-hidden="true" className="text-xs font-bold">!</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{t.label}</span>
                    <span className={cx('block truncate text-xs', done ? 'text-fg-subtle' : r.health === 'problem' ? 'text-danger' : 'text-warning')}>{r.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = parseSettingsTab(params.get('tab'));
  const health = useHealth();
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const current = SETTINGS_TABS.find((t) => t.id === tab);
  const label = current?.label ?? 'Settings';
  const report = health[tab];

  // Older links use /settings#email: honour them once, then move to ?tab=.
  useEffect(() => {
    if (params.get('tab')) return;
    const h = window.location.hash.replace('#', '');
    if (h) router.replace(settingsHref(parseSettingsTab(h)), { scroll: false });
  }, [params, router]);

  // Keep the active tab visible in the mobile strip.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tab]);

  return (
    <PageContainer>
      <PageHeader title="Settings" subtitle="Set up who you are, how leads are found, and how messages are sent." />

      <SetupStatus health={health} />

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-20">
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:block lg:space-y-4 lg:overflow-visible lg:px-0 lg:pb-0">
            {SETTINGS_GROUPS.map((g) => (
              <div key={g.label} className="flex shrink-0 items-center gap-1 lg:block">
                <p className="hidden px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle lg:block">{g.label}</p>
                <ul className="flex items-center gap-1 lg:block lg:space-y-0.5">
                  {g.tabs.map((t) => {
                    const on = t.id === tab;
                    const h = health[t.id];
                    return (
                      <li key={t.id} className="shrink-0">
                        <Link
                          ref={on ? activeRef : undefined}
                          href={settingsHref(t.id)}
                          replace
                          scroll={false}
                          aria-current={on ? 'page' : undefined}
                          className={cx(
                            'ctl flex min-h-11 items-center justify-between gap-2 whitespace-nowrap rounded-ctl px-3 py-1.5 text-sm font-medium transition-colors duration-fast',
                            on ? 'bg-primary-soft text-primary-text ring-1 ring-inset ring-primary-border' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block">{t.label}</span>
                            {h && h.health !== 'ready' && (
                              <span className={cx('block max-w-[11rem] truncate text-xs font-normal', h.health === 'problem' ? 'text-danger' : 'text-warning')}>{h.label}</span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border lg:hidden" />
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="px-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-fg">{label}</h2>
              {report && <HealthChip health={report.health} label={report.label} />}
            </div>
            <p className="mt-1 text-sm text-fg-muted">{current?.blurb}</p>
            {report && report.health !== 'ready' && <p className="mt-1 text-sm text-fg-subtle">{report.note}</p>}
          </div>
          <Panel key={tab} tab={tab} />
        </div>
      </div>
    </PageContainer>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageHeader title="Settings" />
          <Skeleton className="h-64 w-full" />
        </PageContainer>
      }
    >
      <SettingsView />
    </Suspense>
  );
}
