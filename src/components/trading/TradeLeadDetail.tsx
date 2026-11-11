"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShell } from '@/components/AppShell';
import CopyChip from '@/components/CopyChip';
import DraftPanel from '@/components/DraftPanel';
import { ChevronLeftIcon, DealsIcon, ExternalIcon, PlusIcon, SendIcon, ShieldIcon, TasksIcon } from '@/components/Icons';
import { REFRESH_COUNTS_EVENT } from '@/components/shell';
import { Badge, Banner, Button, Field, Input, Modal, Skeleton, StatusBadge, Textarea, TrustBadge, cx } from '@/components/ui';
import { enqueueJob, waitForJob } from '@/lib/jobs';
import { budgetLabel, isHttpUrl, itemLabel, splitContact, timeAgo } from '@/lib/format';
import { normalizeOutreach, sentTodayCount, startOfToday } from '@/lib/outreach';
import { supabase } from '@/lib/supabaseClient';
import { useFullLead } from '@/lib/trading-data';
import { PriceVerdictPanel } from './PriceVsMarket';
import StockForBuyer from './StockForBuyer';
import { entryForLead, isScamFlag, marketMedian, priceVsLimit, priceVsMarket, type PriceNote } from '@/lib/trading-stats';
import type { TradingBundle } from '@/lib/trading-data';
import { STATUSES, type Lead, type OutreachRow, type Status } from '@/lib/types';

const NOTE_TONE: Record<PriceNote['tone'], string> = {
  success: 'border-success-border bg-success-soft text-success',
  warning: 'border-warning-border bg-warning-soft text-warning',
  danger: 'border-danger-border bg-danger-soft text-danger',
  neutral: 'border-border bg-surface-2 text-fg-muted',
};

export function PriceChip({ note }: { note: PriceNote }) {
  return <span className={cx('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', NOTE_TONE[note.tone])}>{note.text}</span>;
}

type Props = {
  preview: Lead;
  bundle: TradingBundle | null;
  onPatch: (id: string, patch: Partial<Lead>, failure: string) => Promise<boolean>;
  onBack: () => void;
};

function useLeadOutreach(leadId: string) {
  const [rows, setRows] = useState<OutreachRow[]>([]);
  const [sentToday, setSentToday] = useState(0);
  const reload = useCallback(async () => {
    const [mine, today] = await Promise.all([
      supabase.from('outreach').select('*').eq('lead_id', leadId).order('step', { ascending: true }),
      supabase.from('outreach').select('*').gte('sent_at', new Date(startOfToday()).toISOString()).limit(500),
    ]);
    setRows(((mine.data ?? []) as Record<string, unknown>[]).map(normalizeOutreach));
    setSentToday(sentTodayCount(((today.data ?? []) as Record<string, unknown>[]).map(normalizeOutreach)));
  }, [leadId]);
  useEffect(() => {
    setRows([]);
    void reload();
  }, [reload]);
  return { rows, sentToday, reload };
}

function AddTaskModal({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const { pushToast } = useShell();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(`Follow up: ${lead.title.slice(0, 60)}`);
      setDue('');
    }
  }, [open, lead.id, lead.title]);

  const shortcut = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDue(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const dueAt = due ? new Date(`${due}T09:00:00`).toISOString() : null;
    const { error } = await supabase.from('tasks').insert({ lead_id: lead.id, title: title.trim(), due_at: dueAt, priority: 'normal' });
    setSaving(false);
    if (error) {
      pushToast('error', `Could not add the task: ${error.message}`);
      return;
    }
    pushToast('success', 'Task added.');
    window.dispatchEvent(new Event(REFRESH_COUNTS_EVENT));
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a task"
      description="A reminder linked to this lead. You will find it on the Tasks page."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!title.trim()} onClick={() => void save()}>
            Add task
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="What needs doing?" htmlFor="tt-title">
          <Input id="tt-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Due date (optional)" htmlFor="tt-due">
          <Input id="tt-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => shortcut(0)}>
            Today
          </Button>
          <Button size="sm" onClick={() => shortcut(1)}>
            Tomorrow
          </Button>
          <Button size="sm" onClick={() => shortcut(3)}>
            In 3 days
          </Button>
          <Button size="sm" onClick={() => setDue('')}>
            No date
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TradeLeadDetail({ preview, bundle, onPatch, onBack }: Props) {
  const { pushToast, sending, workerOnline } = useShell();
  const { lead: full, loading, error, setLead } = useFullLead(preview.id);
  const lead: Lead = useMemo(() => ({ ...preview, ...(full ?? {}), status: preview.status, notes: preview.notes, trade_match: preview.trade_match, price_verdict: preview.price_verdict, price_pct: preview.price_pct, market_median: preview.market_median, market_samples: preview.market_samples, market_basis: preview.market_basis }), [preview, full]);
  const { rows, sentToday, reload: reloadOutreach } = useLeadOutreach(preview.id);
  const [panel, setPanel] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [notes, setNotes] = useState(preview.notes ?? '');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setNotes(preview.notes ?? '');
    setShowAll(false);
    setPanel(false);
  }, [preview.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSeller = lead.trade_side === 'seller';
  const entry = bundle ? entryForLead(lead, bundle.trading) : null;
  const med = bundle ? marketMedian(bundle.market.rows, lead.game, lead.item_type) : null;
  const limitNote = isSeller ? priceVsLimit(lead.budget_amount, entry) : null;
  const marketNote = priceVsMarket(lead.budget_amount, med);
  const price = budgetLabel(lead);
  const contacts = splitContact(lead.contact);
  const flags = lead.flags;
  const text = lead.description ?? '';
  const long = text.length > 700;
  const hasMessage = rows.length > 0;

  const setStatus = async (status: Status) => {
    if (status === lead.status) return;
    const patch: Partial<Lead> = { status };
    if (status === 'Pitched' && !lead.pitched_at) patch.pitched_at = new Date().toISOString();
    const ok = await onPatch(lead.id, patch, "Couldn't update the lead");
    if (ok) {
      setLead((cur) => (cur ? { ...cur, ...patch } : cur));
      if (status === 'Won' || status === 'Lost' || status === 'Ignored') {
        void supabase.from('learning_events').insert({ kind: 'outcome', lead_id: lead.id, data: { status } });
      }
    }
  };

  const saveNotes = async () => {
    const next = notes.trim() === '' ? null : notes;
    if (next === (preview.notes ?? null)) return;
    await onPatch(lead.id, { notes: next }, "Couldn't save the note");
  };

  const writeMessage = useCallback(
    async (l: Lead) => {
      setDrafting(true);
      const queued = await enqueueJob('draft_lead', { lead_id: l.id });
      if (queued.error || !queued.job) {
        pushToast('error', `Could not start writing: ${queued.error ?? 'unknown error'}`);
      } else {
        const out = await waitForJob(queued.job.id);
        if (out.phase === 'done' && out.result?.ok !== false) {
          pushToast('success', 'Your message is ready.');
          await reloadOutreach();
          setPanel(true);
        } else {
          pushToast('error', out.error ?? 'The message could not be written.');
        }
      }
      setDrafting(false);
    },
    [pushToast, reloadOutreach],
  );

  const patchFromPanel = useCallback(
    (id: string, patch: { status?: Status; pitched_at?: string }) => {
      void onPatch(id, patch, "Couldn't update the lead").then((ok) => {
        if (ok) setLead((cur) => (cur ? { ...cur, ...patch } : cur));
      });
    },
    [onPatch, setLead],
  );

  return (
    <div className="rounded-card border border-border bg-surface shadow-sm">
      <div className="border-b border-border p-4">
        <button type="button" onClick={onBack} className="btn mb-2 inline-flex min-h-8 cursor-pointer items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg lg:hidden">
          <ChevronLeftIcon className="h-4 w-4" /> Back to the list
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={isSeller ? 'info' : 'primary'}>{isSeller ? 'Selling' : 'Wants to buy'}</Badge>
          {lead.game && <Badge tone="accent">{lead.game}</Badge>}
          {lead.item_type && <Badge>{itemLabel(lead.item_type)}</Badge>}
          <StatusBadge status={lead.status} />
        </div>
        <h2 className="mt-2 break-words text-lg font-semibold leading-snug text-fg">{lead.title}</h2>
        <p className="mt-1 text-[13px] text-fg-subtle">
          {lead.source_detail ?? lead.source}
          {lead.author ? ` · ${lead.author}` : ''} · {timeAgo(lead.posted_at ?? lead.created_at)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {isHttpUrl(lead.url) && (
            <a href={lead.url} target="_blank" rel="noopener noreferrer" className="btn inline-flex min-h-8 items-center gap-1.5 rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2">
              <ExternalIcon className="h-4 w-4" /> Open post
            </a>
          )}
          <Link href={`/deals?new=1&lead=${lead.id}`} className="btn inline-flex min-h-8 items-center gap-1.5 rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2">
            <DealsIcon className="h-4 w-4" /> Create deal
          </Link>
          <Button leftIcon={<TasksIcon className="h-4 w-4" />} onClick={() => setTaskOpen(true)}>
            Add task
          </Button>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {lead.trade_match && (
          <Banner tone="success" title={lead.trade_match.startsWith('Buyer for your stock') ? 'This matches your stock' : 'This matches your catalog'}>
            {lead.trade_match}
          </Banner>
        )}

        <section aria-label="Price">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <p className="text-xs font-medium text-fg-subtle">{isSeller ? 'Asking price' : 'Offering'}</p>
              <p className="font-num text-2xl font-semibold text-fg">{price ?? 'Not stated'}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 pb-1">
              {limitNote && <PriceChip note={limitNote} />}
              {marketNote && <PriceChip note={marketNote} />}
            </div>
          </div>
          {isSeller && !entry && lead.budget_amount !== null && <p className="mt-1 text-xs text-fg-subtle">No matching item in your wish list, so there is no limit to compare with.</p>}
          <PriceVerdictPanel lead={lead} />
        </section>

        {!isSeller && <StockForBuyer lead={lead} />}

        <section aria-label="Trust and warning signs">
          <div className="flex flex-wrap items-center gap-2">
            <TrustBadge level={lead.trust_level} score={lead.trust_score} />
            {lead.is_suspicious && <Badge tone="danger">Looks suspicious</Badge>}
          </div>
          {flags.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {flags.map((f) => (
                <li key={f} className={cx('flex items-start gap-2 rounded-ctl border px-2.5 py-1.5 text-[13px]', isScamFlag(f) ? 'border-danger-border bg-danger-soft text-danger' : 'border-border bg-surface-2 text-fg-muted')}>
                  <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{f}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-fg-subtle">Never pay first. Use a middleman or the platform&apos;s escrow, and check the person&apos;s history.</p>
        </section>

        <section aria-label="The post">
          <h3 className="mb-1.5 text-sm font-semibold text-fg">What they wrote</h3>
          {loading && !full ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : error ? (
            <p className="text-sm text-danger">Could not load the full post: {error}</p>
          ) : text ? (
            <>
              <p className="whitespace-pre-wrap break-words rounded-ctl bg-surface-2/70 p-3 text-sm leading-relaxed text-fg">{long && !showAll ? `${text.slice(0, 700)}…` : text}</p>
              {long && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="btn mt-1 min-h-8 cursor-pointer text-[13px] font-medium text-primary-text hover:underline">
                  {showAll ? 'Show less' : 'Show the whole post'}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-fg-subtle">The post has no text beyond its title.</p>
          )}
        </section>

        {contacts.length > 0 && (
          <section aria-label="Contact">
            <h3 className="mb-1.5 text-sm font-semibold text-fg">Where to reach them</h3>
            <div className="flex flex-wrap gap-2">
              {contacts.map((c, i) => (
                <CopyChip key={`${c.value}-${i}`} label={c.label} value={c.value} />
              ))}
            </div>
          </section>
        )}

        <section aria-label="Message">
          <h3 className="mb-1.5 text-sm font-semibold text-fg">Your message</h3>
          <p className="mb-2 text-[13px] text-fg-subtle">Nothing is sent from here. Write the message, copy it, open the post and paste it as a reply or direct message, then mark it as sent.</p>
          <div className="flex flex-wrap items-center gap-2">
            {hasMessage ? (
              <Button variant="primary" leftIcon={<SendIcon className="h-4 w-4" />} onClick={() => setPanel(true)}>
                Review message
              </Button>
            ) : (
              <Button variant="primary" loading={drafting} leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => void writeMessage(lead)}>
                {drafting ? 'Writing…' : 'Write message'}
              </Button>
            )}
            {hasMessage && <span className="text-xs text-fg-subtle">Message state: {rows[0]?.status === 'sent' ? 'marked as sent' : 'draft ready'}</span>}
            {!workerOnline && !hasMessage && <span className="text-xs text-warning">The worker looks offline, so writing may not start.</span>}
          </div>
        </section>

        <section aria-label="Status">
          <h3 className="mb-1.5 text-sm font-semibold text-fg">Where is this lead?</h3>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Set the status">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void setStatus(s)}
                aria-pressed={lead.status === s}
                className={cx(
                  'btn inline-flex min-h-8 cursor-pointer items-center rounded-ctl border px-3 text-sm font-medium transition-colors duration-fast',
                  lead.status === s ? 'border-primary bg-primary text-primary-on' : 'border-border-strong bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Notes">
          <Field label="Notes" htmlFor="td-notes" hint="Saved when you click away.">
            <Textarea id="td-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => void saveNotes()} placeholder="Price you agreed, what they asked for, proof they sent..." />
          </Field>
        </section>
      </div>

      <AddTaskModal lead={lead} open={taskOpen} onClose={() => setTaskOpen(false)} />

      {panel && (
        <DraftPanel
          lead={lead}
          rows={rows}
          sending={sending}
          sentToday={sentToday}
          workerOnline={workerOnline}
          drafting={drafting}
          onClose={() => setPanel(false)}
          onReload={() => void reloadOutreach()}
          onWrite={(l) => void writeMessage(l)}
          onLeadPatch={patchFromPanel}
          pushToast={pushToast}
        />
      )}
    </div>
  );
}
