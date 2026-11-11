"use client";

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useShell } from '@/components/AppShell';
import { PageContainer, PageHeader } from '@/components/shell';
import { NewTaskModal } from '@/components/shell/TopbarMenus';
import { CaptureIcon, PlusIcon, TasksIcon } from '@/components/Icons';
import { Banner, Button, Stagger, buttonClass } from '@/components/ui';
import { supabase } from '@/lib/supabaseClient';
import { computeModel, useDashboard } from '@/lib/dashboard-data';
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

export default function DashboardPage() {
  const { email, pushToast, workerOnline, refreshCounts } = useShell();
  const { raw, loading, error, reload, patchRaw } = useDashboard();
  const activity = useActivityFeed({ limit: 10 });
  const [taskOpen, setTaskOpen] = useState(false);

  const model = useMemo(() => (raw ? computeModel(raw) : null), [raw]);
  const name = raw?.settings.profile.your_name.trim() || email.split('@')[0] || 'there';
  const now = new Date();
  const dateText = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

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
        subtitle={dateText}
        actions={
          <>
            <Link href="/capture" className={buttonClass('secondary', 'md')}>
              <CaptureIcon className="h-4 w-4" />
              Capture a lead
            </Link>
            <Button variant="secondary" leftIcon={<TasksIcon className="h-4 w-4" />} onClick={() => setTaskOpen(true)}>
              New task
            </Button>
            <Link href="/deals?new=1" className={buttonClass('primary', 'md')}>
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

      <div className="space-y-4">
        <StatsRow model={model} loading={loading} />

        {loading || !raw || !model ? (
          <div className="grid gap-4 lg:grid-cols-5" aria-hidden="true">
            <PanelSkeleton rows={5} className="lg:col-span-3" />
            <PanelSkeleton rows={4} className="lg:col-span-2" />
            <PanelSkeleton rows={3} className="lg:col-span-3" />
            <PanelSkeleton rows={3} className="lg:col-span-2" />
          </div>
        ) : (
          <>
            <Stagger step={60} className="grid gap-4 lg:grid-cols-5 [&>*]:min-w-0 [&>*:nth-child(1)]:lg:col-span-3 [&>*:nth-child(2)]:lg:col-span-2 [&>*:nth-child(3)]:lg:col-span-3 [&>*:nth-child(4)]:lg:col-span-2 [&>*>*]:h-full">
              <TodayCard today={model.today} onToggleTask={toggleTask} />
              <FunnelCard funnel={model.funnel} />
              <LeadsPerDayCard data={model.perDay} />
              <TopSourcesCard items={model.topSources} />
            </Stagger>
            <Stagger step={60} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0 [&>*>*]:h-full">
              <SourceHealthCard health={model.health} raw={raw} workerOnline={workerOnline} />
              <ActivityCard items={activity.items} loading={activity.loading} error={activity.error} />
              <div className="space-y-4 md:col-span-2 xl:col-span-1">
                <TradingCard raw={raw} trading={model.trading} />
                <SystemCard raw={raw} workerOnline={workerOnline} />
                <SetupCard raw={raw} workerOnline={workerOnline} />
              </div>
            </Stagger>
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
