"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { copyText } from '@/lib/clipboard';
import { useJob } from '@/lib/jobs';
import { EMAIL_STATUS_INFO, fmtDateTime, isHttpUrl, looksLikeEmail } from '@/lib/format';
import { OUTREACH_STATUS_LABEL, stepLabel } from '@/lib/outreach';
import type { Lead, OutreachChannel, OutreachRow, SendingSettings, Status, Warning } from '@/lib/types';
import type { ToastItem } from './Toast';
import { CheckIcon, CopyIcon, ExternalIcon, SendIcon, SparkIcon, ThumbDownIcon, ThumbUpIcon, XIcon } from './Icons';
import { JobNote, Notice, Select, Spinner, btnDark, btnPrimary, btnSecondary, inputCls, pill } from './ui';

type Edit = { subject: string; body: string };

type Props = {
  lead: Lead;
  rows: OutreachRow[];
  sending: SendingSettings;
  sentToday: number;
  workerOnline: boolean;
  drafting: boolean;
  onClose: () => void;
  onReload: () => void;
  onWrite: (lead: Lead) => void;
  onLeadPatch: (id: string, patch: { status?: Status; pitched_at?: string }) => void;
  pushToast: (kind: ToastItem['kind'], message: string) => void;
  /** Render the flow inside a page or panel (no overlay, no header, no focus trap). Default false = right-hand drawer. */
  inline?: boolean;
  /** Set when this panel shows a drafted answer to a reply (its row is passed in as step 1). Rewrites then go to the reply assistant. */
  replyId?: string;
};

const PLACEHOLDER_RE = /\[[^\]\n]{2,40}\]|\{\{|\}\}|<insert[^>]*>/i;
const LEVEL_STYLE: Record<Warning['level'], string> = {
  hard: 'border-danger-border bg-danger-soft text-danger',
  hold: 'border-warning-border bg-warning-soft text-warning',
  warn: 'border-border bg-surface-2 text-fg-muted',
};
const LEVEL_LABEL: Record<Warning['level'], string> = {
  hard: 'Cannot send',
  hold: 'Needs your OK',
  warn: 'Heads up',
};

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function DraftPanel({
  lead,
  rows,
  sending,
  sentToday,
  workerOnline,
  drafting,
  onClose,
  onReload,
  onWrite,
  onLeadPatch,
  pushToast,
  inline = false,
  replyId,
}: Props) {
  // Answers to replies (reply_to_id) are never part of the cold sequence: they only show in reply mode.
  const sorted = useMemo(() => rows.filter((r) => replyId || !r.reply_to_id).sort((a, b) => a.step - b.step), [rows, replyId]);
  const isTrade = lead.lead_kind === 'trade';
  const channel: OutreachChannel = isTrade ? 'manual' : (sorted[0]?.channel ?? 'email');
  const [step, setStep] = useState(sorted[0]?.step ?? 1);
  const row = sorted.find((r) => r.step === step) ?? sorted[0];

  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const editsRef = useRef<Record<number, Edit>>({});
  editsRef.current = edits;
  const dirty = useRef<Set<number>>(new Set());

  const [recipient, setRecipient] = useState('');
  const [customRecipient, setCustomRecipient] = useState(false);
  const recipientTouched = useRef(false);

  const [followups, setFollowups] = useState(sending.auto_followups);
  const [confirmSuspicious, setConfirmSuspicious] = useState(false);
  const [overrideHolds, setOverrideHolds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [note, setNote] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [copied, setCopied] = useState(false);

  const rewrite = useJob();
  const check = useJob();
  const closeRef = useRef<HTMLButtonElement>(null);

  const sig = sorted.map((r) => `${r.id}:${r.updated_at}:${r.status}`).join('|');

  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of sorted) {
        if (!dirty.current.has(r.step) || !(r.step in next)) next[r.step] = { subject: r.subject ?? '', body: r.body ?? '' };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const rowRecipient = sorted.find((r) => r.to_email)?.to_email ?? null;
  useEffect(() => {
    if (!recipientTouched.current) setRecipient(rowRecipient ?? lead.best_email ?? '');
  }, [rowRecipient, lead.best_email]);

  useEffect(() => {
    setRating(row?.rating ?? null);
    setNote(row?.feedback_note ?? '');
  }, [row?.id, row?.rating, row?.feedback_note]);

  useEffect(() => {
    const first = sorted.find((r) => r.step === 1);
    if (first) {
      setConfirmSuspicious(first.confirmed_suspicious);
      setOverrideHolds(first.override_warnings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length]);

  useEffect(() => {
    if (inline) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, inline]);

  const setField = (stepNo: number, field: keyof Edit, value: string) => {
    dirty.current.add(stepNo);
    setEdits((cur) => ({ ...cur, [stepNo]: { ...(cur[stepNo] ?? { subject: '', body: '' }), [field]: value } }));
  };

  const saveStep = useCallback(
    async (stepNo: number): Promise<boolean> => {
      const r = sorted.find((x) => x.step === stepNo);
      const e = editsRef.current[stepNo];
      if (!r || !e || r.status !== 'draft' || !dirty.current.has(stepNo)) return true;
      const { data, error } = await supabase
        .from('outreach')
        .update({ subject: e.subject, body: e.body, updated_at: new Date().toISOString() })
        .eq('id', r.id)
        .select('id');
      if (error || !data || data.length === 0) {
        pushToast('error', `Could not save your edit${error ? `: ${error.message}` : '.'}`);
        return false;
      }
      dirty.current.delete(stepNo);
      onReload();
      return true;
    },
    [sorted, pushToast, onReload],
  );

  const saveRecipient = async (email: string) => {
    const { error } = await supabase
      .from('outreach')
      .update({ to_email: email || null, updated_at: new Date().toISOString() })
      .eq('lead_id', lead.id)
      .in('status', ['draft', 'scheduled']);
    if (error) pushToast('error', `Could not save the recipient: ${error.message}`);
    else onReload();
  };

  const candidates = useMemo(() => {
    const list = [...lead.emails];
    if (lead.best_email && !list.some((e) => e.email.toLowerCase() === lead.best_email?.toLowerCase())) {
      list.unshift({ email: lead.best_email, status: lead.best_email_status ?? 'unknown', kind: null, source: null });
    }
    return list;
  }, [lead.emails, lead.best_email, lead.best_email_status]);

  const known = candidates.find((c) => c.email.toLowerCase() === recipient.trim().toLowerCase());
  const serverWarnings = useMemo(() => {
    const seen = new Set<string>();
    const out: Warning[] = [];
    sorted.forEach((r) =>
      r.warnings.forEach((w) => {
        const k = `${w.code}|${w.message}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(w);
        }
      }),
    );
    return out;
  }, [sorted]);

  const first = edits[1] ?? { subject: sorted.find((r) => r.step === 1)?.subject ?? '', body: sorted.find((r) => r.step === 1)?.body ?? '' };
  const clientWarnings: Warning[] = [];
  if (channel === 'email') {
    if (!recipient.trim()) clientWarnings.push({ level: 'hard', code: 'client_no_recipient', message: 'Choose who this email goes to.' });
    else if (!looksLikeEmail(recipient)) clientWarnings.push({ level: 'hard', code: 'client_bad_address', message: 'That does not look like an email address.' });
    else if (known && !EMAIL_STATUS_INFO[known.status].usable)
      clientWarnings.push({ level: 'hard', code: 'client_undeliverable', message: `This address looks undeliverable (${EMAIL_STATUS_INFO[known.status].label.toLowerCase()}).` });
    if (!first.subject.trim()) clientWarnings.push({ level: 'hard', code: 'client_no_subject', message: 'The first email needs a subject.' });
  }
  if (!first.body.trim()) clientWarnings.push({ level: 'hard', code: 'client_no_body', message: 'The message is empty.' });
  const allText = Object.values(edits)
    .map((e) => `${e.subject}\n${e.body}`)
    .join('\n');
  if (PLACEHOLDER_RE.test(allText) && !serverWarnings.some((w) => /placeholder/i.test(w.code))) {
    clientWarnings.push({ level: 'hold', code: 'client_placeholder', message: 'The text still has a placeholder like [Your Name]. Fix it before sending.' });
  }
  const warnings = [...clientWarnings, ...serverWarnings];
  const hardBlock = warnings.some((w) => w.level === 'hard');
  const holds = warnings.filter((w) => w.level === 'hold' && !/suspicious/i.test(w.code));
  const needsOverride = holds.length > 0;
  const suspiciousNeedsConfirm = lead.is_suspicious && sending.require_confirm_suspicious;

  const step1 = sorted.find((r) => r.step === 1);
  const editableStep1 = !!step1 && (step1.status === 'draft' || step1.status === 'failed');
  let blockReason: string | null = null;
  if (!editableStep1) blockReason = 'This message has already gone out or is on its way.';
  else if (sending.paused) blockReason = 'Sending is paused. Resume it first (red banner at the top).';
  else if (sending.provider === 'none') blockReason = 'Set up email sending in Settings first.';
  else if (hardBlock) blockReason = 'Fix the red problems above first.';
  else if (needsOverride && !overrideHolds) blockReason = 'Tick "Send anyway" to confirm the warnings.';
  else if (suspiciousNeedsConfirm && !confirmSuspicious) blockReason = 'Confirm that you checked this suspicious lead.';

  const followRows = sorted.filter((r) => r.step > 1);
  const draftRows = sorted.filter((r) => r.status === 'draft');
  const limitReached = sending.daily_limit > 0 && sentToday >= sending.daily_limit;

  const send = async () => {
    setBusy(true);
    const now = new Date().toISOString();
    const confirmed = confirmSuspicious || !sending.require_confirm_suspicious;
    const ordered = [...sorted].sort((a, b) => b.step - a.step);
    for (const r of ordered) {
      const e = editsRef.current[r.step] ?? { subject: r.subject ?? '', body: r.body ?? '' };
      let status: string | null = null;
      if (r.step === 1 && (r.status === 'draft' || r.status === 'failed')) status = 'queued';
      else if (r.step > 1 && r.status === 'draft') status = followups ? 'scheduled' : 'cancelled';
      if (!status) continue;
      const { data, error } = await supabase
        .from('outreach')
        .update({
          subject: e.subject,
          body: e.body,
          to_email: recipient.trim() || null,
          status,
          due_at: null,
          error: null,
          confirmed_suspicious: confirmed,
          override_warnings: overrideHolds,
          updated_at: now,
        })
        .eq('id', r.id)
        .select('id');
      if (error || !data || data.length === 0) {
        setBusy(false);
        pushToast('error', `Could not queue the email${error ? `: ${error.message}` : '.'} Nothing was sent.`);
        onReload();
        return;
      }
    }
    dirty.current.clear();
    setBusy(false);
    pushToast('success', limitReached ? 'Queued. Today’s limit is reached, so it goes out tomorrow.' : 'Queued. It goes out in a few seconds.');
    onReload();
    onClose();
  };

  const markSent = async () => {
    if (!row) return;
    setBusy(true);
    const now = new Date().toISOString();
    const e = editsRef.current[row.step] ?? { subject: row.subject ?? '', body: row.body ?? '' };
    const { data, error } = await supabase
      .from('outreach')
      .update({ subject: e.subject, body: e.body, status: 'sent', sent_at: now, updated_at: now })
      .eq('id', row.id)
      .select('id');
    setBusy(false);
    if (error || !data || data.length === 0) {
      pushToast('error', `Could not mark it as sent${error ? `: ${error.message}` : '.'}`);
      return;
    }
    dirty.current.delete(row.step);
    if (row.step === 1 && lead.status === 'New') onLeadPatch(lead.id, { status: 'Pitched', pitched_at: now });
    pushToast('success', 'Marked as sent.');
    onReload();
  };

  const copyActive = async () => {
    const e = edits[step];
    if (!e) return;
    const text = channel === 'email' && step === 1 && e.subject ? `${e.subject}\n\n${e.body}` : e.body;
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      pushToast('error', 'Could not copy. Select the text and copy it yourself.');
    }
  };

  const runRewrite = async () => {
    const text = instruction.trim();
    if (!text) return;
    for (const r of draftRows) await saveStep(r.step);
    const out = replyId ? await rewrite.start('reply_assist', { reply_id: replyId, instruction: text }) : await rewrite.start('rewrite_draft', { lead_id: lead.id, instruction: text });
    if (out.phase === 'done' && out.result?.ok !== false) {
      dirty.current.clear();
      setInstruction('');
      pushToast('success', 'Rewritten. Have a look.');
    } else if (out.phase !== 'done') {
      pushToast('error', out.error ?? 'The rewrite failed.');
    }
    onReload();
  };

  const runCheck = async () => {
    for (const r of draftRows) await saveStep(r.step);
    await check.start('check_outreach', { lead_id: lead.id });
    onReload();
  };

  const resetToAi = () => {
    if (!row || (row.original_body === null && row.original_subject === null)) return;
    dirty.current.add(row.step);
    setEdits((cur) => ({ ...cur, [row.step]: { subject: row.original_subject ?? '', body: row.original_body ?? '' } }));
  };

  const saveFeedback = async (value: 'good' | 'bad') => {
    if (!row) return;
    setRating(value);
    setSavingFeedback(true);
    const trimmed = note.trim();
    const { error } = await supabase
      .from('outreach')
      .update({ rating: value, feedback_note: trimmed || null, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      setSavingFeedback(false);
      pushToast('error', `Could not save your feedback: ${error.message}`);
      return;
    }
    const e = edits[row.step];
    await supabase.from('learning_events').insert({
      kind: 'rating',
      lead_id: lead.id,
      outreach_id: row.id,
      data: { rating: value, note: trimmed || null, subject: e?.subject ?? row.subject, body: e?.body ?? row.body },
    });
    setSavingFeedback(false);
    pushToast('success', 'Thanks. I will learn from that.');
  };

  const retryFailed = async () => {
    if (!row) return;
    setBusy(true);
    const { error } = await supabase
      .from('outreach')
      .update({ status: 'queued', error: null, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    setBusy(false);
    if (error) pushToast('error', `Could not retry: ${error.message}`);
    else {
      pushToast('success', 'Queued again.');
      onReload();
    }
  };

  const edit = row ? (edits[row.step] ?? { subject: row.subject ?? '', body: row.body ?? '' }) : { subject: '', body: '' };
  const rowEditable = row?.status === 'draft';
  const words = wordCount(edit.body);

  return (
    <div className={inline ? 'flex flex-col' : 'fixed inset-0 z-40'} role={inline ? undefined : 'presentation'}>
      {!inline && <div className="absolute inset-0" style={{ backgroundColor: 'rgb(var(--backdrop))' }} onClick={onClose} aria-hidden="true" />}
      <aside
        {...(inline ? {} : { role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'draft-title' })}
        className={inline ? 'flex flex-col' : 'glass-strong absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col shadow-float'}
      >
        {!inline && (
        <header className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {channel === 'email' ? 'Email pitch' : isTrade ? 'Message to paste into a direct message' : 'Message to paste (DM or bid)'}
            </p>
            <h2 id="draft-title" className="break-words text-base font-semibold leading-snug text-fg">
              {lead.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-fg-subtle hover:bg-surface-2 hover:text-fg"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </header>
        )}

        <div className={inline ? 'space-y-4' : 'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5'}>
          {sorted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong p-6 text-center">
              <p className="text-sm text-fg-muted">There is no pitch for this lead yet.</p>
              <button type="button" onClick={() => onWrite(lead)} disabled={drafting} className={`${btnPrimary} mt-3`}>
                {drafting ? <Spinner /> : <SparkIcon className="h-4 w-4" />}
                {drafting ? 'Writing the pitch…' : 'Write pitch'}
              </button>
              {!workerOnline && <p className="mt-2 text-xs text-warning">The worker is off, so this will wait until you start it.</p>}
            </div>
          ) : (
            <>
              <div className={sorted.length > 1 ? 'flex flex-wrap gap-1' : 'hidden'} role="tablist" aria-label="Messages in this pitch">
                {sorted.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="tab"
                    aria-selected={r.step === step}
                    onClick={() => setStep(r.step)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      r.step === step ? 'bg-fg text-canvas' : 'text-fg-muted hover:bg-surface-2'
                    }`}
                  >
                    {stepLabel(r.step, sending.followup_days, channel)}
                    {r.status !== 'draft' && (
                      <span className={`rounded-full px-1.5 text-[10px] uppercase ${r.step === step ? 'bg-canvas/25 text-canvas' : 'bg-surface-2 text-fg-subtle'}`}>
                        {OUTREACH_STATUS_LABEL[r.status]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {channel === 'manual' && (
                <Notice tone="info">
                  <span className="font-semibold">Lead Radar does not send this message.</span>{' '}
                  {isTrade
                    ? 'Copy it, open the post, and paste it into a direct message on Reddit or Discord yourself. Check the other person first, and use a middleman or escrow before any payment. When you have sent it, press "Mark as sent".'
                    : 'Copy it and paste it into the direct message or bid yourself. When you have sent it, press "Mark as sent".'}
                </Notice>
              )}

              {sorted.some((r) => r.status === 'failed') && row?.error && (
                <Notice tone="error">
                  <span className="font-semibold">Sending failed.</span> <span className="break-words">{row.error}</span>
                  {row.status === 'failed' && (
                    <button type="button" onClick={retryFailed} disabled={busy} className="ml-2 font-semibold underline">
                      Try again
                    </button>
                  )}
                </Notice>
              )}
              {step1?.status === 'draft' && step1.error && <Notice tone="warn">{step1.error}</Notice>}
              {row && row.status !== 'draft' && row.status !== 'failed' && (
                <Notice tone="info">
                  {OUTREACH_STATUS_LABEL[row.status]}
                  {row.sent_at ? ` on ${fmtDateTime(row.sent_at)}` : ''}
                  {row.due_at && row.status === 'scheduled' ? `. Goes out ${fmtDateTime(row.due_at)} if they have not replied.` : ''}
                  {row.status === 'scheduled' && !row.due_at ? '. It will be scheduled once the first email is sent.' : ''}
                </Notice>
              )}

              {channel === 'email' && (
                <div>
                  <label htmlFor="draft-to" className="mb-1 block text-sm font-medium text-fg-muted">
                    Send to
                  </label>
                  {customRecipient ? (
                    <input
                      id="draft-to"
                      type="email"
                      value={recipient}
                      placeholder="name@company.com"
                      onChange={(e) => {
                        recipientTouched.current = true;
                        setRecipient(e.target.value);
                      }}
                      onBlur={() => {
                        if (looksLikeEmail(recipient)) void saveRecipient(recipient.trim());
                      }}
                      disabled={!editableStep1}
                      className={inputCls}
                    />
                  ) : (
                    <Select
                      id="draft-to"
                      value={candidates.some((c) => c.email.toLowerCase() === recipient.toLowerCase()) ? recipient : recipient ? '__current__' : ''}
                      disabled={!editableStep1}
                      onChange={(e) => {
                        const v = e.target.value;
                        recipientTouched.current = true;
                        if (v === '__custom__') {
                          setCustomRecipient(true);
                          setRecipient('');
                        } else {
                          setRecipient(v);
                          void saveRecipient(v);
                        }
                      }}
                    >
                      {!recipient && <option value="">Choose an address…</option>}
                      {recipient && !candidates.some((c) => c.email.toLowerCase() === recipient.toLowerCase()) && (
                        <option value="__current__">{recipient}</option>
                      )}
                      {candidates.map((c) => (
                        <option key={c.email} value={c.email}>
                          {c.email} · {EMAIL_STATUS_INFO[c.status].label}
                        </option>
                      ))}
                      <option value="__custom__">Type a different address…</option>
                    </Select>
                  )}
                  {recipient && (
                    <p className="mt-1 text-xs text-fg-subtle">
                      {known ? (
                        <span className={`${pill} ${EMAIL_STATUS_INFO[known.status].tone}`}>{EMAIL_STATUS_INFO[known.status].label}</span>
                      ) : (
                        <span className={`${pill} ${EMAIL_STATUS_INFO.unknown.tone}`}>Not checked</span>
                      )}
                    </p>
                  )}
                </div>
              )}

              {row && channel === 'email' && row.step === 1 && (
                <div>
                  <label htmlFor="draft-subject" className="mb-1 block text-sm font-medium text-fg-muted">
                    Subject
                  </label>
                  <input
                    id="draft-subject"
                    value={edit.subject}
                    onChange={(e) => setField(row.step, 'subject', e.target.value)}
                    onBlur={() => void saveStep(row.step)}
                    disabled={!rowEditable}
                    className={inputCls}
                  />
                </div>
              )}
              {row && channel === 'email' && row.step > 1 && (
                <p className="text-sm text-fg-subtle">This follow-up is sent as a reply in the same conversation, so it has no subject of its own.</p>
              )}

              {row && (
                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="draft-body" className="block text-sm font-medium text-fg-muted">
                      Message
                    </label>
                    <span className={`text-xs tabular-nums ${words > 220 ? 'text-warning' : 'text-fg-subtle'}`}>{words} words</span>
                  </div>
                  <textarea
                    id="draft-body"
                    rows={12}
                    value={edit.body}
                    onChange={(e) => setField(row.step, 'body', e.target.value)}
                    onBlur={() => void saveStep(row.step)}
                    disabled={!rowEditable}
                    className={`${inputCls} resize-y leading-relaxed`}
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
                    {channel === 'email' && sending.footer.trim() && <span>Your footer is added when it is sent.</span>}
                    {rowEditable && (row.original_body !== null || row.original_subject !== null) && (
                      <button type="button" onClick={resetToAi} className="font-medium text-primary-text hover:underline">
                        Go back to the AI version
                      </button>
                    )}
                  </div>
                </div>
              )}

              {warnings.length > 0 && (
                <ul className="space-y-2" aria-label="Checks before sending">
                  {warnings.map((w) => (
                    <li key={`${w.code}|${w.message}`} className={`rounded-lg border px-3 py-2 text-sm ${LEVEL_STYLE[w.level]}`}>
                      <span className="mr-2 text-xs font-semibold uppercase tracking-wider">{LEVEL_LABEL[w.level]}</span>
                      <span className="break-words">{w.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              {rowEditable && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void runCheck()} disabled={check.running} className={btnSecondary}>
                    {check.running && <Spinner />}
                    Check again
                  </button>
                  <JobNote phase={check.phase} error={check.error} runningText="Checking…" />
                </div>
              )}

              {rowEditable && (
                <div className="rounded-lg border border-border bg-surface-2 p-3">
                  <label htmlFor="draft-rewrite" className="mb-1 block text-sm font-medium text-fg-muted">
                    Not quite right? Tell me what to change
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="draft-rewrite"
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void runRewrite();
                      }}
                      placeholder="For example: shorter, friendlier, mention their menu page"
                      className={inputCls}
                    />
                    <button type="button" onClick={() => void runRewrite()} disabled={rewrite.running || !instruction.trim()} className={btnDark}>
                      {rewrite.running ? <Spinner /> : <SparkIcon className="h-4 w-4" />}
                      Rewrite
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <JobNote phase={rewrite.phase} error={rewrite.error} runningText="Rewriting. This takes about 20 seconds…" />
                    <button type="button" onClick={() => onWrite(lead)} disabled={drafting} className="text-xs font-medium text-primary-text hover:underline disabled:opacity-50">
                      {drafting ? 'Writing again…' : 'Start over with a fresh pitch'}
                    </button>
                  </div>
                  {!workerOnline && <p className="mt-2 text-xs text-warning">The worker is off, so rewriting waits until you start it.</p>}
                </div>
              )}

              {row && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium text-fg-muted">Was this one good? Your answer teaches me your style.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={rating === 'good'}
                      onClick={() => void saveFeedback('good')}
                      disabled={savingFeedback}
                      className={`${btnSecondary} ${rating === 'good' ? 'border-success-border bg-success-soft text-success' : ''}`}
                    >
                      <ThumbUpIcon className="h-4 w-4" />
                      Good
                    </button>
                    <button
                      type="button"
                      aria-pressed={rating === 'bad'}
                      onClick={() => void saveFeedback('bad')}
                      disabled={savingFeedback}
                      className={`${btnSecondary} ${rating === 'bad' ? 'border-danger-border bg-danger-soft text-danger' : ''}`}
                    >
                      <ThumbDownIcon className="h-4 w-4" />
                      Needs work
                    </button>
                    <label htmlFor="draft-note" className="sr-only">
                      What should be different
                    </label>
                    <input
                      id="draft-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onBlur={() => {
                        if (rating && note.trim() !== (row.feedback_note ?? '')) void saveFeedback(rating);
                      }}
                      placeholder="Optional: what should be different?"
                      className={`${inputCls} min-w-0 flex-1`}
                    />
                  </div>
                </div>
              )}

              {channel === 'email' && editableStep1 && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {followRows.length > 0 && (
                    <label className="flex items-start gap-2 text-sm text-fg-muted">
                      <input type="checkbox" checked={followups} onChange={(e) => setFollowups(e.target.checked)} className="mt-1 h-4 w-4" />
                      <span>
                        Send follow-ups automatically ({sending.followup_days.slice(0, followRows.length).map((d) => `day ${d}`).join(' and ')}), but only if they have not replied.
                      </span>
                    </label>
                  )}
                  {needsOverride && (
                    <label className="flex items-start gap-2 text-sm text-fg-muted">
                      <input type="checkbox" checked={overrideHolds} onChange={(e) => setOverrideHolds(e.target.checked)} className="mt-1 h-4 w-4" />
                      <span>
                        <span className="font-medium">Send anyway.</span> I read the warnings above.
                      </span>
                    </label>
                  )}
                  {lead.is_suspicious && (
                    <label className="flex items-start gap-2 text-sm text-danger">
                      <input type="checkbox" checked={confirmSuspicious} onChange={(e) => setConfirmSuspicious(e.target.checked)} className="mt-1 h-4 w-4" />
                      <span>
                        <span className="font-medium">I checked this lead myself.</span> It was marked suspicious
                        {lead.flags.length > 0 ? ` (${lead.flags.join('; ')})` : ''}.
                      </span>
                    </label>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {sorted.length > 0 && (
          <footer className={inline ? 'sticky bottom-0 z-10 -mx-4 mt-4 border-t border-border bg-surface px-4 py-3' : 'border-t border-border bg-surface px-4 py-3 sm:px-5'}>
            {channel === 'email' ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-xs text-fg-subtle">
                  {blockReason ? (
                    <span className="text-warning">
                      {blockReason}{' '}
                      {sending.provider === 'none' && (
                        <Link href="/settings#email" className="font-semibold underline">
                          Open settings
                        </Link>
                      )}
                    </span>
                  ) : (
                    <>
                      Sent today: <span className="tabular-nums">{sentToday}</span> of <span className="tabular-nums">{sending.daily_limit}</span>
                      {limitReached && ' (limit reached, it will wait until tomorrow)'}
                      {!workerOnline && ' · The worker is off, so it will wait in the queue.'}
                    </>
                  )}
                </p>
                <button type="button" onClick={() => void send()} disabled={busy || !!blockReason} className={`${btnPrimary} min-h-11 px-6 text-base`}>
                  {busy ? <Spinner /> : <SendIcon className="h-5 w-5" />}
                  Send now
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void copyActive()} className={btnPrimary}>
                  {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy message'}
                </button>
                {isHttpUrl(lead.url) && (
                  <a href={lead.url} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                    Open post
                    <ExternalIcon className="h-4 w-4" />
                  </a>
                )}
                <button type="button" onClick={() => void markSent()} disabled={busy || !rowEditable} className={`${btnSecondary} ml-auto`}>
                  {busy && <Spinner />}
                  Mark as sent
                </button>
              </div>
            )}
          </footer>
        )}
      </aside>
    </div>
  );
}
