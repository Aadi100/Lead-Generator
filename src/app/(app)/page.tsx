"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useShell } from '@/components/AppShell';
import { PageContainer, PageHeader } from '@/components/shell';
import { NewTaskModal } from '@/components/shell/TopbarMenus';
import { CaptureIcon, ChevronIcon, PlusIcon, TasksIcon } from '@/components/Icons';
import { Banner, Button, Stagger, buttonClass, cx } from '@/components/ui';
import { supabase } from '@/lib/supabaseClient';
import { computeModel, useDashboard, type DashModel } from '@/lib/dashboard-data';
import { useActivityFeed } from '@/lib/activity';
import { StatsRow } from '@/components/dashboard/StatsRow';
import { TodayCard } from '@/components/dashboard/TodayCard';
import { FunnelCard, LeadsPerDayCard, TopSourcesCard } from '@/components/dashboard/InsightCards';
import { SetupCard, SourceHealthCard, SystemCard } from '@/components/dashboard/HealthCards';
import { ActivityCard, TradingCard } from '@/components/dashboard/SideCards';
import { PanelSkeleton } from '@/components/dashboard/Panel';

function greeting(h: number): string {
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** ONE plain sentence about what needs the person today. */
function attentionSentence(m: DashModel | null): string {
  if (!m) return 'Loading your day…';
  const t = m.today;
  const bits: string[] = [];
  if (t.repliesCount) bits.push(`${plural(t.repliesCount, 'reply', 'replies')} to read`);
  if (t.draftsCount) bits.push(`${plural(t.draftsCount, 'draft')} to review`);
  if (t.tasks.length) bits.push(`${plural(t.tasks.length, 'task')} due`);
  if (bits.length === 0) return 'You are all caught up. Nothing needs you right now.';
  return `You have ${bits.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
}

const MORE_KEY = 'lr:dash-more-open';

function MoreDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(MORE_KEY) === '1');
    } catch {
      // closed
    }
  }, []);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(MORE_KEY, v ? '0' : '1');
      } catch {
        // not remembered
      }
      return !v;
    });
  };
  return (
    <section aria-label="More details">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="dash-more"
        className="btn flex min-h-[44px] w-full cursor-pointer flex-wrap items-center gap-x-2 rounded-ctl px-1 text-left text-sm font-semibold text-fg-muted transition-colors duration-fast hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ChevronIcon className={cx('h-4 w-4 transition-transform duration-base', !open && '-rotate-90')} />
        More details
        <span className="hidden font-normal text-fg-subtle sm:inline">Charts, where leads come from, activity and system status</span>
      </button>
      {open && (
        <div id="dash-more" className="mt-3 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { email, pushToast, workerOnline, refreshCounts } = useShell();
  const { raw, loading, error, reload, patchRaw } = useDashboard();
  const activity = useActivityFeed({ limit: 10 });
  const [taskOpen, setTaskOpen] = useState(false);

  const model = useMemo(() => (raw ? computeModel(raw) : null), [raw]);
  const name = raw?.settings.profile.your_name.trim() || email.split('@')[0] || 'there';
  const now = new Date();

  const toggleTask = useCallback(
    async (id: string) => {
      if (!raw) return;
      const before = raw.tasks;
      const stamp = new Date().toISOString();
      patchRaw((r) => ({ ...r, tasks: r.tasks.map((t) => (t.id === id ? { ...t, done: true, done_at: stamp } : t)) }));
      const { error: err } = await supabase.from('tasks').update({ done: true, done_at: stamp }).eq('id', id);
      if (err) {
        patchRaw((r) => ({ ...r, tasks: before }));
        pushToast('error', `Could not mark the task done: ${err.message}`);
      } else {
        pushToast('success', 'Task done');
        void refreshCounts();
      }
    },
    [raw, patchRaw, pushToast, refreshCounts],
  );

  return (
    <PageContainer>
      <PageHeader
        title={`${greeting(now.getHours())}, ${name}`}
        subtitle={attentionSentence(model)}
        actions={
          <>
            <Link href="/capture" className={buttonClass('ghost', 'md')}>
              <CaptureIcon className="h-4 w-4" />
              Capture<span className="hidden sm:inline"> a lead</span>
            </Link>
            <Button variant="ghost" leftIcon={<TasksIcon className="h-4 w-4" />} onClick={() => setTaskOpen(true)}>
              New task
            </Button>
            <Link href="/deals?new=1" className={buttonClass('secondary', 'md')}>
              <PlusIcon className="h-4 w-4" />
              New deal
            </Link>
          </>
        }
      />

      {error && (
        <Banner
          tone="danger"
          title="Could not load the dashboard"
          className="mb-4"
          action={
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Banner>
      )}

      <div className="space-y-5">
        {raw && <SetupCard raw={raw} workerOnline={workerOnline} />}

        <StatsRow model={model} loading={loading} />

        {loading || !raw || !model ? (
          <PanelSkeleton rows={5} />
        ) : (
          <>
            <TodayCard today={model.today} onToggleTask={toggleTask} />
            <MoreDetails>
              <Stagger step={60} className="grid gap-4 lg:grid-cols-5 [&>*]:min-w-0 [&>*:nth-child(1)]:lg:col-span-3 [&>*:nth-child(2)]:lg:col-span-2 [&>*:nth-child(3)]:lg:col-span-3 [&>*:nth-child(4)]:lg:col-span-2 [&>*>*]:h-full">
                <LeadsPerDayCard data={model.perDay} />
                <FunnelCard funnel={model.funnel} />
                <TopSourcesCard items={model.topSources} />
                <SourceHealthCard health={model.health} raw={raw} workerOnline={workerOnline} />
              </Stagger>
              <Stagger step={60} className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0 [&>*>*]:h-full">
                <ActivityCard items={activity.items} loading={activity.loading} error={activity.error} />
                <div className="space-y-4">
                  <TradingCard raw={raw} trading={model.trading} />
                  <SystemCard raw={raw} workerOnline={workerOnline} />
                </div>
              </Stagger>
            </MoreDetails>
          </>
        )}
      </div>

      <NewTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        onCreated={(msg) => {
          pushToast('success', msg);
          void reload();
          void refreshCounts();
        }}
      />
    </PageContainer>
  );
}
