"use client";

import { useRef, useState } from 'react';
import { PlusIcon } from '@/components/Icons';
import { Button, Chip, Input, SegmentedControl } from '@/components/ui';
import { DUE_SHORTCUTS, dueAtFor, fromDateInput, parseQuickTitle, shortcutDate, toDateInput, type DueShortcut } from '@/lib/tasks-data';
import type { TaskPriority } from '@/lib/types-platform';
import { LinkPicker, type TaskLink } from './LinkPicker';

export type NewTask = { title: string; due_at: string | null; priority: TaskPriority; link: TaskLink | null };

export function TaskQuickAdd({ onAdd, defaultLink }: { onAdd: (t: NewTask) => Promise<boolean>; defaultLink?: TaskLink | null }) {
  const [title, setTitle] = useState('');
  const [shortcut, setShortcut] = useState<DueShortcut | 'custom'>('none');
  const [custom, setCustom] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [link, setLink] = useState<TaskLink | null>(defaultLink ?? null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const raw = title.trim();
    if (!raw || busy) return;
    const parsed = parseQuickTitle(raw);
    let due: string | null = null;
    if (shortcut === 'custom') due = fromDateInput(custom);
    else if (shortcut !== 'none') {
      const d = shortcutDate(shortcut);
      due = d ? dueAtFor(d) : null;
    } else if (parsed.due) due = dueAtFor(parsed.due);
    setBusy(true);
    const ok = await onAdd({ title: parsed.title, due_at: due, priority, link });
    setBusy(false);
    if (ok) {
      setTitle('');
      setShortcut('none');
      setCustom('');
      setPriority('normal');
      setLink(defaultLink ?? null);
      input.current?.focus();
    }
  };

  const pick = (id: DueShortcut) => setShortcut((cur) => (cur === id ? 'none' : id));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="glass rounded-card border border-border p-3 sm:p-4"
      aria-label="Add a task"
    >
      <div className="flex gap-2">
        <Input
          ref={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='Type a task and press Enter, like "Call Sam tomorrow"'
          aria-label="New task"
          maxLength={200}
          className="!min-h-10 flex-1 !text-[15px]"
        />
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!title.trim()} leftIcon={<PlusIcon className="h-4 w-4" />}>
          Add
        </Button>
      </div>
      {!more && !title.trim() && (
        <button type="button" onClick={() => setMore(true)} className="mt-2 cursor-pointer rounded text-[13px] font-medium text-primary-text hover:underline">
          Set a date, priority or link
        </button>
      )}
      {(more || title.trim() !== '' || shortcut !== 'none' || link !== null) && (
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Due date">
          {DUE_SHORTCUTS.map((s) => (
            <Chip key={s.id} selected={shortcut === s.id} onClick={() => pick(s.id)}>
              {s.label}
            </Chip>
          ))}
          <label className="inline-flex items-center">
            <span className="sr-only">Pick a date</span>
            <input
              type="date"
              value={custom}
              min={toDateInput(new Date().toISOString())}
              onChange={(e) => {
                setCustom(e.target.value);
                setShortcut(e.target.value ? 'custom' : 'none');
              }}
              className="field ctl min-h-7 rounded-ctl border border-border-strong bg-surface px-2 text-[13px] text-fg coarse:min-h-11"
            />
          </label>
        </div>
        <SegmentedControl
          label="Priority"
          size="sm"
          value={priority}
          onChange={setPriority}
          options={[
            { id: 'low', label: 'Low' },
            { id: 'normal', label: 'Normal' },
            { id: 'high', label: 'High' },
          ]}
        />
        <LinkPicker value={link} onChange={setLink} />
      </div>
      )}
    </form>
  );
}
