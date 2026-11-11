"use client";

import { useCallback, useEffect, useState } from 'react';
import { useShell } from '../AppShell';
import { PlusIcon, TrashIcon } from '../Icons';
import { Badge, Banner, Button, Card, Field, Input, Select, Skeleton, Switch, Textarea } from '../ui';
import SaveBar from './SettingsSaveBar';
import { CATEGORIES } from '@/lib/types';
import {
  DEFAULT_PROPOSAL_SETTINGS,
  deletePackage,
  fetchPackages,
  loadProposalSettings,
  money,
  savePackage,
  saveProposalSettings,
  type Package,
  type PackageCategory,
  type ProposalSettings,
} from '@/lib/proposals-data';

type Draft = Package & { dirty?: boolean; isNew?: boolean; deliverablesText: string; price: string; days: string };

const toDraft = (p: Package): Draft => ({ ...p, deliverablesText: p.deliverables.join('\n'), price: String(p.base_price), days: p.timeline_days ? String(p.timeline_days) : '' });

function PackageCard({ d, onChange, onSave, onDelete, busy }: { d: Draft; onChange: (patch: Partial<Draft>) => void; onSave: () => void; onDelete: () => void; busy: boolean }) {
  const id = `pk-${d.id || 'new'}`;
  return (
    <div className="rounded-card border border-border bg-surface-2/50 p-3">
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <Field label="Package name" htmlFor={`${id}-name`}>
            <Input id={`${id}-name`} value={d.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Category" htmlFor={`${id}-cat`}>
            <Select id={`${id}-cat`} value={d.category} onChange={(e) => onChange({ category: e.target.value as PackageCategory })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Price" htmlFor={`${id}-price`}>
            <Input id={`${id}-price`} inputMode="decimal" value={d.price} onChange={(e) => onChange({ price: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Currency" htmlFor={`${id}-cur`}>
            <Input id={`${id}-cur`} value={d.currency} maxLength={6} onChange={(e) => onChange({ currency: e.target.value.toUpperCase() })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Timeline (days)" htmlFor={`${id}-days`}>
            <Input id={`${id}-days`} inputMode="numeric" value={d.days} onChange={(e) => onChange({ days: e.target.value.replace(/[^\d]/g, '') })} />
          </Field>
        </div>
        <div className="sm:col-span-6">
          <Field label="Short description" htmlFor={`${id}-desc`}>
            <Input id={`${id}-desc`} value={d.description} onChange={(e) => onChange({ description: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-6">
          <Field label="Deliverables" htmlFor={`${id}-del`} hint="One per line. Each becomes an Included line on the proposal.">
            <Textarea id={`${id}-del`} rows={4} value={d.deliverablesText} onChange={(e) => onChange({ deliverablesText: e.target.value })} />
          </Field>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Switch checked={d.active} onChange={(v) => onChange({ active: v })} label="Offer this package" />
        <div className="flex items-center gap-2">
          <Button variant="danger" size="sm" onClick={onDelete} disabled={busy} leftIcon={<TrashIcon className="h-4 w-4" />}>
            Delete
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} loading={busy} disabled={!d.dirty && !d.isNew}>
            {d.isNew ? 'Add package' : 'Save package'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProposalsTab() {
  const { pushToast } = useShell();
  const [saved, setSaved] = useState<ProposalSettings>(DEFAULT_PROPOSAL_SETTINGS);
  const [draft, setDraft] = useState<ProposalSettings>(DEFAULT_PROPOSAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkgs, setPkgs] = useState<Draft[] | null>(null);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadProposalSettings();
    setSaved(res.value);
    setDraft(res.value);
    setError(res.error);
    setLoading(false);
    try {
      setPkgs((await fetchPackages()).map(toDraft));
      setPkgError(null);
    } catch (e) {
      setPkgError(e instanceof Error ? e.message : 'Could not load packages');
      setPkgs([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const patch = (p: Partial<ProposalSettings>) => setDraft((d) => ({ ...d, ...p }));

  const save = async () => {
    setSaving(true);
    const err = await saveProposalSettings(draft);
    setSaving(false);
    if (err) {
      setError(err);
      pushToast('error', `Could not save: ${err}`);
      return;
    }
    setError(null);
    setSaved(draft);
    pushToast('success', 'Proposal details saved.');
  };

  const changePkg = (key: string, p: Partial<Draft>) => setPkgs((l) => (l ? l.map((x) => ((x.id || 'new') === key ? { ...x, ...p, dirty: true } : x)) : l));

  const addPkg = () =>
    setPkgs((l) => [
      ...(l ?? []),
      toDraft({ id: '', name: '', description: '', category: 'Website', base_price: 0, currency: draft.currency || 'USD', timeline_days: null, deliverables: [], active: true, sort: ((l ?? []).length + 1) * 10 }),
    ].map((x, i, a) => (i === a.length - 1 ? { ...x, isNew: true } : x)));

  const persistPkg = async (d: Draft) => {
    setBusyId(d.id || 'new');
    const res = await savePackage({
      ...d,
      base_price: Number(d.price.replace(/,/g, '')) || 0,
      timeline_days: d.days ? Number(d.days) : null,
      deliverables: d.deliverablesText.split('\n'),
    });
    setBusyId(null);
    if (res.error || !res.pkg) {
      pushToast('error', `Could not save the package: ${res.error}`);
      return;
    }
    const fresh = toDraft(res.pkg);
    setPkgs((l) => (l ? l.map((x) => ((x.id || 'new') === (d.id || 'new') ? fresh : x)) : l));
    pushToast('success', 'Package saved.');
  };

  const removePkg = async (d: Draft) => {
    if (!d.id) {
      setPkgs((l) => (l ? l.filter((x) => x.id !== '') : l));
      return;
    }
    setBusyId(d.id);
    const err = await deletePackage(d.id);
    setBusyId(null);
    if (err) {
      pushToast('error', `Could not delete: ${err}`);
      return;
    }
    setPkgs((l) => (l ? l.filter((x) => x.id !== d.id) : l));
    pushToast('success', 'Package deleted. Proposals that used it keep their lines.');
  };

  if (loading) return <Skeleton className="h-72 w-full rounded-card" />;

  return (
    <div className="space-y-4">
      {error && (
        <Banner tone="danger" title="Settings problem">
          {error}
        </Banner>
      )}
      <Card title="Your business on the PDF" subtitle="Shown at the top of every proposal. Empty fields are taken from your profile.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name" htmlFor="ps-biz">
            <Input id="ps-biz" value={draft.business_name} onChange={(e) => patch({ business_name: e.target.value })} />
          </Field>
          <Field label="Your name" htmlFor="ps-name">
            <Input id="ps-name" value={draft.your_name} onChange={(e) => patch({ your_name: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="ps-email">
            <Input id="ps-email" type="email" value={draft.email} onChange={(e) => patch({ email: e.target.value })} />
          </Field>
          <Field label="Website" htmlFor="ps-web">
            <Input id="ps-web" value={draft.website} onChange={(e) => patch({ website: e.target.value })} />
          </Field>
          <Field label="Phone (optional)" htmlFor="ps-phone">
            <Input id="ps-phone" value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} />
          </Field>
          <Field label="Default currency" htmlFor="ps-cur">
            <Input id="ps-cur" value={draft.currency} maxLength={6} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Payment terms" htmlFor="ps-pay" hint="One line shown next to the timeline.">
              <Input id="ps-pay" value={draft.payment_terms} onChange={(e) => patch({ payment_terms: e.target.value })} />
            </Field>
          </div>
          <Field label="Valid for (days)" htmlFor="ps-valid" hint="New proposals expire this many days after you create them.">
            <Input id="ps-valid" inputMode="numeric" value={String(draft.validity_days)} onChange={(e) => patch({ validity_days: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Default terms" htmlFor="ps-terms" hint="Copied into each new proposal. You can edit it per proposal.">
              <Textarea id="ps-terms" rows={4} value={draft.terms} onChange={(e) => patch({ terms: e.target.value })} />
            </Field>
          </div>
        </div>
        <SaveBar dirty={dirty} saving={saving} error={error} onSave={() => void save()} onReset={() => setDraft(saved)} />
      </Card>

      <Card
        title="Packages"
        subtitle="Starting points for a proposal. The price and lines are only a start, you adjust them per client."
        actions={
          <Button size="sm" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={addPkg} disabled={(pkgs ?? []).some((p) => p.isNew)}>
            Add package
          </Button>
        }
      >
        {pkgError && (
          <Banner tone="danger" title="Could not load packages" className="mb-3">
            {pkgError}
          </Banner>
        )}
        {pkgs && pkgs.length === 0 && !pkgError && <p className="text-sm text-fg-muted">No packages yet. Add one, or build proposals from scratch.</p>}
        <ul className="space-y-3">
          {(pkgs ?? []).map((p) => (
            <li key={p.id || 'new'}>
              {!p.isNew && (
                <p className="mb-1 flex items-center gap-2 px-1 text-xs text-fg-subtle">
                  <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Offered' : 'Hidden'}</Badge>
                  {money(Number(p.price) || 0, p.currency)} · {p.category}
                </p>
              )}
              <PackageCard d={p} busy={busyId === (p.id || 'new')} onChange={(x) => changePkg(p.id || 'new', x)} onSave={() => void persistPkg(p)} onDelete={() => void removePkg(p)} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
