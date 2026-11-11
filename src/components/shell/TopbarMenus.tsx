"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useActivityFeed, type ActivityKind } from '@/lib/activity';
import { timeAgo } from '@/lib/format';
import { normalizeTask } from '@/lib/types-platform';
import { BellIcon, CaptureIcon, DealsIcon, InboxIcon, LeadsIcon, MonitorIcon, MoonIcon, PlusIcon, SendIcon, SignOutIcon, SunIcon, TasksIcon } from '@/components/Icons';
import { Avatar, Banner, Button, CountBadge, Field, IconButton, Input, MenuItem, MenuLabel, MenuSeparator, Modal, Popover, Select, Textarea, cx } from '@/components/ui';
import { useTheme, type Theme } from '@/components/theme/ThemeProvider';
import { REFRESH_COUNTS_EVENT } from './counts';

export const NEW_TASK_EVENT = 'lr:new-task';

export function ThemeMenu() {
  const { theme, resolved, setTheme } = useTheme();
  const opts: { id: Theme; label: string; icon: JSX.Element }[] = [
    { id: 'light', label: 'Light', icon: <SunIcon className="h-4 w-4" /> },
    { id: 'dark', label: 'Dark', icon: <MoonIcon className="h-4 w-4" /> },
    { id: 'system', label: 'System', icon: <MonitorIcon className="h-4 w-4" /> },
  ];
  return (
    <Popover
      label="Theme"
      role="menu"
      width="w-44"
      trigger={({ open: _o, ...p }) => (
        <IconButton {...p} label={`Theme: ${theme}`}>
          {resolved === 'dark' ? <MoonIcon className="h-[18px] w-[18px]" /> : <SunIcon className="h-[18px] w-[18px]" />}
        </IconButton>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <MenuLabel>Theme</MenuLabel>
          {opts.map((o) => (
            <MenuItem
              key={o.id}
              icon={o.icon}
              selected={theme === o.id}
              hint={theme === o.id ? '✓' : undefined}
              onClick={(e) => {
                setTheme(o.id, { x: e.clientX, y: e.clientY });
                close();
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function UserMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <Popover
      label="Account"
      role="menu"
      width="w-64"
      trigger={({ open: _o, ...p }) => (
        <button {...p} type="button" aria-label="Account menu" className="btn inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors duration-fast hover:bg-surface-2">
          <Avatar name={email || 'You'} />
        </button>
      )}
    >
      {() => (
        <div className="p-1.5">
          <div className="px-2.5 py-2">
            <p className="text-xs text-fg-subtle">Signed in as</p>
            <p className="truncate text-sm font-medium text-fg" title={email}>
              {email || 'Your account'}
            </p>
          </div>
          <MenuSeparator />
          <MenuItem icon={<SignOutIcon className="h-4 w-4" />} onClick={onSignOut} danger>
            Sign out
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

const KIND_ICON: Record<ActivityKind, JSX.Element> = {
  lead: <LeadsIcon className="h-4 w-4" />,
  sent: <SendIcon className="h-4 w-4" />,
  reply: <InboxIcon className="h-4 w-4" />,
  deal: <DealsIcon className="h-4 w-4" />,
};
const KIND_TONE: Record<ActivityKind, string> = {
  lead: 'bg-info-soft text-info',
  sent: 'bg-primary-soft text-primary-text',
  reply: 'bg-accent-soft text-accent-text',
  deal: 'bg-warning-soft text-warning',
};

export function NotificationsBell() {
  const { items, unread, seen, loading, error, markSeen } = useActivityFeed({ limit: 10 });
  const [since, setSince] = useState<string | null>(null);
  return (
    <Popover
      label="Notifications"
      width="w-[22rem]"
      trigger={({ open, onClick, ...p }) => (
        <span className="relative inline-flex">
          <IconButton
            {...p}
            label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
            onClick={() => {
              if (!open) {
                setSince(seen);
                markSeen();
              }
              onClick();
            }}
          >
            <BellIcon className="h-[18px] w-[18px]" />
          </IconButton>
          {unread > 0 && <CountBadge n={unread} tone="danger" className="pointer-events-none absolute -right-0.5 -top-0.5 !min-w-[1rem] !px-1 !leading-4" label={`${unread} new`} />}
        </span>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <p className="text-sm font-semibold text-fg">Latest activity</p>
            <Link href="/activity" onClick={close} className="text-[13px] font-medium text-primary-text hover:underline">
              View all
            </Link>
          </div>
          <div className="max-h-[22rem] overflow-y-auto">
            {loading ? (
              <p className="px-3.5 py-6 text-center text-sm text-fg-subtle">Loading…</p>
            ) : error ? (
              <p className="px-3.5 py-6 text-center text-sm text-danger">{error}</p>
            ) : items.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-fg-subtle">Nothing yet. New leads, replies and deals show up here.</p>
            ) : (
              <ul>
                {items.map((it) => {
                  const fresh = since ? new Date(it.at).getTime() > new Date(since).getTime() : false;
                  return (
                    <li key={it.id}>
                      <Link href={it.href} onClick={close} className="flex items-start gap-3 px-3.5 py-2.5 transition-colors duration-fast hover:bg-surface-2">
                        <span className={cx('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full', KIND_TONE[it.kind])}>{KIND_ICON[it.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={cx('line-clamp-2 text-[13px] text-fg', fresh && 'font-semibold')}>{it.title}</span>
                            <span className="font-num shrink-0 text-xs text-fg-subtle">{timeAgo(it.at)}</span>
                          </span>
                          {it.detail && <span className="mt-0.5 block truncate text-xs text-fg-subtle">{it.detail}</span>}
                        </span>
                        {fresh && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

function todayInput(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function NewTaskModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (msg: string) => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayInput());
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDate(todayInput());
      setPriority('normal');
      setNotes('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) {
      setError('Give the task a short title.');
      return;
    }
    setSaving(true);
    setError(null);
    const due = date ? new Date(`${date}T23:59:00`).toISOString() : null;
    const { data, error: err } = await supabase
      .from('tasks')
      .insert({ title: title.trim(), notes: notes.trim() || null, due_at: due, priority })
      .select()
      .single();
    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? 'Could not save the task.');
      return;
    }
    const task = normalizeTask(data as Record<string, unknown>);
    window.dispatchEvent(new Event(REFRESH_COUNTS_EVENT));
    onCreated(`Task added: ${task.title}`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      description="A quick follow-up or to-do. It shows up on the Tasks page and in your Tasks badge when it is due."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Add task
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label="What needs doing?" htmlFor="nt-title" required>
          <Input id="nt-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up with the bakery owner" maxLength={160} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Due date" htmlFor="nt-date">
            <Input id="nt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Priority" htmlFor="nt-priority">
            <Select id="nt-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes (optional)" htmlFor="nt-notes">
          <Textarea id="nt-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember" />
        </Field>
      </form>
    </Modal>
  );
}

/** The "+" menu: Add lead, New task (modal), New deal. */
export function QuickCreate({ pushToast }: { pushToast: (kind: 'success' | 'info' | 'error', message: string) => void }) {
  const router = useRouter();
  const [taskOpen, setTaskOpen] = useState(false);

  useEffect(() => {
    const open = () => setTaskOpen(true);
    window.addEventListener(NEW_TASK_EVENT, open);
    return () => window.removeEventListener(NEW_TASK_EVENT, open);
  }, []);

  return (
    <>
      <Popover
        label="Create"
        role="menu"
        width="w-52"
        trigger={({ open: _o, ...p }) => (
          <IconButton {...p} label="Create new" variant="primary">
            <PlusIcon className="h-[18px] w-[18px]" />
          </IconButton>
        )}
      >
        {(close) => (
          <div className="p-1.5">
            <MenuLabel>Create</MenuLabel>
            <MenuItem
              icon={<CaptureIcon className="h-4 w-4" />}
              onClick={() => {
                close();
                router.push('/capture');
              }}
            >
              Add lead
            </MenuItem>
            <MenuItem
              icon={<TasksIcon className="h-4 w-4" />}
              onClick={() => {
                close();
                setTaskOpen(true);
              }}
            >
              New task
            </MenuItem>
            <MenuItem
              icon={<DealsIcon className="h-4 w-4" />}
              onClick={() => {
                close();
                router.push('/deals?new=1');
              }}
            >
              New deal
            </MenuItem>
          </div>
        )}
      </Popover>
      <NewTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} onCreated={(m) => pushToast('success', m)} />
    </>
  );
}

// Re-exported so the palette and pages can ask the shell to open the task modal.
export function requestNewTask() {
  window.dispatchEvent(new Event(NEW_TASK_EVENT));
}
