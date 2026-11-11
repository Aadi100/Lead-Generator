"use client";

import { Suspense, useEffect, useRef } from 'react';
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
import TradingPointer from '@/components/settings/TradingPointer';
import { HealthChip, useHealth } from '@/components/settings/StatusChip';

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
      return <TradingPointer />;
    case 'appearance':
      return <AppearanceTab />;
    case 'data':
      return <DataTab />;
  }
}

function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = parseSettingsTab(params.get('tab'));
  const health = useHealth();
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const label = SETTINGS_TABS.find((t) => t.id === tab)?.label ?? 'Settings';
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
      <PageHeader title="Settings" subtitle="Tell me about you, connect your email, and choose how I should help." />

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
                            'ctl flex min-h-9 items-center justify-between gap-2 whitespace-nowrap rounded-ctl px-3 py-1.5 text-sm font-medium transition-colors duration-fast',
                            on ? 'bg-primary-soft text-primary-text ring-1 ring-inset ring-primary-border' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                          )}
                        >
                          {t.label}
                          {h && h.health !== 'ready' && (
                            <span
                              aria-label={h.health === 'problem' ? 'Problem' : 'Needs setup'}
                              className={cx('h-2 w-2 rounded-full', h.health === 'problem' ? 'bg-danger-solid' : 'bg-warning-solid')}
                            />
                          )}
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
          {report && (
            <div className="glass flex flex-wrap items-center gap-2 rounded-card px-4 py-2.5">
              <span className="text-sm font-semibold text-fg">{label}</span>
              <HealthChip health={report.health} />
              <span className="min-w-0 text-sm text-fg-muted">{report.note}</span>
            </div>
          )}
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
