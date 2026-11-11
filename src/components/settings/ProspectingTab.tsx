"use client";

import { useJob } from '@/lib/jobs';
import { useSettingForm } from '@/lib/settings';
import { fmtDateTime } from '@/lib/format';
import type { ProspectingSettings } from '@/lib/types';
import { useShell } from '../AppShell';
import { SearchIcon } from '../Icons';
import { Card, Field, JobNote, Spinner, TagInput, Toggle, btnSecondary, inputCls } from '../ui';
import SaveBar from './SettingsSaveBar';

const OWNED: (keyof ProspectingSettings)[] = ['enabled', 'cities', 'business_types', 'per_run_limit', 'interval_hours'];

const KNOWN_TYPES: { id: string; label: string }[] = [
  { id: 'restaurant', label: 'Restaurants' },
  { id: 'cafe', label: 'Cafes' },
  { id: 'bakery', label: 'Bakeries' },
  { id: 'hairdresser', label: 'Hair salons' },
  { id: 'beauty', label: 'Beauty salons' },
  { id: 'dentist', label: 'Dentists' },
  { id: 'gym', label: 'Gyms' },
  { id: 'clothes', label: 'Clothes shops' },
  { id: 'florist', label: 'Florists' },
  { id: 'car_repair', label: 'Car repair' },
];

function describeResult(r: ProspectingSettings['last_result']): string | null {
  if (!r) return null;
  if (typeof r === 'string') return r;
  const found = typeof r.found === 'number' ? r.found : null;
  const inserted = typeof r.inserted === 'number' ? r.inserted : null;
  if (found === null && inserted === null) return null;
  return `found ${found ?? 0} businesses with no website, added ${inserted ?? 0} new ${inserted === 1 ? 'lead' : 'leads'}`;
}

export default function ProspectingTab() {
  const { pushToast } = useShell();
  const form = useSettingForm('prospecting', OWNED);
  const run = useJob();
  const p = form.draft;
  const extras = p.business_types.filter((t) => !KNOWN_TYPES.some((k) => k.id === t));

  const save = async (): Promise<boolean> => {
    const err = await form.save();
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', 'Local prospecting saved.');
    return true;
  };

  const toggleType = (id: string, on: boolean) => {
    const next = on ? [...p.business_types, id] : p.business_types.filter((t) => t !== id);
    form.patch({ business_types: next });
  };

  const runNow = async () => {
    if (form.dirty && !(await save())) return;
    const out = await run.start('prospect_local', {});
    if (out.phase === 'done') {
      const inserted = typeof out.result?.inserted === 'number' ? out.result.inserted : null;
      pushToast('success', inserted === null ? 'Search finished.' : `Search finished. ${inserted} new ${inserted === 1 ? 'lead' : 'leads'} added.`);
    } else {
      pushToast('error', out.error ?? 'The search failed.');
    }
    await form.reload();
  };

  const last = describeResult(form.saved.last_result);

  return (
    <div className="space-y-4">
      <Card
        title="Local prospecting"
        subtitle="Finds local businesses that have no website, using free OpenStreetMap data. They are good people to offer a first website."
      >
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Toggle
              id="pr-on"
              checked={p.enabled}
              onChange={(v) => form.patch({ enabled: v })}
              label="Look for prospects automatically"
              description="They show up under Local prospects on the Leads page. They never trigger alerts."
            />

            <Field label="Cities or areas" htmlFor="pr-cities" hint="Press Enter after each one, for example: Lahore, Karachi, Leeds.">
              <TagInput id="pr-cities" label="Cities" value={p.cities} onChange={(v) => form.patch({ cities: v })} placeholder="Add a city" />
            </Field>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg-muted">Kinds of business</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {KNOWN_TYPES.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-fg-muted hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={p.business_types.includes(t.id)}
                      onChange={(e) => toggleType(t.id, e.target.checked)}
                      className="h-4 w-4"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              label="Other kinds (advanced)"
              htmlFor="pr-extra"
              hint="OpenStreetMap tags such as shop=jewelry or amenity=pharmacy. Leave empty if you are not sure."
            >
              <TagInput
                id="pr-extra"
                label="Other kinds"
                value={extras}
                onChange={(v) => form.patch({ business_types: [...p.business_types.filter((t) => KNOWN_TYPES.some((k) => k.id === t)), ...v] })}
                placeholder="shop=jewelry"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Most new prospects per search" htmlFor="pr-limit">
                <input
                  id="pr-limit"
                  type="number"
                  min={1}
                  className={inputCls}
                  value={p.per_run_limit}
                  onChange={(e) => form.patch({ per_run_limit: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
              <Field label="Search again every (hours)" htmlFor="pr-interval">
                <input
                  id="pr-interval"
                  type="number"
                  min={1}
                  className={inputCls}
                  value={p.interval_hours}
                  onChange={(e) => form.patch({ interval_hours: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
            </div>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      <Card title="Find prospects now">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void runNow()} disabled={run.running || p.cities.length === 0} className={btnSecondary}>
            {run.running ? <Spinner /> : <SearchIcon className="h-4 w-4" />}
            Find prospects now
          </button>
          {p.cities.length === 0 && <span className="text-xs text-fg-subtle">Add at least one city first.</span>}
        </div>
        <div className="mt-3 space-y-1">
          <JobNote phase={run.phase} error={run.error} runningText="Searching OpenStreetMap. This can take a minute…" />
          <p className="text-xs text-fg-subtle">
            {form.saved.last_run ? `Last search: ${fmtDateTime(form.saved.last_run)}${last ? `, ${last}` : ''}.` : 'No search yet.'}
          </p>
          <p className="text-xs text-fg-subtle">OpenStreetMap is edited by volunteers, so check that a business is still open before you contact it.</p>
        </div>
      </Card>
    </div>
  );
}
