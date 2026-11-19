"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useJob } from '@/lib/jobs';
import { recordOutcome } from '@/lib/outreach';
import { ASSIST_CATEGORY, addToSuppressions, createFollowupTask, isSuppressed } from '@/lib/reply-assist';
import type { Lead, OutreachRow, ReplyRow, SendingSettings, Status } from '@/lib/types';
import type { AssistActionId } from '@/lib/types-intel';
import type { ToastItem } from '@/components/ui';
import { Badge, Button, JobNote, MenuItem, Notice, Popover, Spinner } from '@/components/ui';
import { CalendarIcon, CheckIcon, ChevronIcon, MailIcon, ShieldIcon, SparkIcon } from '@/components/Icons';
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
        pushToast('info', 'There is no draft yet. Press Suggest an answer.');
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

  const stop = assist?.classification === 'unsubscribe';
  const draftSent = draft && draft.status !== 'draft' && draft.status !== 'failed';

  return (
    <section aria-label="Suggested answer" className="rounded-card border border-primary-border bg-primary-soft/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <SparkIcon className="h-4 w-4 text-primary-text" aria-hidden="true" />
          Suggested answer
        </h3>
        <Button size="sm" variant={assist ? 'ghost' : 'secondary'} onClick={() => void suggest()} disabled={pending} leftIcon={pending ? <Spinner className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}>
          {pending ? 'Reading the reply…' : assist ? 'Try again' : 'Suggest an answer'}
        </Button>
      </div>
      <JobNote phase={job.phase} error={job.error} runningText="Reading their message and writing an answer. This takes about half a minute…" />
      {!workerOnline && !assist && <p className="mt-2 text-xs text-warning">The background helper is offline, so the suggestion waits until you start it.</p>}

      {!assist ? (
        <p className="mt-2 text-sm text-fg-muted">
          {reply.assist_status === 'failed'
            ? 'The last attempt failed. Press Suggest an answer to try again.'
            : pending
              ? 'The AI writer is reading this reply. It appears here in a moment.'
              : 'Get a short summary, a next step and a drafted answer. Nothing is sent until you click Send.'}
        </p>
      ) : (
        <div className="mt-2.5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {assist.mode === 'template' && <Badge tone="warning">Written from a template, read it carefully</Badge>}
            {suppressed && <Badge tone="neutral" icon={<ShieldIcon className="h-3 w-3" aria-hidden="true" />}>On your do-not-contact list</Badge>}
          </div>
          {assist.summary && <p className="break-words text-sm text-fg">{assist.summary}</p>}

          {stop && (
            <Notice tone="warn">
              <span className="font-semibold">They asked to stop.</span> No pitch was written. Add them to do-not-contact so nothing goes out again.
            </Notice>
          )}

          {assist.next_step && (
            <div>
              <p className="text-[13px] font-semibold text-fg-subtle">What to do next</p>
              {!stop && <p className="mt-0.5 break-words text-sm text-fg-muted">{assist.next_step.reason}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(() => {
                  const render = (a: (typeof assist.actions)[number], big: boolean) => {
                    const isDone = done.has(a.id) || (a.id === 'add_suppression' && suppressed);
                    const needsDraft = NEEDS_DRAFT.includes(a.id);
                    const label = needsDraft && draft ? 'Open the drafted answer' : a.label;
                    return { a, isDone, needsDraft, label, big };
                  };
                  const primary = assist.actions.find((a) => a.primary) ?? assist.actions[0];
                  const others = assist.actions.filter((a) => a !== primary);
                  const p = primary ? render(primary, true) : null;
                  return (
                    <>
                      {p && (
                        <Button
                          size="md"
                          variant={p.isDone ? 'secondary' : 'primary'}
                          disabled={p.isDone || busyAction !== null || (p.needsDraft && !draft && !pending)}
                          loading={busyAction === p.a.id}
                          leftIcon={p.isDone ? <CheckIcon className="h-4 w-4" /> : p.a.id === 'create_task' ? <CalendarIcon className="h-4 w-4" /> : p.a.id === 'add_suppression' ? <ShieldIcon className="h-4 w-4" /> : p.needsDraft ? <MailIcon className="h-4 w-4" /> : undefined}
                          onClick={() => void run(p.a.id)}
                        >
                          {p.isDone ? (p.a.id === 'add_suppression' ? 'On do-not-contact list' : `${p.a.label}: done`) : p.label}
                        </Button>
                      )}
                      {others.length > 0 && (
                        <Popover
                          role="menu"
                          align="start"
                          width="w-64"
                          label="Other next steps"
                          trigger={({ open: _o, ...tp }) => (
                            <Button {...tp} size="md" variant="ghost" rightIcon={<ChevronIcon className="h-4 w-4" />}>
                              Other steps
                            </Button>
                          )}
                        >
                          {(close) => (
                            <div className="p-1.5">
                              {others.map((o) => {
                                const r = render(o, false);
                                return (
                                  <MenuItem
                                    key={o.id}
                                    disabled={r.isDone || busyAction !== null || (r.needsDraft && !draft && !pending)}
                                    icon={r.isDone ? <CheckIcon className="h-4 w-4" /> : undefined}
                                    onClick={() => {
                                      void run(o.id);
                                      close();
                                    }}
                                  >
                                    {r.isDone ? (o.id === 'add_suppression' ? 'On do-not-contact list' : `${o.label}: done`) : r.label}
                                  </MenuItem>
                                );
                              })}
                            </div>
                          )}
                        </Popover>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {draft && lead && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-fg-subtle">Your drafted answer {draftSent ? '(already handled)' : '(edit it, then send)'}</p>
                <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded text-sm font-medium text-primary-text hover:underline">
                  {open ? 'Hide' : 'Show'}
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
