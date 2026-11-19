"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { enqueueJob, waitForJob } from '@/lib/jobs';
import { groupByLead, recordOutcome, sentTodayCount, useOutreach, useReplies, type OutreachWithLead, type ReplyWithLead } from '@/lib/outreach';
import { bucketOutreach, parseTab, sortReplies, tabOfOutreach, type OutboxTab } from '@/lib/outbox-model';
import type { Lead, Status } from '@/lib/types';
import { useShell } from '@/components/AppShell';
import DraftPanel from '@/components/DraftPanel';
import { PageContainer, PageHeader } from '@/components/shell';
import { Banner, Button, Card, EmptyState, SkeletonRows, Stagger, Tabs } from '@/components/ui';
import { ChevronLeftIcon, InboxIcon, MailIcon, PauseIcon, SendIcon } from '@/components/Icons';
import { OutreachListItem, ReplyListItem } from '@/components/outbox/OutboxList';
import { OutreachPreview, ReplyPreview } from '@/components/outbox/OutboxPreview';
import ReplyAssistCard from '@/components/outbox/ReplyAssistCard';
import { ConfirmCancelModal, CreateTaskModal } from '@/components/outbox/OutboxDialogs';
import DailyLimitMeter from '@/components/outbox/DailyLimitMeter';

const EMPTY: Record<OutboxTab, { title: string; text: string }> = {
  review: { title: 'Nothing to review', text: 'When a message is written for a lead it shows up here for you to check. Open a lead and press Write pitch, or let the background helper draft them for your best leads.' },
  queue: { title: 'Nothing waiting', text: 'Emails you have approved, and follow-ups planned for later, wait here until they go out.' },
  sent: { title: 'Nothing sent yet', text: 'Sent emails and messages you marked as sent are listed here.' },
  replies: { title: 'No replies yet', text: 'When someone answers an email it appears here and the lead moves to Replied. To see replies, connect your inbox in Settings.' },
  problems: { title: 'No problems', text: 'If an email fails or is held back for a safety check, it shows up here with the reason and what to do.' },
};

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}

function OutboxView() {
  const { pushToast, sending, workerOnline, refreshCounts } = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const outreach = useOutreach();
  const replies = useReplies();
  const desktop = useIsDesktop();

  const tab = parseTab(params.get('tab'));
  const itemParam = params.get('item');

  const [panelLeadId, setPanelLeadId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const [cancelRow, setCancelRow] = useState<OutreachWithLead | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [replyBusy, setReplyBusy] = useState<string | null>(null);
  const [taskFor, setTaskFor] = useState<ReplyWithLead | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const setUrl = useCallback(
    (next: { tab?: OutboxTab; item?: string | null }) => {
      const q = new URLSearchParams(params.toString());
      const t = next.tab ?? tab;
      if (t === 'review') q.delete('tab');
      else q.set('tab', t);
      if (next.item) q.set('item', next.item);
      else q.delete('item');
      const s = q.toString();
      router.replace(s ? `/outbox?${s}` : '/outbox', { scroll: false });
    },
    [params, router, tab],
  );

  const days = sending.followup_days;
  const rows = outreach.rows;
  const buckets = useMemo(() => bucketOutreach(rows), [rows]);
  const sortedReplies = useMemo(() => sortReplies(replies.rows), [replies.rows]);
  const unhandled = replies.rows.filter((r) => !r.handled).length;
  const byLead = useMemo(() => groupByLead(rows), [rows]);
  const sentToday = useMemo(() => sentTodayCount(rows), [rows]);

  const outreachList: OutreachWithLead[] = tab === 'replies' ? [] : buckets[tab];
  const listIds = tab === 'replies' ? sortedReplies.map((r) => r.id) : outreachList.map((r) => r.id);
  const selectedId = itemParam && listIds.includes(itemParam) ? itemParam : desktop ? (listIds[0] ?? null) : null;
  const selectedRow = outreachList.find((r) => r.id === selectedId) ?? null;
  const selectedReply = sortedReplies.find((r) => r.id === selectedId) ?? null;

  // A shared link (?item=) may point at an item that lives in another tab.
  useEffect(() => {
    if (!itemParam || outreach.loading || replies.loading || listIds.includes(itemParam)) return;
    const r = rows.find((x) => x.id === itemParam);
    if (r) {
      const t = tabOfOutreach(r);
      if (t && t !== tab) setUrl({ tab: t, item: itemParam });
      return;
    }
    if (replies.rows.some((x) => x.id === itemParam) && tab !== 'replies') setUrl({ tab: 'replies', item: itemParam });
  }, [itemParam, outreach.loading, replies.loading, listIds, rows, replies.rows, tab, setUrl]);

  const panelLead: Lead | null = useMemo(() => {
    if (!panelLeadId) return null;
    return (byLead.get(panelLeadId) ?? []).find((r) => r.lead)?.lead ?? null;
  }, [panelLeadId, byLead]);

  const doCancel = useCallback(async () => {
    if (!cancelRow) return;
    setCancelBusy(true);
    const { data, error } = await supabase
      .from('outreach')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', cancelRow.id)
      .in('status', ['queued', 'scheduled'])
      .select('id');
    setCancelBusy(false);
    if (error || !data || data.length === 0) pushToast('error', `Could not cancel${error ? `: ${error.message}` : ': it may already be on its way.'}`);
    else pushToast('success', 'Cancelled.');
    setCancelRow(null);
    void outreach.reload();
  }, [cancelRow, pushToast, outreach]);

  const retryRow = useCallback(
    async (row: OutreachWithLead) => {
      setRetrying(row.id);
      const { error } = await supabase.from('outreach').update({ status: 'queued', error: null, updated_at: new Date().toISOString() }).eq('id', row.id);
      setRetrying(null);
      if (error) pushToast('error', `Could not retry: ${error.message}`);
      else pushToast('success', 'Queued again.');
      void outreach.reload();
    },
    [pushToast, outreach],
  );

  const markHandled = useCallback(
    async (reply: ReplyWithLead) => {
      setReplyBusy(reply.id);
      const { error } = await supabase.from('replies').update({ handled: true }).eq('id', reply.id);
      setReplyBusy(null);
      if (error) pushToast('error', `Could not update: ${error.message}`);
      else pushToast('success', 'Marked as handled.');
      void replies.reload();
      void refreshCounts?.();
    },
    [pushToast, replies, refreshCounts],
  );

  const setLeadStatus = useCallback(
    async (reply: ReplyWithLead, status: Status) => {
      if (!reply.lead_id) return;
      setReplyBusy(reply.id);
      const { data, error } = await supabase.from('leads').update({ status }).eq('id', reply.lead_id).select('id');
      if (error || !data || data.length === 0) {
        setReplyBusy(null);
        pushToast('error', `Could not update the lead${error ? `: ${error.message}` : '.'}`);
        return;
      }
      void recordOutcome(reply.lead_id, status);
      if (!reply.handled) await supabase.from('replies').update({ handled: true }).eq('id', reply.id);
      setReplyBusy(null);
      pushToast('success', `Lead marked ${status}.`);
      void replies.reload();
      void refreshCounts?.();
    },
    [pushToast, replies, refreshCounts],
  );

  const createTask = useCallback(
    async (title: string, due: string | null) => {
      if (!taskFor) return;
      setTaskBusy(true);
      const { error } = await supabase.from('tasks').insert({ title, lead_id: taskFor.lead_id, due_at: due, priority: 'normal' });
      setTaskBusy(false);
      if (error) {
        pushToast('error', `Could not add the task: ${error.message}`);
        return;
      }
      pushToast('success', 'Task added.');
      setTaskFor(null);
    },
    [taskFor, pushToast],
  );

  const patchLead = useCallback(
    async (id: string, patch: { status?: Status; pitched_at?: string }) => {
      const { error } = await supabase.from('leads').update(patch).eq('id', id);
      if (error) pushToast('error', `Could not update the lead: ${error.message}`);
      void outreach.reload();
    },
    [pushToast, outreach],
  );

  const writeDraft = useCallback(
    async (lead: Lead) => {
      setDrafting((cur) => new Set(cur).add(lead.id));
      const queued = await enqueueJob('draft_lead', { lead_id: lead.id });
      if (queued.error || !queued.job) {
        pushToast('error', `Could not start writing: ${queued.error ?? 'unknown error'}`);
      } else {
        const out = await waitForJob(queued.job.id);
        if (out.phase === 'done' && out.result?.ok !== false) pushToast('success', 'Your pitch is ready.');
        else pushToast('error', out.error ?? 'The pitch could not be written.');
        void outreach.reload();
      }
      setDrafting((cur) => {
        const next = new Set(cur);
        next.delete(lead.id);
        return next;
      });
    },
    [pushToast, outreach],
  );

  const loadError = outreach.error ?? replies.error;
  const loading = tab === 'replies' ? replies.loading && replies.rows.length === 0 : outreach.loading && rows.length === 0;
  const hasSelection = !!(selectedRow || selectedReply);
  const showList = desktop || !hasSelection;
  const showPreview = desktop || hasSelection;

  const select = (id: string) => setUrl({ item: id });

  return (
    <PageContainer>
      <PageHeader
        title="Outbox"
        subtitle="Check your messages, send them when you are happy, and see who replied."
        actions={<DailyLimitMeter sent={sentToday} limit={sending.daily_limit} paused={sending.paused} />}
      />

      <div className="mb-4 grid gap-2 empty:hidden">
        {sending.paused && (
          <Banner tone="warning" title="Sending is paused" action={<span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted"><PauseIcon className="h-3.5 w-3.5" aria-hidden="true" />Resume from the top bar</span>}>
            Nothing goes out until you resume. Emails you send now wait in line.
          </Banner>
        )}
        {!workerOnline && (
          <Banner tone="warning" title="The background helper is offline">
            Emails you send will wait in line until the helper is running. Start it (<span className="font-mono text-xs">npm run worker</span> in the project folder) and they go out.
          </Banner>
        )}
        {loadError && (
          <Banner
            tone="danger"
            title="Could not load everything"
            action={
              <Button size="sm" onClick={() => { void outreach.reload(); void replies.reload(); }}>
                Retry
              </Button>
            }
          >
            {loadError}
          </Banner>
        )}
      </div>

      <div className="mb-4 overflow-x-auto">
        <Tabs<OutboxTab>
          label="Outbox sections"
          active={tab}
          onChange={(t) => setUrl({ tab: t, item: null })}
          className="!flex-nowrap"
          tabs={[
            { id: 'review', label: 'To review', count: buckets.review.length },
            { id: 'queue', label: 'Sending & scheduled', count: buckets.queue.length },
            { id: 'sent', label: 'Sent', count: buckets.sent.length },
            { id: 'replies', label: 'Replies', count: unhandled },
            { id: 'problems', label: 'Problems', count: buckets.problems.length },
          ]}
        />
      </div>

      {loading ? (
        <SkeletonRows rows={6} rowClassName="h-20" />
      ) : listIds.length === 0 ? (
        <EmptyState
          icon={tab === 'replies' ? <InboxIcon className="h-5 w-5" aria-hidden="true" /> : tab === 'sent' || tab === 'queue' ? <SendIcon className="h-5 w-5" aria-hidden="true" /> : <MailIcon className="h-5 w-5" aria-hidden="true" />}
          title={EMPTY[tab].title}
          text={EMPTY[tab].text}
          action={tab === 'review' || tab === 'replies' ? (
            <Button variant="secondary" onClick={() => router.push(tab === 'review' ? '/leads' : '/settings')}>
              {tab === 'review' ? 'Find a lead to write to' : 'Connect your inbox'}
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
          {showList && (
            <div className="lg:max-h-[calc(100vh-17rem)] lg:overflow-y-auto lg:pr-1" role="list" aria-label="Messages">
              <Stagger className="grid gap-2" step={30}>
                {tab === 'replies'
                  ? sortedReplies.map((r) => <ReplyListItem key={r.id} reply={r} now={now} selected={r.id === selectedId} onSelect={select} />)
                  : outreachList.map((r) => <OutreachListItem key={r.id} row={r} days={days} now={now} selected={r.id === selectedId} onSelect={select} />)}
              </Stagger>
            </div>
          )}
          {showPreview && hasSelection && (
            <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-17rem)] lg:overflow-y-auto">
              {!desktop && (
                <Button variant="ghost" size="sm" className="-ml-2 mb-3" leftIcon={<ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setUrl({ item: null })}>
                  Back to list
                </Button>
              )}
              {selectedRow && (
                <OutreachPreview
                  key={selectedRow.id}
                  row={selectedRow}
                  tab={tab}
                  days={days}
                  now={now}
                  onReview={setPanelLeadId}
                  onCancel={setCancelRow}
                  onRetry={(r) => void retryRow(r)}
                  retrying={retrying === selectedRow.id}
                />
              )}
              {selectedReply && (
                <ReplyPreview
                  key={selectedReply.id}
                  reply={selectedReply}
                  now={now}
                  busy={replyBusy === selectedReply.id}
                  onHandled={(r) => void markHandled(r)}
                  onLeadStatus={(r, s) => void setLeadStatus(r, s)}
                  onCreateTask={setTaskFor}
                  assist={
                    selectedReply.lead_id ? (
                      <ReplyAssistCard
                        key={`${selectedReply.id}-${selectedReply.assist?.generated_at ?? selectedReply.assist_status ?? 'none'}`}
                        reply={selectedReply}
                        lead={selectedReply.lead}
                        draft={rows.find((r) => r.reply_to_id === selectedReply.id) ?? null}
                        sending={sending}
                        sentToday={sentToday}
                        workerOnline={workerOnline}
                        onReload={() => {
                          void outreach.reload();
                          void replies.reload();
                        }}
                        onHandled={() => void markHandled(selectedReply)}
                        onLeadStatus={(s) => void setLeadStatus(selectedReply, s)}
                        pushToast={pushToast}
                      />
                    ) : undefined
                  }
                />
              )}
            </Card>
          )}
        </div>
      )}

      <ConfirmCancelModal open={!!cancelRow} title={cancelRow?.lead?.title ?? ''} busy={cancelBusy} onClose={() => setCancelRow(null)} onConfirm={() => void doCancel()} />
      <CreateTaskModal reply={taskFor} busy={taskBusy} onClose={() => setTaskFor(null)} onCreate={(t, d) => void createTask(t, d)} />

      {panelLead && (
        <DraftPanel
          lead={panelLead}
          rows={byLead.get(panelLead.id) ?? []}
          sending={sending}
          sentToday={sentToday}
          workerOnline={workerOnline}
          drafting={drafting.has(panelLead.id)}
          onClose={() => setPanelLeadId(null)}
          onReload={() => void outreach.reload()}
          onWrite={writeDraft}
          onLeadPatch={(id, patch) => void patchLead(id, patch)}
          pushToast={pushToast}
        />
      )}
    </PageContainer>
  );
}

export default function OutboxPage() {
  return (
    <Suspense fallback={null}>
      <OutboxView />
    </Suspense>
  );
}
