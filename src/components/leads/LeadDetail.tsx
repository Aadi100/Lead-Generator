"use client";

import { useState } from 'react';
import Link from 'next/link';
import type { Lead, OutreachRow, SendingSettings, Status } from '@/lib/types';
import { isHttpUrl, timeAgo } from '@/lib/format';
import type { ToastItem } from '@/components/ui';
import { Button, IconButton, Spinner, Tabs, cx } from '@/components/ui';
import { CalendarIcon, DealsIcon, ExternalIcon, MailIcon, SparkIcon, XIcon } from '@/components/Icons';
import DraftPanel from '@/components/DraftPanel';
import EnrichmentBlock from '@/components/EnrichmentBlock';
import LeadOverview from './LeadOverview';
import LeadNotes from './LeadNotes';
import { NEXT_STEP, StatusDot } from './LeadBits';

export type DetailTab = 'overview' | 'company' | 'messages' | 'notes';

const FLOW: Status[] = ['New', 'Pitched', 'Replied', 'Won', 'Lost'];

export type LeadDetailProps = {
  /** panel: fills its own scrolling column. drawer: sits inside a Drawer that scrolls and already has side padding. */
  mode: 'panel' | 'drawer';
  lead: Lead;
  rows: OutreachRow[];
  now: number;
  sending: SendingSettings;
  sentToday: number;
  workerOnline: boolean;
  drafting: boolean;
  enriching: boolean;
  onClose: () => void;
  onStatus: (id: string, status: Status) => void;
  onNotes: (id: string, notes: string) => void;
  onDraft: (lead: Lead) => Promise<void> | void;
  onEnrich: (lead: Lead) => void;
  onLeadPatch: (id: string, patch: { status?: Status; pitched_at?: string }) => void;
  onReload: () => void;
  pushToast: (kind: ToastItem['kind'], message: string) => void;
};

export default function LeadDetail(props: LeadDetailProps) {
  const { mode, lead, rows, now, sending, sentToday, workerOnline, drafting, enriching, onClose, onStatus, onNotes, onDraft, onEnrich, onLeadPatch, onReload, pushToast } = props;
  const [tab, setTab] = useState<DetailTab>('overview');
  const [taskSignal, setTaskSignal] = useState(0);

  const step1 = rows.find((r) => r.step === 1);
  const editable = step1?.status === 'draft';
  const canView = isHttpUrl(lead.url);
  const next = NEXT_STEP[lead.status];

  const write = async () => {
    setTab('messages');
    await onDraft(lead);
  };

  return (
    <div className={cx('flex flex-col', mode === 'panel' && 'h-full min-h-0')}>
      <header className={cx('shrink-0 space-y-3 border-b border-border pb-3', mode === 'panel' ? 'px-4 pt-4' : 'pt-0')}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
              <StatusDot status={lead.status} />
              <span className="font-medium text-fg-muted">{lead.status}</span>
              <span aria-hidden="true">·</span>
              <span>{lead.source}</span>
              <span aria-hidden="true">·</span>
              <span>{timeAgo(lead.created_at, now)}</span>
            </p>
            <h2 className="mt-1 break-words text-base font-semibold leading-snug text-fg">{lead.title}</h2>
          </div>
          <IconButton label="Close lead details" onClick={onClose} size="sm">
            <XIcon className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lead.status !== 'Ignored' &&
            (drafting ? (
              <Button variant="primary" disabled leftIcon={<Spinner className="h-4 w-4" />}>
                Writing the pitch…
              </Button>
            ) : rows.length === 0 ? (
              <Button variant="primary" onClick={() => void write()} leftIcon={<SparkIcon className="h-4 w-4" />}>
                Write pitch
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setTab('messages')} leftIcon={<MailIcon className="h-4 w-4" />}>
                {editable ? 'Review & send' : 'View pitch'}
              </Button>
            ))}
          {canView && (
            <a href={lead.url} target="_blank" rel="noopener noreferrer" className={cx('btn inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2 coarse:min-h-11')}>
              Open post
              <ExternalIcon className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          <Link
            href={`/deals?new=1&lead=${encodeURIComponent(lead.id)}`}
            className="btn inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2 coarse:min-h-11"
          >
            <DealsIcon className="h-4 w-4" aria-hidden="true" />
            Create deal
          </Link>
          <Button
            onClick={() => {
              setTab('notes');
              setTaskSignal((n) => n + 1);
            }}
            leftIcon={<CalendarIcon className="h-4 w-4" />}
          >
            Add task
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Lead status" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-ctl border border-border bg-surface-2 p-0.5">
            {FLOW.map((s) => {
              const on = lead.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => !on && onStatus(lead.id, s)}
                  className={cx(
                    'btn inline-flex min-h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-[13px] font-medium transition-colors duration-fast coarse:min-h-10',
                    on ? 'bg-surface text-fg shadow-md ring-1 ring-border' : 'text-fg-muted hover:text-fg',
                    !on && s === next && rows.length > 0 && 'text-primary-text',
                  )}
                >
                  <StatusDot status={s} className="h-1.5 w-1.5" />
                  {s}
                </button>
              );
            })}
          </div>
          {lead.status === 'Ignored' ? (
            <Button variant="primary" onClick={() => onStatus(lead.id, 'New')}>
              Restore
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onStatus(lead.id, 'Ignored')} className="hover:!bg-danger-soft hover:!text-danger">
              Ignore
            </Button>
          )}
        </div>
      </header>

      <div className={cx('shrink-0 pt-2', mode === 'panel' && 'px-4')}>
        <Tabs<DetailTab>
          variant="underline"
          label="Lead sections"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'company', label: 'Company' },
            { id: 'messages', label: 'Messages', count: rows.length || undefined },
            { id: 'notes', label: 'Notes & reminders' },
          ]}
        />
      </div>

      <div className={cx('py-4', mode === 'panel' && 'min-h-0 flex-1 overflow-y-auto px-4')} role="tabpanel" aria-label={tab}>
        {tab === 'overview' && <LeadOverview lead={lead} rows={rows} now={now} />}
        {tab === 'company' && <EnrichmentBlock key={lead.id} lead={lead} busy={enriching} onEnrich={() => onEnrich(lead)} now={now} defaultOpen />}
        {tab === 'messages' && (
          <DraftPanel
            key={lead.id}
            inline
            lead={lead}
            rows={rows}
            sending={sending}
            sentToday={sentToday}
            workerOnline={workerOnline}
            drafting={drafting}
            onClose={() => undefined}
            onReload={onReload}
            onWrite={(l) => void onDraft(l)}
            onLeadPatch={onLeadPatch}
            pushToast={pushToast}
          />
        )}
        {tab === 'notes' && <LeadNotes key={lead.id} lead={lead} onNotes={onNotes} pushToast={pushToast} focusTaskSignal={taskSignal} />}
      </div>
    </div>
  );
}
