"use client";

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageContainer, PageHeader } from '@/components/shell';
import { useShell } from '@/components/AppShell';
import { ChevronIcon, TasksIcon } from '@/components/Icons';
import { Banner, Button, EmptyState, SegmentedControl, SkeletonRows, cx } from '@/components/ui';
import { supabase } from '@/lib/supabaseClient';
import { normalizeTask, type Task } from '@/lib/types-platform';
import { GROUP_LABEL, GROUP_ORDER, TASK_COLUMNS, dueAtFor, groupOf, sortTasks, toDateInput, weekStrip, type TaskGroupKey } from '@/lib/tasks-data';
import { TaskQuickAdd, type NewTask } from './TaskQuickAdd';
import { TaskRow, type LinkInfo, type TaskPatch } from './TaskRow';

type Priority = 'all' | 'high' | 'normal' | 'low';
type Linked = 'all' | 'linked' | 'unlinked';

export function TasksView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { pushToast, refreshCounts } = useShell();

  const priority = (['high', 'normal', 'low'].includes(params.get('priority') ?? '') ? params.get('priority') : 'all') as Priority;
  const linked = (['linked', 'unlinked'].includes(params.get('linked') ?? '') ? params.get('linked') : 'all') as Linked;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? (params.get('day') as string) : null;

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [links, setLinks] = useState<Record<string, LinkInfo>>({});
  const [error, setError] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    try {
      setShowMore(localStorage.getItem('lead-radar:tasks-more') === '1');
    } catch {
      // storage unavailable
    }
  }, []);
  const toggleMore = () =>
    setShowMore((v) => {
      try {
        localStorage.setItem('lead-radar:tasks-more', v ? '0' : '1');
      } catch {
        // storage unavailable
      }
      return !v;
    });

  const load = useCallback(async () => {
    // The server returns at most 1000 rows per request, so read open tasks in pages.
    const openPage = (from: number) =>
      supabase.from('tasks').select(TASK_COLUMNS).eq('done', false).order('due_at', { ascending: true, nullsFirst: false }).order('id', { ascending: true }).range(from, from + 999);
    const [openFirst, done] = await Promise.all([
      openPage(0),
      supabase.from('tasks').select(TASK_COLUMNS).eq('done', true).order('done_at', { ascending: false, nullsFirst: false }).limit(100),
    ]);
    if (openFirst.error) {
      setError(openFirst.error.message);
      return;
    }
    let openRows = (openFirst.data ?? []) as unknown as Record<string, unknown>[];
    for (let from = 1000; openRows.length === from && from < 5000; from += 1000) {
      const more = await openPage(from);
      if (more.error) break;
      openRows = openRows.concat((more.data ?? []) as unknown as Record<string, unknown>[]);
    }
    setError(null);
    const rows = [...openRows, ...((done.data ?? []) as unknown as Record<string, unknown>[])].map(normalizeTask);
    setTasks(rows);
    const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter((x): x is string => !!x)));
    const dealIds = Array.from(new Set(rows.map((r) => r.deal_id).filter((x): x is string => !!x)));
    const [lr, dr] = await Promise.all([
      leadIds.length ? supabase.from('leads').select('id,title').in('id', leadIds.slice(0, 300)) : Promise.resolve({ data: [] }),
      dealIds.length ? supabase.from('deals').select('id,title').in('id', dealIds.slice(0, 300)) : Promise.resolve({ data: [] }),
    ]);
    const map: Record<string, LinkInfo> = {};
    for (const r of (lr.data ?? []) as { id: string; title: string }[]) map[`lead:${r.id}`] = { kind: 'lead', title: r.title };
    for (const r of (dr.data ?? []) as { id: string; title: string }[]) map[`deal:${r.id}`] = { kind: 'deal', title: r.title };
    setLinks(map);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`tasks-page-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void load(), 500);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const linkOf = useCallback((t: Task): LinkInfo | null => (t.lead_id ? links[`lead:${t.lead_id}`] : t.deal_id ? links[`deal:${t.deal_id}`] : null) ?? null, [links]);

  // ---- mutations (optimistic, rollback with a toast) ----
  const patchLocal = useCallback((id: string, patch: Partial<Task>) => setTasks((cur) => (cur ? cur.map((t) => (t.id === id ? { ...t, ...patch } : t)) : cur)), []);

  const onAdd = useCallback(
    async (n: NewTask): Promise<boolean> => {
      const row = {
        title: n.title,
        due_at: n.due_at,
        priority: n.priority,
        lead_id: n.link?.kind === 'lead' ? n.link.id : null,
        deal_id: n.link?.kind === 'deal' ? n.link.id : null,
      };
      const { data, error: err } = await supabase.from('tasks').insert(row).select(TASK_COLUMNS).single();
      if (err || !data) {
        pushToast('error', `Could not add the task: ${err?.message ?? 'unknown error'}`);
        return false;
      }
      setTasks((cur) => [normalizeTask(data as unknown as Record<string, unknown>), ...(cur ?? [])]);
      if (n.link) setLinks((l) => ({ ...l, [`${n.link!.kind}:${n.link!.id}`]: { kind: n.link!.kind, title: n.link!.title } }));
      pushToast('success', 'Task added.');
      refreshCounts?.();
      return true;
    },
    [pushToast, refreshCounts],
  );

  const onToggle = useCallback(
    async (t: Task, done: boolean) => {
      const done_at = done ? new Date().toISOString() : null;
      patchLocal(t.id, { done, done_at });
      const { error: err } = await supabase.from('tasks').update({ done, done_at }).eq('id', t.id);
      if (err) {
        patchLocal(t.id, { done: t.done, done_at: t.done_at });
        pushToast('error', `Could not update the task: ${err.message}`);
      } else refreshCounts?.();
    },
    [patchLocal, pushToast, refreshCounts],
  );

  const onSave = useCallback(
    async (t: Task, patch: TaskPatch) => {
      const prev = { title: t.title, notes: t.notes, due_at: t.due_at, priority: t.priority };
      patchLocal(t.id, patch);
      const { error: err } = await supabase.from('tasks').update(patch).eq('id', t.id);
      if (err) {
        patchLocal(t.id, prev);
        pushToast('error', `Could not save: ${err.message}`);
      } else refreshCounts?.();
    },
    [patchLocal, pushToast, refreshCounts],
  );

  const onDelete = useCallback(
    async (t: Task) => {
      setTasks((cur) => (cur ? cur.filter((x) => x.id !== t.id) : cur));
      const { error: err } = await supabase.from('tasks').delete().eq('id', t.id);
      if (err) {
        setTasks((cur) => (cur ? [t, ...cur] : cur));
        pushToast('error', `Could not delete: ${err.message}`);
        return;
      }
      refreshCounts?.();
      pushToast('info', 'Task deleted.', {
        label: 'Undo',
        onClick: () => {
          void supabase
            .from('tasks')
            .insert({ id: t.id, lead_id: t.lead_id, deal_id: t.deal_id, title: t.title, notes: t.notes, due_at: t.due_at, done: t.done, done_at: t.done_at, priority: t.priority, created_at: t.created_at })
            .then(({ error: e }) => {
              if (e) pushToast('error', `Could not restore: ${e.message}`);
              else {
                setTasks((cur) => (cur && !cur.some((x) => x.id === t.id) ? [t, ...cur] : cur));
                refreshCounts?.();
              }
            });
        },
      });
    },
    [pushToast, refreshCounts],
  );

  // ---- derived ----
  const filtered = useMemo(() => {
    return (tasks ?? []).filter((t) => {
      if (priority !== 'all' && t.priority !== priority) return false;
      if (linked === 'linked' && !t.lead_id && !t.deal_id) return false;
      if (linked === 'unlinked' && (t.lead_id || t.deal_id)) return false;
      if (day && (t.done || toDateInput(t.due_at) !== day)) return false;
      return true;
    });
  }, [tasks, priority, linked, day]);

  const groups = useMemo(() => {
    const g: Record<TaskGroupKey, Task[]> = { overdue: [], today: [], upcoming: [], nodate: [], done: [] };
    for (const t of filtered) g[groupOf(t)].push(t);
    for (const k of GROUP_ORDER) g[k] = sortTasks(g[k], k);
    return g;
  }, [filtered]);

  const week = useMemo(() => weekStrip(tasks ?? []), [tasks]);
  const openCount = (tasks ?? []).filter((t) => !t.done).length;
  const filtersOn = priority !== 'all' || linked !== 'all' || !!day;
  const nothing = tasks && tasks.length === 0;

  return (
    <PageContainer>
      <PageHeader title="Tasks" subtitle={tasks ? (openCount === 0 ? 'Nothing waiting on you. Add a reminder above.' : `Your reminders and follow-ups. ${openCount} to do${groups.overdue.length ? `, ${groups.overdue.length} overdue` : ''}.`) : 'Your reminders and follow-ups.'} />

      <TaskQuickAdd onAdd={onAdd} />

      {error && (
        <Banner
          tone="danger"
          title="Could not load your tasks"
          className="mt-4"
          action={
            <Button size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        >
          {error}
        </Banner>
      )}

      {tasks && !nothing && (
        <>
          <button type="button" onClick={toggleMore} aria-expanded={showMore || filtersOn} className="mt-3 cursor-pointer rounded text-[13px] font-medium text-primary-text hover:underline">
            {showMore || filtersOn ? 'Hide week view and filters' : 'Show week view and filters'}
          </button>
          {(showMore || filtersOn) && <WeekStrip week={week} day={day} onPick={(k) => setParam({ day: day === k ? null : k })} />}
          {(showMore || filtersOn) && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="Priority"
              size="sm"
              value={priority}
              onChange={(v) => setParam({ priority: v === 'all' ? null : v })}
              options={[
                { id: 'all', label: 'Any priority' },
                { id: 'high', label: 'High' },
                { id: 'normal', label: 'Normal' },
                { id: 'low', label: 'Low' },
              ]}
            />
            <SegmentedControl
              label="Linked to"
              size="sm"
              value={linked}
              onChange={(v) => setParam({ linked: v === 'all' ? null : v })}
              options={[
                { id: 'all', label: 'All tasks' },
                { id: 'linked', label: 'Linked to a lead or deal' },
                { id: 'unlinked', label: 'Not linked' },
              ]}
            />
            {filtersOn && (
              <Button variant="ghost" size="sm" onClick={() => setParam({ priority: null, linked: null, day: null })}>
                Clear filters
              </Button>
            )}
          </div>
          )}
        </>
      )}

      <div className="mt-5 space-y-6">
        {!tasks && !error && <SkeletonRows rows={5} rowClassName="h-16" />}
        {nothing && (
          <EmptyState
            icon={<TasksIcon className="h-5 w-5" />}
            title="No tasks yet"
            text='Add your first reminder above, for example "Follow up with Sam tomorrow". Link it to a lead so you can jump straight back to it.'
            action={
              <Button
                variant="primary"
                onClick={() => {
                  void onAdd({ title: 'Check my new leads', due_at: dueAtFor(new Date()), priority: 'normal', link: null });
                }}
              >
                Add a starter task
              </Button>
            }
          />
        )}
        {tasks && !nothing && filtered.length === 0 && (
          <EmptyState
            title="Nothing matches"
            text="No tasks fit these filters."
            action={
              <Button onClick={() => setParam({ priority: null, linked: null, day: null })}>Clear filters</Button>
            }
          />
        )}
        {tasks &&
          GROUP_ORDER.map((k) => {
            const list = groups[k];
            if (list.length === 0) return null;
            const isDone = k === 'done';
            const open = !isDone || doneOpen;
            return (
              <section key={k} aria-label={GROUP_LABEL[k]}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                  {isDone ? (
                    <button
                      type="button"
                      onClick={() => setDoneOpen((v) => !v)}
                      aria-expanded={doneOpen}
                      className="btn inline-flex cursor-pointer items-center gap-1.5 rounded-ctl text-sm font-semibold text-fg"
                    >
                      <ChevronIcon className={cx('h-4 w-4 transition-transform duration-fast', doneOpen && 'rotate-180')} />
                      {GROUP_LABEL[k]}
                    </button>
                  ) : (
                    <span className={cx(k === 'overdue' && 'text-danger')}>{GROUP_LABEL[k]}</span>
                  )}
                  <span className={cx('font-num rounded-full px-2 text-xs font-medium ring-1 ring-inset', k === 'overdue' ? 'bg-danger-soft text-danger ring-danger-border' : 'bg-surface-2 text-fg-muted ring-border')}>{list.length}</span>
                </h2>
                {open && (
                  <ul className="space-y-2">
                    {list.map((t) => (
                      <TaskRow key={t.id} task={t} group={k} link={linkOf(t)} onToggle={onToggle} onSave={onSave} onDelete={onDelete} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
      </div>
    </PageContainer>
  );
}

function WeekStrip({ week, day, onPick }: { week: ReturnType<typeof weekStrip>; day: string | null; onPick: (key: string) => void }) {
  return (
    <nav aria-label="This week" className="mt-4">
      <ul className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {week.map((d) => {
          const total = d.count + d.overdue;
          const on = day === d.key;
          const label = `${d.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}: ${d.count} ${d.count === 1 ? 'task' : 'tasks'}${d.overdue ? `, plus ${d.overdue} overdue` : ''}`;
          return (
            <li key={d.key}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={label}
                onClick={() => onPick(d.key)}
                className={cx(
                  'btn flex w-full cursor-pointer flex-col items-center rounded-card border px-1 py-2 transition-colors duration-fast coarse:min-h-14',
                  on ? 'border-primary bg-primary-soft' : d.isToday ? 'border-primary-border bg-surface' : 'border-border bg-surface hover:border-border-strong',
                )}
              >
                <span className={cx('text-[11px] font-medium uppercase tracking-wide', d.isToday ? 'text-primary-text' : 'text-fg-subtle')}>{d.isToday ? 'Today' : d.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className="font-num text-lg font-semibold leading-tight text-fg">{d.date.getDate()}</span>
                <span className={cx('font-num mt-0.5 text-xs', total > 0 ? 'font-medium text-fg' : 'text-fg-subtle')}>
                  {d.count}
                  {d.overdue > 0 && <span className="text-danger"> +{d.overdue}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
