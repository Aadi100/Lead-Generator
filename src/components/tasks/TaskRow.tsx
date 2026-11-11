"use client";

import Link from 'next/link';
import { memo, useState } from 'react';
import { SparkIcon, TrashIcon } from '@/components/Icons';
import { Badge, Button, Checkbox, Input, Select, Textarea, cx } from '@/components/ui';
import { dueLabel, fromDateInput, isSuggested, toDateInput, type TaskGroupKey } from '@/lib/tasks-data';
import { TASK_PRIORITIES, type Task, type TaskPriority } from '@/lib/types-platform';

export type LinkInfo = { kind: 'lead' | 'deal'; title: string };
export type TaskPatch = { title?: string; notes?: string | null; due_at?: string | null; priority?: TaskPriority };

const PRIORITY_TONE = { high: 'danger', normal: 'neutral', low: 'info' } as const;

export const TaskRow = memo(function TaskRow({
  task,
  group,
  link,
  onToggle,
  onSave,
  onDelete,
}: {
  task: Task;
  group: TaskGroupKey;
  link: LinkInfo | null;
  onToggle: (t: Task, done: boolean) => void;
  onSave: (t: Task, patch: TaskPatch) => Promise<void>;
  onDelete: (t: Task) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [date, setDate] = useState(toDateInput(task.due_at));
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setTitle(task.title);
    setNotes(task.notes ?? '');
    setDate(toDateInput(task.due_at));
    setPriority(task.priority);
    setEditing(true);
  };

  const save = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    await onSave(task, { title: t, notes: notes.trim() || null, due_at: fromDateInput(date), priority });
    setSaving(false);
    setEditing(false);
  };

  const href = link ? (link.kind === 'lead' && task.lead_id ? `/leads?lead=${task.lead_id}` : '/deals') : null;

  if (editing) {
    return (
      <li className="rounded-card border border-primary-border bg-surface p-3 shadow-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-2.5"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" maxLength={200} data-autofocus autoFocus />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block text-[13px] text-fg-muted">
              Due date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field ctl mt-1 block min-h-8 w-full rounded-ctl border border-border-strong bg-surface px-2 text-sm text-fg" />
            </label>
            <label className="block text-[13px] text-fg-muted">
              Priority
              <div className="mt-1">
                <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </Select>
              </div>
            </label>
          </div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" aria-label="Notes" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!title.trim()}>
              Save
            </Button>
          </div>
        </form>
      </li>
    );
  }

  const overdue = group === 'overdue';
  return (
    <li className={cx('group flex items-start gap-3 rounded-card border border-border bg-surface px-3 py-2.5 transition-colors duration-fast hover:border-border-strong', task.done && 'opacity-70')}>
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center coarse:h-11 coarse:w-11">
        <Checkbox checked={task.done} onChange={(v) => onToggle(task, v)} label={<span className="sr-only">Mark "{task.title}" {task.done ? 'not done' : 'done'}</span>} />
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={startEdit}
          title="Click to edit"
          className={cx('ctl block w-full cursor-text rounded-ctl text-left text-sm font-medium leading-snug text-fg', task.done && 'text-fg-muted line-through')}
        >
          <span className="break-words">{task.title}</span>
        </button>
        {task.notes && <p className="mt-0.5 line-clamp-2 whitespace-pre-line break-words text-[13px] text-fg-muted">{task.notes}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className={cx('font-medium', overdue ? 'text-danger' : group === 'today' ? 'text-primary-text' : 'text-fg-subtle')}>{dueLabel(task.due_at)}</span>
          {task.priority !== 'normal' && <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority === 'high' ? 'High priority' : 'Low priority'}</Badge>}
          {isSuggested(task.title) && (
            <Badge tone="primary" icon={<SparkIcon className="h-3 w-3 shrink-0" />} title="Created automatically because a lead went quiet">
              Suggested by Lead Radar
            </Badge>
          )}
          {link && href && (
            <Link href={href} className="inline-flex min-w-0 max-w-full items-center gap-1 text-primary-text hover:underline">
              <span className="shrink-0 uppercase tracking-wide text-fg-subtle">{link.kind}</span>
              <span className="truncate">{link.title}</span>
            </Link>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(task)}
        aria-label={`Delete "${task.title}"`}
        className="btn inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-ctl text-fg-subtle transition-colors duration-fast hover:bg-danger-soft hover:text-danger coarse:h-11 coarse:w-11"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
});
