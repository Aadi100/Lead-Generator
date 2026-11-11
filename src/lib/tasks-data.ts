// Tasks module helpers: date shortcuts, grouping, quick-add parsing and the week strip.
import type { Task } from './types-platform';

export type TaskGroupKey = 'overdue' | 'today' | 'upcoming' | 'nodate' | 'done';
export const GROUP_ORDER: TaskGroupKey[] = ['overdue', 'today', 'upcoming', 'nodate', 'done'];
export const GROUP_LABEL: Record<TaskGroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  nodate: 'No date',
  done: 'Done',
};

export const TASK_COLUMNS = 'id,lead_id,deal_id,title,notes,due_at,done,done_at,priority,created_at';

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Due dates are stored at 09:00 local of the chosen day so "today" never reads as already late. */
export function dueAtFor(day: Date): string {
  const x = startOfDay(day);
  x.setHours(9, 0, 0, 0);
  return x.toISOString();
}

export type DueShortcut = 'today' | 'tomorrow' | 'in3' | 'nextweek' | 'none';
export const DUE_SHORTCUTS: { id: DueShortcut; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'in3', label: 'In 3 days' },
  { id: 'nextweek', label: 'Next week' },
];

export function shortcutDate(id: DueShortcut, now = new Date()): Date | null {
  const t = startOfDay(now);
  if (id === 'today') return t;
  if (id === 'tomorrow') return addDays(t, 1);
  if (id === 'in3') return addDays(t, 3);
  if (id === 'nextweek') {
    const dow = t.getDay(); // 0 Sun
    const toMon = ((8 - dow) % 7) || 7;
    return addDays(t, toMon);
  }
  return null;
}

export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromDateInput(v: string): string | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return dueAtFor(new Date(y, m - 1, d));
}

export function groupOf(t: Task, now = new Date()): TaskGroupKey {
  if (t.done) return 'done';
  if (!t.due_at) return 'nodate';
  const due = new Date(t.due_at);
  if (Number.isNaN(due.getTime())) return 'nodate';
  const today = startOfDay(now);
  if (due < today) return 'overdue';
  if (due < addDays(today, 1)) return 'today';
  return 'upcoming';
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export function sortTasks(list: Task[], group: TaskGroupKey): Task[] {
  const out = [...list];
  out.sort((a, b) => {
    if (group === 'done') return (b.done_at ?? '').localeCompare(a.done_at ?? '');
    const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    if (da !== db) return da - db;
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return p !== 0 ? p : b.created_at.localeCompare(a.created_at);
  });
  return out;
}

export function dueLabel(iso: string | null, now = new Date()): string {
  if (!iso) return 'No date';
  const due = startOfDay(new Date(iso));
  const diff = Math.round((due.getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff} days late`;
  if (diff < 7) return due.toLocaleDateString('en-US', { weekday: 'long' });
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: due.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** Tasks created by the n8n Reminders workflow. */
export function isSuggested(title: string): boolean {
  return /^(follow up:|keep it moving:)/i.test(title.trim());
}

/** Pulls a due-date word out of the typed title: "Call Sam tomorrow" -> title "Call Sam", due tomorrow. */
export function parseQuickTitle(raw: string, now = new Date()): { title: string; due: Date | null } {
  let title = raw.trim();
  const rules: { re: RegExp; id: DueShortcut }[] = [
    { re: /\s+(?:in 3 days|in three days)$/i, id: 'in3' },
    { re: /\s+next week$/i, id: 'nextweek' },
    { re: /\s+tomorrow$/i, id: 'tomorrow' },
    { re: /\s+today$/i, id: 'today' },
  ];
  for (const r of rules) {
    if (r.re.test(title)) {
      const stripped = title.replace(r.re, '').trim();
      if (stripped) return { title: stripped, due: shortcutDate(r.id, now) };
    }
  }
  return { title, due: null };
}

export type WeekDay = { date: Date; key: string; count: number; overdue: number; isToday: boolean };

export function weekStrip(tasks: Task[], now = new Date()): WeekDay[] {
  const today = startOfDay(now);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    return { date, key: toDateInput(date.toISOString()), count: 0, overdue: 0, isToday: i === 0 };
  });
  for (const t of tasks) {
    if (t.done || !t.due_at) continue;
    const due = new Date(t.due_at);
    if (Number.isNaN(due.getTime())) continue;
    if (due < today) {
      days[0].overdue += 1;
      continue;
    }
    const key = toDateInput(t.due_at);
    const d = days.find((x) => x.key === key);
    if (d) d.count += 1;
  }
  return days;
}
