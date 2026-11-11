"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useJob } from '@/lib/jobs';
import { recordOutcome } from '@/lib/outreach';
import { ASSIST_CATEGORY, addToSuppressions, createFollowupTask, isSuppressed } from '@/lib/reply-assist';
import type { Lead, OutreachRow, ReplyRow, SendingSettings, Status } from '@/lib/types';
import type { AssistActionId } from '@/lib/types-intel';
import type { ToastItem } from '@/components/ui';
import { Badge, Button, JobNote, Notice, Spinner } from '@/components/ui';
import { CalendarIcon, CheckIcon, MailIcon, ShieldIcon, SparkIcon } from '@/components/Icons';
import DraftPanel from '@/components/DraftPanel';

type Props = {
  reply: ReplyRow;
  lead: Lead | null;
  /** The drafted answer to this reply, if there is one. */
  draft: OutreachRow | null;
  sending: SendingSettings;
  sentToday: number;
  workerOnline: boolean;
  onReload: () => void;
  onHandled?: () => void;
  onLeadStatus?: (status: Status) => void;
  pushToast: (kind: ToastItem['kind'], message: string) => void;
};

const NEEDS_DRAFT: AssistActionId[] = ['book_call', 'send_price', 'send_portfolio', 'answer'];

/** What the reply is, what to do next, and a drafted answer you review and send yourself. Nothing here sends. */
export default function ReplyAssistCard({ reply, lead, draft, sending, sentToday, workerOnline, onReload, onHandled, onLeadStatus, pushToast }: Props) {
  const job = useJob();
  const [open, setOpen] = useState(true);
  const [busyAction, setBusyAction] = useState<AssistActionId | null>(null);
  const [done, setDone] = useState<Set<AssistActionId>>(new Set());
  const [suppressed, setSuppressed] = useState(false);

  const assist = reply.assist;
  const pending = reply.assist_status === 'pending' || job.running;
  const email = assist?.suppress_email ?? reply.from_email ?? '';

  useEffect(() => {
    let alive = true;
    if (assist?.classification === 'unsubscribe' && email) void isSuppressed(email).then((v) => alive && setSuppressed(v));
    return () => {
      alive = false;
    };
  }, [assist?.classification, email]);

  // The draft panel edits one row. It is handed over as "step 1" so it behaves like a single email.
  const draftRows = useMemo(() => (draft ? [{ ...draft, step: 1 }] : []), [draft]);

  const suggest = async () => {
    const out = await job.start('reply_assist', { reply_id: reply.id });
    if (out.phase === 'done') pushToast('success', out.result?.category === 'unsubscribe' ? 'They asked to stop, so no pitch was written.' : 'Suggestion ready. Read it before sending.');
    else pushToast('error', out.error ?? 'Could not suggest a reply.');
    onReload();
  };

  const run = async (id: AssistActionId) => {
    setBusyAction(id);
    let err: string | null = null;
    let ok = 'Done.';
    if (id === 'create_task') {
      err = await createFollowupTask(reply.lead_id, assist?.task?.title ?? 'Follow up on the reply', assist?.task?.due_in_days ?? 2);
      ok = 'Task added.';
    } else if (id === 'add_suppression') {
      err = await addToSuppressions(email);
      if (!err) {
        setSuppressed(true);
        ok = `${email} will not be contacted again.`;
      }
    } else if (id === 'mark_won' || id === 'mark_lost') {
      const status: Status = id === 'mark_won' ? 'Won' : 'Lost';
      if (onLeadStatus) onLeadStatus(status);
      else if (reply.lead_id) {
        const { error } = await supabase.from('leads').update({ status }).eq('id', reply.lead_id);
        err = error?.message ?? null;
        if (!error) void recordOutcome(reply.lead_id, status);
      }
      ok = `Lead marked ${status}.`;
    } else if (id === 'mark_handled') {
      onHandled?.();
      ok = 'Marked as handled.';
    } else if (NEEDS_DRAFT.includes(id)) {
      setOpen(true);
      if (!draft) {
        setBusyAction(null);
        pushToast('info', 'There is no draft yet. Press Suggest reply.');
        return;
      }
    }
    setBusyAction(null);
    if (err) pushToast('error', err);
    else {
      if (!NEEDS_DRAFT.includes(id)) setDone((cur) => new Set(cur).add(id));
      if (!NEEDS_DRAFT.includes(id)) pushToast('success', ok);
    }
  };

  const cat = assist ? ASSIST_CATEGORY[assist.classification] : null;
  const stop = assist?.classification === 'unsubscribe';
  const draftSent = draft && draft.status !== 'draft' && draft.status !== 'failed';

  return (
    <section aria-label="Reply assistant" className="rounded-card border border-primary-border bg-primary-soft/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <SparkIcon className="h-3.5 w-3.5 text-primary-text" aria-hidden="true" />
          Reply assistant
        </h3>
        <Button size="sm" variant="secondary" onClick={() => void suggest()} disabled={pending} leftIcon={pending ? <Spinner className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}>
          {pending ? 'Reading the reply…' : assist ? 'Suggest again' : 'Suggest reply'}
        </Button>
      </div>
      <JobNote phase={job.phase} error={job.error} runningText="Reading their message and writing an answer. This takes about half a minute…" />
      {!workerOnline && !assist && <p className="mt-2 text-xs text-warning">The worker is off, so the suggestion waits until you start it.</p>}

      {!assist ? (
        <p className="mt-2 text-sm text-fg-muted">
          {reply.assist_status === 'failed'
            ? 'The last attempt failed. Press Suggest reply to try again.'
            : pending
              ? 'The worker is reading this reply. It appears here in a moment.'
              : 'Get a classification, a next step and a drafted answer. Nothing is sent until you click Send.'}
        </p>
      ) : (
        <div className="mt-2.5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {cat && <Badge tone={cat.tone}>{cat.label}</Badge>}
            {assist.mode === 'template' && <Badge tone="warning">Written from a template</Badge>}
            {suppressed && <Badge tone="neutral" icon={<ShieldIcon className="h-3 w-3" aria-hidden="true" />}>In do-not-contact</Badge>}
          </div>
          {assist.summary && <p className="break-words text-sm text-fg">{assist.summary}</p>}

          {stop && (
            <Notice tone="warn">
              <span className="font-semibold">They asked to stop.</span> No pitch was written. Add them to do-not-contact so nothing goes out again.
            </Notice>
          )}

          {assist.next_step && (
            <div>
              <p className="text-xs font-semibold text-fg-subtle">Suggested next step</p>
              {!stop && <p className="mt-0.5 break-words text-sm text-fg-muted">{assist.next_step.reason}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {assist.actions.map((a) => {
                  const isDone = done.has(a.id) || (a.id === 'add_suppression' && suppressed);
                  const needsDraft = NEEDS_DRAFT.includes(a.id);
                  const label = needsDraft && draft ? 'Open draft' : a.label;
                  return (
                    <Button
                      key={a.id}
                      size="sm"
                      variant={a.primary && !isDone ? 'primary' : 'secondary'}
                      disabled={isDone || busyAction !== null || (needsDraft && !draft && !pending)}
                      loading={busyAction === a.id}
                      leftIcon={
                        isDone ? <CheckIcon className="h-4 w-4" /> : a.id === 'create_task' ? <CalendarIcon className="h-4 w-4" /> : a.id === 'add_suppression' ? <ShieldIcon className="h-4 w-4" /> : needsDraft ? <MailIcon className="h-4 w-4" /> : undefined
                      }
                      onClick={() => void run(a.id)}
                    >
                      {isDone ? (a.id === 'add_suppression' ? 'In do-not-contact' : `${a.label}: done`) : label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {draft && lead && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-fg-subtle">Drafted reply {draftSent ? '(already handled)' : 'for you to review'}</p>
                <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded text-sm font-medium text-primary-text hover:underline">
                  {open ? 'Hide draft' : 'Open draft'}
                </button>
              </div>
              {open && (
                <div className="mt-2 rounded-card border border-border bg-surface p-3">
                  <DraftPanel
                    key={draft.id}
                    inline
                    replyId={reply.id}
                    lead={lead}
                    rows={draftRows}
                    sending={sending}
                    sentToday={sentToday}
                    workerOnline={workerOnline}
                    drafting={pending}
                    onClose={() => undefined}
                    onReload={onReload}
                    onWrite={() => void suggest()}
                    onLeadPatch={(id, patch) => void supabase.from('leads').update(patch).eq('id', id).then(() => onReload())}
                    pushToast={pushToast}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
