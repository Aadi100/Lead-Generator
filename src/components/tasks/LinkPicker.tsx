"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { SearchIcon, XIcon } from '@/components/Icons';
import { Input, cx } from '@/components/ui';
import { supabase } from '@/lib/supabaseClient';

export type TaskLink = { kind: 'lead' | 'deal'; id: string; title: string };

type Result = TaskLink;

/** Search leads (8) and deals (4) by title and pick one to link a task to. */
export function LinkPicker({ value, onChange, compact }: { value: TaskLink | null; onChange: (v: TaskLink | null) => void; compact?: boolean }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const q = text.trim().replace(/[%,()]/g, ' ');
    if (!open || q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      const [leads, deals] = await Promise.all([
        supabase.from('leads').select('id,title').ilike('title', `%${q}%`).order('created_at', { ascending: false }).limit(8),
        supabase.from('deals').select('id,title').ilike('title', `%${q}%`).order('updated_at', { ascending: false }).limit(4),
      ]);
      if (cancelled) return;
      const out: Result[] = [
        ...((leads.data ?? []) as { id: string; title: string }[]).map((r) => ({ kind: 'lead' as const, id: r.id, title: r.title })),
        ...((deals.data ?? []) as { id: string; title: string }[]).map((r) => ({ kind: 'deal' as const, id: r.id, title: r.title })),
      ];
      setResults(out);
      setBusy(false);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (value) {
    return (
      <span className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-ctl border border-primary-border bg-primary-soft py-1 pl-2.5 pr-1 text-[13px] text-primary-text">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">{value.kind}</span>
        <span className="min-w-0 truncate">{value.title}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Remove link to ${value.title}`}
          className="btn inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-primary-border/40 coarse:h-9 coarse:w-9"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <div ref={wrap} className={cx('relative', compact ? 'w-full' : 'w-full sm:w-64')}>
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        role="combobox"
        aria-expanded={open && text.trim().length >= 2}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Link to a lead or deal"
        placeholder="Link a lead or deal"
        className="!pl-8"
      />
      {open && text.trim().length >= 2 && (
        <ul id={listId} role="listbox" className="animate-pop glass-strong absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-card border border-border p-1 shadow-float">
          {results.length === 0 ? (
            <li className="px-2.5 py-2 text-[13px] text-fg-subtle" role="option" aria-selected="false">
              {busy ? 'Searching...' : 'No match'}
            </li>
          ) : (
            results.map((r) => (
              <li key={`${r.kind}-${r.id}`} role="option" aria-selected="false">
                <button
                  type="button"
                  onClick={() => {
                    onChange(r);
                    setText('');
                    setOpen(false);
                  }}
                  className="btn flex w-full cursor-pointer items-center gap-2 rounded-ctl px-2.5 py-1.5 text-left text-sm text-fg hover:bg-surface-2 coarse:min-h-11"
                >
                  <span className="w-9 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{r.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
