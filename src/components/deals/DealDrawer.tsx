"use client";

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { Button, Drawer, Field, Input, Modal, SegmentedControl, Select, StatusBadge, Textarea } from '@/components/ui';
import { XIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabaseClient';
import { STAGE_HINT } from '@/lib/deals-data';
import { DEAL_STAGES, DEAL_STAGE_LABEL, type Deal, type DealStage } from '@/lib/types-platform';
import { EMPTY_INPUT, createDeal, deleteDeal, inputFromDeal, profitOf, searchLeads, updateDeal, validateInput, money, type DealInput } from '@/lib/deals-data';

type LeadHit = { id: string; title: string; status: string; source: string };

function LeadPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const id = useId();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [focus, setFocus] = useState(false);
  const [picked, setPicked] = useState<LeadHit | null>(null);

  useEffect(() => {
    if (!value) {
      setPicked(null);
      return;
    }
    if (picked?.id === value) return;
    let dead = false;
    supabase
      .from('leads')
      .select('id,title,status,source')
      .eq('id', value)
      .maybeSingle()
      .then(({ data }) => {
        if (!dead && data) setPicked(data as LeadHit);
      });
    return () => {
      dead = true;
    };
  }, [value, picked?.id]);

  useEffect(() => {
    if (!focus) return;
    let dead = false;
    const t = setTimeout(async () => {
      const r = await searchLeads(term);
      if (!dead) setHits(r);
    }, 200);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [term, focus]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-ctl border border-border-strong bg-surface-2/60 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm">{picked?.title ?? 'Linked lead'}</span>
        {picked && <StatusBadge status={picked.status} />}
        <button type="button" onClick={() => onChange(null)} aria-label="Unlink lead" className="btn inline-flex h-6 w-6 items-center justify-center rounded-ctl text-fg-muted hover:bg-border coarse:h-9 coarse:w-9">
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={focus && hits.length > 0}
        aria-controls={`${id}-list`}
        autoComplete="off"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        placeholder="Search leads by title, company or author"
      />
      {focus && hits.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="glass-strong absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-ctl border border-border-strong p-1 shadow-float">
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected="false">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPicked(h);
                  onChange(h.id);
                  setTerm('');
                }}
                className="btn flex w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">{h.title}</span>
                <span className="shrink-0 text-xs text-fg-subtle">{h.source}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DealDrawer({
  open,
  deal,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  deal: Deal | null;
  initial: DealInput | null;
  onClose: () => void;
  onSaved: (d: Deal, created: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const { pushToast } = useShell();
  const uid = useId();
  const [form, setForm] = useState<DealInput>(EMPTY_INPUT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(deal ? inputFromDeal(deal) : initial ?? EMPTY_INPUT);
    setErrors({});
    setConfirmDelete(false);
  }, [open, deal, initial]);

  const set = <K extends keyof DealInput>(k: K, v: DealInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isTrade = form.kind === 'trade';
  const profit = profitOf({ value: form.value.trim() === '' ? null : Number(form.value), cost: form.cost.trim() === '' ? null : Number(form.cost) } as Deal);
  const showProfit = (form.value.trim() !== '' || form.cost.trim() !== '') && Number.isFinite(profit);

  const submit = async () => {
    const errs = validateInput(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const res = deal ? await updateDeal(deal, form) : await createDeal(form);
    setSaving(false);
    if (res.error || !res.deal) {
      pushToast('error', `Could not save the deal: ${res.error ?? 'unknown error'}`);
      return;
    }
    if (res.leadError) pushToast('warning', `Deal saved, but the lead status was not updated: ${res.leadError}`);
    else if (form.lead_id && (form.stage === 'done' || form.stage === 'cancelled')) pushToast('success', `Deal saved. Lead marked ${form.stage === 'done' ? 'Won' : 'Lost'}.`);
    else pushToast('success', deal ? 'Deal updated' : 'Deal created');
    onSaved(res.deal, !deal);
  };

  const remove = async () => {
    if (!deal) return;
    setSaving(true);
    const err = await deleteDeal(deal.id);
    setSaving(false);
    if (err) {
      pushToast('error', `Could not delete the deal: ${err}`);
      return;
    }
    setConfirmDelete(false);
    pushToast('success', 'Deal deleted');
    onDeleted(deal.id);
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={deal ? 'Edit deal' : 'New deal'}
        description={deal ? undefined : form.lead_id ? 'Prefilled from the lead. Change anything you like.' : 'Track a service job or a game trade from first chat to payment.'}
        width="max-w-[560px]"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            {deal ? (
              <div className="flex items-center gap-2">
                <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                  Delete
                </Button>
                {deal.kind === 'service' && (
                  <Link href={`/proposals?new=1&deal=${encodeURIComponent(deal.id)}`} className="btn inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2 coarse:min-h-11">
                    Create proposal
                  </Link>
                )}
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form={`${uid}-form`} loading={saving}>
                {deal ? 'Save changes' : 'Create deal'}
              </Button>
            </div>
          </div>
        }
      >
        <form
          id={`${uid}-form`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="mb-1 block text-sm font-medium text-fg">Kind</span>
              <SegmentedControl
                label="Kind"
                value={form.kind}
                onChange={(v) => setForm((f) => ({ ...f, kind: v, direction: v === 'service' ? 'sell' : f.direction }))}
                options={[
                  { id: 'service', label: 'Service' },
                  { id: 'trade', label: 'Game trade' },
                ]}
              />
            </div>
            {isTrade && (
              <div>
                <span className="mb-1 block text-sm font-medium text-fg">Direction</span>
                <SegmentedControl
                  label="Direction"
                  value={form.direction}
                  onChange={(v) => set('direction', v)}
                  options={[
                    { id: 'sell', label: 'I sell' },
                    { id: 'buy', label: 'I buy' },
                  ]}
                />
              </div>
            )}
          </div>

          <Field label="Title" htmlFor={`${uid}-title`} required error={errors.title}>
            <Input id={`${uid}-title`} value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} placeholder={isTrade ? 'Sell 500 gold on Server X' : 'Website redesign for Acme'} maxLength={200} autoFocus />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor={`${uid}-co`}>
              <Input id={`${uid}-co`} value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Business name" />
            </Field>
            <Field label="Contact" htmlFor={`${uid}-ct`}>
              <Input id={`${uid}-ct`} value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder="Name, email or handle" />
            </Field>
          </div>

          {isTrade && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Game" htmlFor={`${uid}-game`}>
                <Input id={`${uid}-game`} value={form.game} onChange={(e) => set('game', e.target.value)} placeholder="Game name" />
              </Field>
              <Field label="Item type" htmlFor={`${uid}-item`}>
                <Input id={`${uid}-item`} value={form.item_type} onChange={(e) => set('item_type', e.target.value)} placeholder="Currency, account, item" />
              </Field>
            </div>
          )}

          <Field label="Platform" htmlFor={`${uid}-plat`} hint="Where the deal happens: Reddit, Eldorado, Upwork and so on.">
            <Input id={`${uid}-plat`} value={form.platform} onChange={(e) => set('platform', e.target.value)} placeholder="Upwork, Reddit, Eldorado..." />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Value" htmlFor={`${uid}-val`} error={errors.value} hint={form.direction === 'buy' && isTrade ? 'What you pay' : 'What they pay you'}>
              <Input id={`${uid}-val`} inputMode="decimal" value={form.value} onChange={(e) => set('value', e.target.value)} invalid={!!errors.value} placeholder="0" className="font-num" />
            </Field>
            <Field label="Cost" htmlFor={`${uid}-cost`} error={errors.cost} hint="What it costs you">
              <Input id={`${uid}-cost`} inputMode="decimal" value={form.cost} onChange={(e) => set('cost', e.target.value)} invalid={!!errors.cost} placeholder="0" className="font-num" />
            </Field>
            <Field label="Currency" htmlFor={`${uid}-cur`}>
              <Input id={`${uid}-cur`} value={form.currency} onChange={(e) => set('currency', e.target.value)} maxLength={6} className="font-num uppercase" />
            </Field>
          </div>
          {showProfit && (
            <p className="-mt-2 text-sm text-fg-muted" role="status">
              Profit: <span className={`font-num font-semibold ${profit < 0 ? 'text-danger' : 'text-success'}`}>{money(profit, form.currency.trim().toUpperCase() || 'USD')}</span>
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Stage" htmlFor={`${uid}-stage`} hint={form.lead_id && (form.stage === 'done' || form.stage === 'cancelled') ? `Saving will mark the linked lead ${form.stage === 'done' ? 'Won' : 'Lost'}.` : STAGE_HINT[form.stage]}>
              <Select id={`${uid}-stage`} value={form.stage} onChange={(e) => set('stage', e.target.value as DealStage)}>
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {DEAL_STAGE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected close" htmlFor={`${uid}-exp`}>
              <Input id={`${uid}-exp`} type="date" value={form.expected_close} onChange={(e) => set('expected_close', e.target.value)} />
            </Field>
          </div>

          <Field label="Linked lead" htmlFor={`${uid}-lead`} hint="Optional. Finishing the deal updates this lead.">
            <LeadPicker value={form.lead_id} onChange={(id) => set('lead_id', id)} />
          </Field>

          <Field label="Notes" htmlFor={`${uid}-notes`}>
            <Textarea id={`${uid}-notes`} rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </form>
      </Drawer>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this deal?" description="This cannot be undone. The linked lead is left as it is." size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmDelete(false)}>Keep deal</Button>
            <Button variant="danger" onClick={() => void remove()} loading={saving}>
              Delete deal
            </Button>
          </div>
        }
      >
        <p className="p-4 text-sm text-fg-muted">{deal?.title}</p>
      </Modal>
    </>
  );
}
