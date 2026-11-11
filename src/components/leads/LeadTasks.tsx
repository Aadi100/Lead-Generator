"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { normalizeTask, type Task, type TaskPriority } from '@/lib/types-platform';
import { Banner, Button, Checkbox, IconButton, Select, Skeleton, cx } from '@/components/ui';
import { CalendarIcon, PlusIcon, TrashIcon } from '@/components/Icons';
import type { ToastItem } from '@/components/ui';

type DueChoice = 'none' | 'today' | 'tomorrow' | 'in3' | 'week';
const DUE_LABEL: Record<DueChoice, string> = { none: 'No date', today: 'Today', tomorrow: 'Tomorrow', in3: 'In 3 days', week: 'Next week' };

function dueDate(choice: DueChoice): string | null {
  if (choice === 'none') return null;
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  if (choice === 'tomorrow') d.setDate(d.getDate() + 1);
  if (choice === 'in3') d.setDate(d.getDate() + 3);
  if (choice === 'week') d.setDate(d.getDate() + 7);
  return d.toISOString();
}

function dueText(t: Task, now: number): { text: string; overdue: boolean } | null {
  if (!t.due_at) return null;
  const due = new Date(t.due_at);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = startToday.getTime() + 86_400_000;
  const overdue = !t.done && due.getTime() < startToday.getTime();
  let text: string;
  if (due.getTime() >= startToday.getTime() && due.getTime() < endToday) text = 'Today';
  else if (due.getTime() >= endToday && due.getTime() < endToday + 86_400_000) text = 'Tomorrow';
  else text = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { text: overdue ? `Overdue, ${text}` : text, overdue };
}

/** Small per-lead task list with quick add. Reads and writes table `tasks`. */
export default function LeadTasks({
  leadId,
  pushToast,
  focusSignal,
}: {
  leadId: string;
  pushToast: (kind: ToastItem['kind'], message: string) => void;
  /** Change this number to move focus to the quick-add field (used by "Add task"). */
  focusSignal?: number;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<DueChoice>('none');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('tasks')
      .select('*')
      .eq('lead_id', leadId)
      .order('done', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (err) setError(err.message);
    else {
      setError(null);
      setTasks((data ?? []).map((r) => normalizeTask(r as Record<string, unknown>)));
    }
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  const add = async () => {
    const text = title.trim();
    if (!text || adding) return;
    setAdding(true);
    const { data, error: err } = await supabase
      .from('tasks')
      .insert({ lead_id: leadId, title: text, due_at: dueDate(due), priority })
      .select('*')
      .single();
    setAdding(false);
    if (err || !data) {
      pushToast('error', `Could not add the task${err ? `: ${err.message}` : '.'}`);
      return;
    }
    setTasks((cur) => [normalizeTask(data as Record<string, unknown>), ...cur]);
    setTitle('');
    setDue('none');
    setPriority('normal');
    pushToast('success', 'Task added.');
    inputRef.current?.focus();
  };

  const toggle = async (t: Task, done: boolean) => {
    const done_at = done ? new Date().toISOString() : null;
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, done, done_at } : x)));
    const { data, error: err } = await supabase.from('tasks').update({ done, done_at }).eq('id', t.id).select('id');
    if (err || !data || data.length === 0) {
      setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: t.done, done_at: t.done_at } : x)));
      pushToast('error', `Could not update the task${err ? `: ${err.message}` : '.'}`);
    }
  };

  const remove = async (t: Task) => {
    setConfirmId(null);
    const before = tasks;
    setTasks((cur) => cur.filter((x) => x.id !== t.id));
    const { error: err } = await supabase.from('tasks').delete().eq('id', t.id);
    if (err) {
      setTasks(before);
      pushToast('error', `Could not delete the task: ${err.message}`);
    }
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <section aria-label="Tasks for this lead" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">Reminders and tasks</h3>
        {!loading && <span className="font-num text-xs text-fg-subtle">{open.length} open</span>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="space-y-2 rounded-card border border-border bg-surface-2/50 p-3"
      >
        <label htmlFor={`task-title-${leadId}`} className="sr-only">
          New task
        </label>
        <input
          ref={inputRef}
          id={`task-title-${leadId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="For example: follow up on Friday"
          maxLength={200}
          className="ctl w-full rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Due date">
            {(Object.keys(DUE_LABEL) as DueChoice[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={due === c}
                onClick={() => setDue(c)}
                className={cx(
                  'btn inline-flex min-h-7 cursor-pointer items-center rounded-full border px-2.5 text-xs font-medium transition-colors duration-fast coarse:min-h-10',
                  due === c ? 'border-primary bg-primary text-primary-on' : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg',
                )}
              >
                {DUE_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor={`task-prio-${leadId}`} className="sr-only">
              Priority
            </label>
            <div className="w-28">
              <Select id={`task-prio-${leadId}`} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="!py-1 text-[13px]">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </Select>
            </div>
            <Button type="submit" variant="primary" size="md" loading={adding} disabled={!title.trim()} leftIcon={<PlusIcon className="h-4 w-4" />} className="coarse:min-h-11">
              Add
            </Button>
          </div>
        </div>
      </form>

      {error && (
        <Banner tone="danger" action={<Button size="sm" onClick={() => void load()}>Retry</Button>}>
          Could not load tasks: {error}
        </Banner>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : tasks.length === 0 && !error ? (
        <p className="rounded-card border border-dashed border-border-strong px-3 py-4 text-center text-sm text-fg-subtle">
          No tasks yet. Add a reminder above, for example when to follow up.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {[...open, ...done].map((t) => {
            const d = dueText(t, now);
            return (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                <Checkbox checked={t.done} onChange={(v) => void toggle(t, v)} label={<span className="sr-only">Mark done: {t.title}</span>} className="p-2 coarse:p-3" />
                <div className="min-w-0 flex-1">
                  <p className={cx('break-words text-sm', t.done ? 'text-fg-subtle line-through' : 'text-fg')}>{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
                    {d && (
                      <span className={cx('inline-flex items-center gap-1', d.overdue && 'font-medium text-danger')}>
                        <CalendarIcon className="h-3 w-3" aria-hidden="true" />
                        {d.text}
                      </span>
                    )}
                    {t.priority !== 'normal' && <span className={t.priority === 'high' ? 'font-medium text-warning' : ''}>{t.priority === 'high' ? 'High priority' : 'Low priority'}</span>}
                  </p>
                </div>
                {confirmId === t.id ? (
                  <span className="flex items-center gap-1">
                    <Button size="sm" variant="danger" onClick={() => void remove(t)}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <IconButton label={`Delete task: ${t.title}`} size="sm" onClick={() => setConfirmId(t.id)}>
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
