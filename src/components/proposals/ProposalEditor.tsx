"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell';
import { useShell } from '@/components/AppShell';
import { Badge, Banner, Button, Card, Field, Input, JobNote, Modal, Select, Skeleton, Textarea } from '@/components/ui';
import { CopyIcon, PlusIcon, SparkIcon, TrashIcon, XIcon } from '@/components/Icons';
import ShowDetails from '@/components/ShowDetails';
import SettingsSaveBar from '@/components/settings/SettingsSaveBar';
import { useJob } from '@/lib/jobs';
import { copyText } from '@/lib/clipboard';
import {
  DEFAULT_PROPOSAL_SETTINGS,
  PROPOSAL_STATUSES,
  STATUS_LABEL,
  addDaysIso,
  buildDoc,
  deleteProposal,
  docToText,
  effectiveStatus,
  fetchPackages,
  fetchProposal,
  joinScope,
  loadProposalSettings,
  money,
  scopeFromPackage,
  splitScope,
  syncDealFromProposal,
  totalOf,
  updateProposal,
  type Package,
  type Proposal,
  type ProposalSettings,
  type ProposalStatus,
} from '@/lib/proposals-data';
import { downloadProposalPdf, proposalFit, type Fit } from '@/lib/proposal-pdf';
import ProposalPreview from './ProposalPreview';
import { STATUS_TONE } from './status';

type Row = { label: string; price: string };
type Form = {
  title: string;
  client_name: string;
  client_email: string;
  summary: string;
  rows: Row[];
  discount: string;
  currency: string;
  timeline_days: string;
  valid_until: string;
  terms: string;
  notes: string;
  package_id: string;
  status: ProposalStatus;
};

const numOf = (s: string): number => {
  const n = Number(s.trim().replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function toForm(p: Proposal): Form {
  const { lines, discount } = splitScope(p.scope);
  return {
    title: p.title,
    client_name: p.client_name,
    client_email: p.client_email,
    summary: p.summary,
    rows: lines.map((l) => ({ label: l.label, price: l.price ? String(l.price) : '' })),
    discount: discount ? String(discount) : '',
    currency: p.currency,
    timeline_days: p.timeline_days ? String(p.timeline_days) : '',
    valid_until: p.valid_until ?? '',
    terms: p.terms,
    notes: p.notes,
    package_id: p.package_id ?? '',
    status: p.status,
  };
}

function scopeOf(f: Form) {
  return joinScope(
    f.rows.map((r) => ({ label: r.label, price: Math.max(0, numOf(r.price)) })),
    Math.max(0, numOf(f.discount)),
  );
}

export default function ProposalEditor({ id }: { id: string }) {
  const router = useRouter();
  const { pushToast } = useShell();
  const [saved, setSaved] = useState<Proposal | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProposalSettings>(DEFAULT_PROPOSAL_SETTINGS);
  const [packages, setPackages] = useState<Package[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'deal' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ai = useJob();
  const aiNote = useRef(false);

  const load = useCallback(async () => {
    try {
      const [p, s, pk] = await Promise.all([fetchProposal(id), loadProposalSettings(), fetchPackages().catch(() => [] as Package[])]);
      setSettings(s.value);
      setPackages(pk);
      if (!p) {
        setMissing(true);
        return;
      }
      setSaved(p);
      setForm(toForm(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the proposal');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const scope = useMemo(() => (form ? scopeOf(form) : []), [form]);
  const total = totalOf(scope);
  const doc = useMemo(
    () =>
      form
        ? buildDoc(
            {
              title: form.title,
              client_name: form.client_name,
              client_email: form.client_email,
              summary: form.summary,
              scope,
              currency: form.currency || 'USD',
              timeline_days: form.timeline_days ? Math.round(numOf(form.timeline_days)) : null,
              valid_until: form.valid_until || null,
              terms: form.terms,
            },
            settings,
          )
        : null,
    [form, scope, settings],
  );

  useEffect(() => {
    if (!doc) return;
    let dead = false;
    const t = setTimeout(() => {
      void proposalFit(doc)
        .then((f) => !dead && setFit(f))
        .catch(() => {});
    }, 300);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [doc]);

  const dirty = !!saved && !!form && JSON.stringify(form) !== JSON.stringify(toForm(saved));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setRow = (i: number, patch: Partial<Row>) => setForm((f) => (f ? { ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : f));

  // The AI summary fills the text box for you to edit. Nothing is saved until you press Save.
  useEffect(() => {
    if (ai.phase === 'done' && !aiNote.current) {
      aiNote.current = true;
      const text = typeof ai.result?.summary === 'string' ? ai.result.summary.trim() : '';
      if (text) {
        setForm((f) => (f ? { ...f, summary: text } : f));
        pushToast('success', 'Summary drafted. Read it, then save.');
      }
    }
    if (ai.phase === 'running') aiNote.current = false;
  }, [ai.phase, ai.result, pushToast]);

  const save = async (extra?: Partial<Proposal>): Promise<Proposal | null> => {
    if (!form || !saved) return null;
    setSaving(true);
    setSaveError(null);
    const res = await updateProposal(saved.id, {
      title: form.title,
      client_name: form.client_name,
      client_email: form.client_email,
      summary: form.summary,
      scope,
      currency: form.currency,
      timeline_days: form.timeline_days ? Math.round(numOf(form.timeline_days)) : null,
      valid_until: form.valid_until || null,
      terms: form.terms,
      notes: form.notes,
      package_id: form.package_id || null,
      status: form.status,
      ...extra,
    });
    setSaving(false);
    if (res.error || !res.proposal) {
      setSaveError(res.error ?? 'Could not save');
      return null;
    }
    setSaved(res.proposal);
    setForm(toForm(res.proposal));
    return res.proposal;
  };

  const choosePackage = (pid: string) => {
    const pkg = packages.find((p) => p.id === pid);
    if (!pkg || !form) {
      set('package_id', '');
      return;
    }
    const { lines } = splitScope(scopeFromPackage(pkg));
    setForm({
      ...form,
      package_id: pkg.id,
      rows: lines.map((l) => ({ label: l.label, price: l.price ? String(l.price) : '' })),
      currency: pkg.currency,
      timeline_days: pkg.timeline_days ? String(pkg.timeline_days) : form.timeline_days,
      title: form.title || pkg.name,
      summary: form.summary || pkg.description,
    });
  };

  const setStatus = async (status: ProposalStatus) => {
    if (!form || !saved) return;
    const now = new Date().toISOString();
    const extra: Partial<Proposal> = { status };
    if (status === 'sent') extra.sent_at = saved.sent_at ?? now;
    if (status === 'accepted') extra.accepted_at = now;
    const p = await save(extra);
    if (p) pushToast('success', `Marked ${STATUS_LABEL[status].toLowerCase()}`);
    else pushToast('error', 'Could not change the status');
  };

  const download = async () => {
    if (!doc) return;
    setBusy('pdf');
    try {
      const f = await downloadProposalPdf(doc);
      pushToast('success', f.hidden > 0 || f.termsCut ? 'PDF saved. It was long, so some detail was trimmed to fit one page.' : 'PDF saved');
    } catch (e) {
      pushToast('error', `Could not make the PDF: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
    setBusy(null);
  };

  const copy = async () => {
    if (!doc) return;
    const ok = await copyText(docToText(doc));
    pushToast(ok ? 'success' : 'error', ok ? 'Copied as text' : 'Could not copy');
  };

  const draftSummary = () => {
    if (!form) return;
    void ai.start('draft_proposal_summary', {
      lead_id: saved?.lead_id ?? null,
      title: form.title,
      client_name: form.client_name,
      items: form.rows.map((r) => r.label).filter(Boolean).slice(0, 12),
      timeline_days: form.timeline_days ? Math.round(numOf(form.timeline_days)) : null,
    });
  };

  const syncDeal = async () => {
    if (!saved) return;
    setBusy('deal');
    const current = dirty ? await save() : saved;
    if (!current) {
      setBusy(null);
      return;
    }
    const res = await syncDealFromProposal(current);
    if (res.error || !res.deal) {
      pushToast('error', `Could not update the deal: ${res.error ?? 'unknown error'}`);
    } else {
      await save({ deal_id: res.deal.id });
      pushToast('success', res.created ? 'Deal created at the Agreed stage' : 'Deal updated with the accepted price');
    }
    setBusy(null);
  };

  const remove = async () => {
    if (!saved) return;
    const err = await deleteProposal(saved.id);
    if (err) {
      pushToast('error', `Could not delete: ${err}`);
      return;
    }
    pushToast('success', 'Proposal deleted');
    router.push('/proposals');
  };

  if (missing || error) {
    return (
      <PageContainer>
        <PageHeader title="Proposal" breadcrumbs={[{ label: 'Proposals', href: '/proposals' }]} />
        <Banner
          tone={error ? 'danger' : 'warning'}
          title={error ? 'Could not load this proposal' : 'Proposal not found'}
          action={
            <Link href="/proposals" className="text-sm font-medium text-primary-text hover:underline">
              Back to proposals
            </Link>
          }
        >
          {error ?? 'It may have been deleted.'}
        </Banner>
      </PageContainer>
    );
  }
  if (!form || !saved || !doc) {
    return (
      <PageContainer>
        <PageHeader title="Proposal" breadcrumbs={[{ label: 'Proposals', href: '/proposals' }]} />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="h-[34rem] rounded-card" />
        </div>
      </PageContainer>
    );
  }

  const eff = effectiveStatus({ status: form.status, valid_until: form.valid_until || null });
  const activePackages = packages.filter((p) => p.active || p.id === form.package_id);
  const missingSettings = !settings.business_name && !settings.your_name;
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <PageContainer>
      <PageHeader
        title={form.title.trim() || 'Untitled proposal'}
        breadcrumbs={[{ label: 'Proposals', href: '/proposals' }]}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[eff]} dot>
              {STATUS_LABEL[eff]}
            </Badge>
            {saved.deal_id && (
              <Link href={`/deals?deal=${saved.deal_id}`} className="text-sm text-primary-text hover:underline">
                Open the deal
              </Link>
            )}
          </span>
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => void copy()} leftIcon={<CopyIcon className="h-4 w-4" />}>
              Copy as text
            </Button>
            <Button variant="primary" onClick={() => void download()} loading={busy === 'pdf'}>
              Download PDF
            </Button>
          </>
        }
      />

      {missingSettings && (
        <Banner
          tone="warning"
          title="Add your business details"
          className="mb-4"
          action={
            <Link href="/settings?tab=proposals" className="text-sm font-medium text-primary-text hover:underline">
              Add them in Settings
            </Link>
          }
        >
          The PDF header uses your name, email and website. They are empty right now.
        </Banner>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Card title="1. Pick a package" subtitle="Start from one of your packages (you can change everything after), then say who it is for.">
            <div className="mb-3 max-w-sm">
              <Field label="Package" htmlFor="pr-pkg" hint="Choosing one replaces the price lines in step 2.">
                <Select id="pr-pkg" value={form.package_id} onChange={(e) => choosePackage(e.target.value)}>
                  <option value="">No package</option>
                  {activePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.category}: {p.name} ({money(p.base_price, p.currency)})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Proposal title" htmlFor="pr-title">
                  <Input id="pr-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Website redesign for Acme" />
                </Field>
              </div>
              <Field label="Client name" htmlFor="pr-client">
                <Input id="pr-client" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} />
              </Field>
              <Field label="Client email" htmlFor="pr-email" hint="For your reference only. Nothing is emailed from here.">
                <Input id="pr-email" type="email" value={form.client_email} onChange={(e) => set('client_email', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="2. Edit the prices" subtitle="Change any line or price. A line with no price shows as Included.">
            <ul className="space-y-2">
              {form.rows.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Input aria-label={`Line ${i + 1} description`} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="What you deliver" className="min-w-0 flex-1" />
                  <Input aria-label={`Line ${i + 1} price`} inputMode="decimal" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} placeholder="Included" className="!w-28 text-right" />
                  <button
                    type="button"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })}
                    className="btn inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl text-fg-muted hover:bg-surface-2 coarse:h-10 coarse:w-10"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <Button size="sm" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setForm({ ...form, rows: [...form.rows, { label: '', price: '' }] })}>
                Add a line
              </Button>
            </div>
            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
              <Field label="Discount" htmlFor="pr-disc">
                <Input id="pr-disc" inputMode="decimal" value={form.discount} onChange={(e) => set('discount', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Currency" htmlFor="pr-cur">
                <Input id="pr-cur" value={form.currency} maxLength={6} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
              </Field>
              <div className="flex flex-col justify-end">
                <p className="text-[13px] font-medium text-fg-muted">Total</p>
                <p className="font-num text-xl font-semibold text-fg" aria-live="polite">
                  {money(total, form.currency || 'USD')}
                </p>
              </div>
            </div>
          </Card>

          <Card title="3. Check the details" subtitle="Read it over. The preview on the right shows exactly what the client gets.">
          <div className="space-y-4">
          <Field label="Summary" htmlFor="pr-summary" hint="Two or three plain sentences on what you will do and why.">
            <Textarea id="pr-summary" rows={4} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
          </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={draftSummary} disabled={ai.running} leftIcon={<SparkIcon className="h-4 w-4" />}>
                Draft summary with AI
              </Button>
              <JobNote phase={ai.phase} error={ai.error} runningText="The AI writer is working on it. You can keep editing." />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Timeline (days)" htmlFor="pr-days">
                <Input id="pr-days" inputMode="numeric" value={form.timeline_days} onChange={(e) => set('timeline_days', e.target.value.replace(/[^\d]/g, ''))} placeholder="14" />
              </Field>
              <Field label="Offer ends" htmlFor="pr-valid">
                <div className="flex gap-2">
                  <Input id="pr-valid" type="date" value={form.valid_until} onChange={(e) => set('valid_until', e.target.value)} />
                  <Button size="sm" onClick={() => set('valid_until', addDaysIso(settings.validity_days))} title={`${settings.validity_days} days from today`}>
                    +{settings.validity_days}d
                  </Button>
                </div>
              </Field>
            </div>
            <ShowDetails id="proposal-terms" title="Show terms and private notes" className="!mt-3">
            <div className="grid gap-3">
              <div className="sm:col-span-2">
                <Field label="Terms" htmlFor="pr-terms" hint={`The payment line on the PDF comes from Settings: ${settings.payment_terms || 'not set'}.`}>
                  <Textarea id="pr-terms" rows={4} value={form.terms} onChange={(e) => set('terms', e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Private notes" htmlFor="pr-notes" hint="Never shown on the proposal.">
                  <Textarea id="pr-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
              </div>
                        </div>
            </ShowDetails>
          </div>
          </Card>

          <Card title="4. Download it, then send it yourself" subtitle="Download the PDF and send it from your own email. Then mark it here so you can keep track. Marking it sent does not send anything.">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="lg" onClick={() => void download()} loading={busy === 'pdf'}>
                Download PDF
              </Button>
              <Button size="lg" onClick={() => void copy()} leftIcon={<CopyIcon className="h-4 w-4" />}>
                Copy as text
              </Button>
            </div>
            <p className="mb-1.5 text-[13px] font-medium text-fg-muted">Where is it now?</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <Select aria-label="Status" value={form.status} onChange={(e) => void setStatus(e.target.value as ProposalStatus)}>
                  {PROPOSAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </div>
              {form.status === 'draft' && <Button onClick={() => void setStatus('sent')}>Mark sent</Button>}
              {form.status === 'sent' && (
                <>
                  <Button variant="primary" onClick={() => void setStatus('accepted')}>
                    Mark accepted
                  </Button>
                  <Button onClick={() => void setStatus('declined')}>Mark declined</Button>
                </>
              )}
            </div>
            {saved.sent_at && (
              <p className="mt-2 text-xs text-fg-subtle">
                Marked sent {day(saved.sent_at)}
                {saved.accepted_at && form.status === 'accepted' ? `, accepted ${day(saved.accepted_at)}` : ''}.
              </p>
            )}
            {form.status === 'accepted' && (
              <Banner
                tone="success"
                title={saved.deal_id ? 'Update the linked deal?' : 'Create a deal for this work?'}
                className="mt-3"
                action={
                  <Button size="sm" variant="primary" loading={busy === 'deal'} onClick={() => void syncDeal()}>
                    {saved.deal_id ? 'Update deal' : 'Create deal'}
                  </Button>
                }
              >
                {saved.deal_id ? `Sets its value to ${money(total, form.currency)} and moves it to Agreed if it is still early.` : `Adds a deal worth ${money(total, form.currency)} at the Agreed stage.`}
              </Banner>
            )}
          </Card>

          <div className="flex justify-between">
            <Button variant="danger" onClick={() => setConfirmDelete(true)} leftIcon={<TrashIcon className="h-4 w-4" />}>
              Delete proposal
            </Button>
          </div>
          <SettingsSaveBar dirty={dirty} saving={saving} error={saveError} onSave={() => void save()} onReset={() => setForm(toForm(saved))} />
        </div>

        <aside className="min-w-0 lg:sticky lg:top-20" aria-label="Preview">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">What the client will see (one page)</h2>
            {fit && (fit.hidden > 0 || fit.termsCut ? <Badge tone="warning">Trimmed to fit one page</Badge> : fit.scale < 1 ? <Badge tone="info">Scaled to fit</Badge> : <Badge tone="success">Fits one page</Badge>)}
          </div>
          <ProposalPreview doc={doc} />
        </aside>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this proposal?"
        description="This cannot be undone. The lead and deal are left as they are."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-fg-muted">{form.title || 'Untitled proposal'}</p>
      </Modal>
    </PageContainer>
  );
}
