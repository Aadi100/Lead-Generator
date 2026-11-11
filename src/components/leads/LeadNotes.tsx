"use client";

import { useEffect, useRef, useState } from 'react';
import type { Lead } from '@/lib/types';
import type { ToastItem } from '@/components/ui';
import { CheckIcon } from '@/components/Icons';
import LeadTasks from './LeadTasks';

/** Notes (saved to leads.notes on blur) and the per-lead task list. */
export default function LeadNotes({
  lead,
  onNotes,
  pushToast,
  focusTaskSignal,
}: {
  lead: Lead;
  onNotes: (id: string, notes: string) => void;
  pushToast: (kind: ToastItem['kind'], message: string) => void;
  focusTaskSignal: number;
}) {
  const [draft, setDraft] = useState(lead.notes ?? '');
  const [saved, setSaved] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(lead.notes ?? '');
  }, [lead.notes]);

  const commit = () => {
    focused.current = false;
    if (draft !== (lead.notes ?? '')) {
      onNotes(lead.id, draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <section aria-label="Notes">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={`notes-${lead.id}`} className="text-sm font-semibold text-fg">
            Notes
          </label>
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle" role="status" aria-live="polite">
            {saved ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                Saved
              </>
            ) : (
              'Saved when you click away'
            )}
          </span>
        </div>
        <textarea
          id={`notes-${lead.id}`}
          rows={5}
          value={draft}
          placeholder="Anything worth remembering: what they said, what you promised, ideas for the pitch"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={commit}
          className="ctl w-full resize-y rounded-ctl border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-fg-subtle"
        />
      </section>
      <LeadTasks leadId={lead.id} pushToast={pushToast} focusSignal={focusTaskSignal} />
    </div>
  );
}
