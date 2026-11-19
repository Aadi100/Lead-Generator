"use client";

import { useCallback, useEffect, useState } from 'react';
import { defaultSetting, loadSetting, patchSetting, useSettingForm } from '@/lib/settings';
import { useJob } from '@/lib/jobs';
import { fmtDateTime } from '@/lib/format';
import { emailError } from '@/lib/settings-validate';
import type { ProfileSummary } from '@/lib/types';
import { useShell } from '../AppShell';
import { SparkIcon } from '../Icons';
import {
  Card,
  Field,
  JobNote,
  Notice,
  RepeatableInput,
 
  Spinner,
  TagInput,
  btnPrimary,
  btnSecondary,
  inputCls,
  pill,
} from '../ui';
import Advanced from './Advanced';
import SaveBar from './SettingsSaveBar';

const SOURCE_STATUS = {
  ok: { label: 'Read', tone: 'bg-success-soft text-success ring-success-border' },
  blocked: { label: 'Blocked or needs a login', tone: 'bg-warning-soft text-warning ring-warning-border' },
  failed: { label: 'Could not read', tone: 'bg-danger-soft text-danger ring-danger-border' },
} as const;

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-sm text-fg-subtle">Nothing yet</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i} className="rounded-md bg-surface-2 px-2 py-0.5 text-sm text-fg-muted">
          {i}
        </li>
      ))}
    </ul>
  );
}

export default function ProfileTab() {
  const { pushToast } = useShell();
  const form = useSettingForm('profile');
  const learn = useJob();
  const [summary, setSummary] = useState<ProfileSummary>(() => defaultSetting('profile_summary'));
  const [voice, setVoice] = useState('');
  const [target, setTarget] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [savingSummary, setSavingSummary] = useState(false);
  const p = form.draft;
  const [emailTouched, setEmailTouched] = useState(false);

  const loadSummary = useCallback(async () => {
    const res = await loadSetting('profile_summary');
    if (res.error) return;
    setSummary(res.value);
    setVoice(res.value.voice);
    setTarget(res.value.keywords_target);
    setAvoid(res.value.keywords_avoid);
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const save = async (): Promise<boolean> => {
    const err = await form.save();
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', 'Profile saved.');
    return true;
  };

  const runLearn = async () => {
    if (form.dirty && !(await save())) return;
    const out = await learn.start('learn_profile', {});
    if (out.phase === 'done') pushToast('success', 'Done. I read your links.');
    else pushToast('error', out.error ?? 'Could not read your links.');
    await loadSummary();
  };

  const summaryDirty =
    voice !== summary.voice ||
    JSON.stringify(target) !== JSON.stringify(summary.keywords_target) ||
    JSON.stringify(avoid) !== JSON.stringify(summary.keywords_avoid);

  const saveSummary = async () => {
    setSavingSummary(true);
    // The worker rescores leads when generated_at changes, so editing keywords moves it forward.
    const res = await patchSetting('profile_summary', {
      voice,
      keywords_target: target,
      keywords_avoid: avoid,
      generated_at: new Date().toISOString(),
    });
    setSavingSummary(false);
    if (res.error || !res.value) {
      pushToast('error', `Could not save: ${res.error ?? 'unknown error'}`);
      return;
    }
    setSummary(res.value);
    pushToast('success', 'Saved. Lead scores will update in a minute.');
  };

  const hasLinks = p.websites.some((w) => w.trim()) || p.links.some((l) => l.trim());

  return (
    <div className="space-y-4">
      <Card title="Your details" subtitle="I use these in every message and to rank leads by how well they fit you.">
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="pf-name">
                <input id="pf-name" className={inputCls} value={p.your_name} onChange={(e) => form.patch({ your_name: e.target.value })} />
              </Field>
              <Field label="Your email" htmlFor="pf-email" error={emailTouched ? emailError(p.email) : null}>
                <input id="pf-email" type="email" className={inputCls} onBlur={() => setEmailTouched(true)} value={p.email} onChange={(e) => form.patch({ email: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="What do you do, in one line?" htmlFor="pf-headline" hint="For example: I build websites and brand identities for small restaurants.">
                  <input id="pf-headline" className={inputCls} value={p.headline} onChange={(e) => form.patch({ headline: e.target.value })} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Services you offer" htmlFor="pf-services" hint="Press Enter after each one, for example: websites, logo design, mobile apps.">
                  <TagInput id="pf-services" label="Services" value={p.services} onChange={(v) => form.patch({ services: v })} placeholder="Add a service" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Your websites and portfolio" htmlFor="pf-sites">
                  <RepeatableInput
                    id="pf-sites"
                    label="Website"
                    value={p.websites}
                    onChange={(v) => form.patch({ websites: v })}
                    placeholder="https://yourwebsite.com"
                    addLabel="Add another website"
                  />
                </Field>
              </div>
            </div>

            <Advanced id="profile" hint="Business name, location, social links, notes and email signature.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business name" htmlFor="pf-biz" hint="Leave empty if you work under your own name.">
                  <input id="pf-biz" className={inputCls} value={p.business_name} onChange={(e) => form.patch({ business_name: e.target.value })} />
                </Field>
                <Field label="Where you are" htmlFor="pf-loc">
                  <input id="pf-loc" className={inputCls} value={p.location} onChange={(e) => form.patch({ location: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Your social and profile links" htmlFor="pf-links" hint="LinkedIn, GitHub, Behance, Instagram, Upwork and so on. Some sites block reading, and I tell you which.">
                    <RepeatableInput
                      id="pf-links"
                      label="Profile link"
                      value={p.links}
                      onChange={(v) => form.patch({ links: v })}
                      placeholder="https://www.linkedin.com/in/you"
                      addLabel="Add another link"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Anything else I should know?" htmlFor="pf-notes" hint="Prices, what you will not do, the kind of clients you love.">
                    <textarea id="pf-notes" rows={3} className={`${inputCls} resize-y`} value={p.notes} onChange={(e) => form.patch({ notes: e.target.value })} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Email signature" htmlFor="pf-sig" hint="How your messages end, for example your name and website.">
                    <textarea id="pf-sig" rows={3} className={`${inputCls} resize-y`} value={p.signature} onChange={(e) => form.patch({ signature: e.target.value })} />
                  </Field>
                </div>
              </div>
            </Advanced>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      <Card
        title="What I learned about you"
        subtitle={summary.generated_at ? `${summary.mode === 'claude' ? 'Written by the AI writer' : 'Simple summary'} · ${fmtDateTime(summary.generated_at)}` : 'Not learned yet'}
        actions={
          <button type="button" onClick={() => void runLearn()} disabled={learn.running || !hasLinks} className={btnPrimary}>
            {learn.running ? <Spinner /> : <SparkIcon className="h-4 w-4" />}
            Learn from my links
          </button>
        }
      >
        {!hasLinks && <p className="text-sm text-fg-subtle">Add at least one website or link above, then press the button.</p>}
        <JobNote phase={learn.phase} error={learn.error} runningText="Reading your websites and profiles. This can take a minute…" />

        {summary.generated_at ? (
          <div className="mt-3 space-y-4">
            {summary.sources.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">What I could read</p>
                <ul className="space-y-1.5">
                  {summary.sources.map((s) => (
                    <li key={s.url} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`${pill} ${SOURCE_STATUS[s.status].tone}`}>{SOURCE_STATUS[s.status].label}</span>
                      <span className="min-w-0 break-all text-fg-muted">{s.url}</span>
                      {s.chars ? <span className="text-xs text-fg-subtle">{s.chars.toLocaleString()} characters</span> : null}
                    </li>
                  ))}
                </ul>
                {summary.sources.some((s) => s.status === 'blocked') && (
                  <p className="mt-2 text-xs text-fg-subtle">
                    Sites like LinkedIn and Instagram usually hide their pages from automatic readers. Add your own website or a GitHub link for the best result.
                  </p>
                )}
              </div>
            )}

            {summary.summary && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-muted">{summary.summary}</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">What you sell</p>
                <ChipList items={summary.what_you_sell} />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Your services</p>
                <ChipList items={summary.services} />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Who you help</p>
                <ChipList items={summary.ideal_customers} />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Your strengths</p>
                <ChipList items={summary.strengths} />
              </div>
            </div>

            {summary.portfolio_highlights.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Work worth mentioning</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-fg-muted">
                  {summary.portfolio_highlights.map((h) => (
                    <li key={h} className="break-words">
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-sm font-medium text-fg">You can fix anything I got wrong here.</p>
              <Field label="How you sound" htmlFor="ps-voice" hint="Pitches are written in this voice.">
                <textarea id="ps-voice" rows={3} className={`${inputCls} resize-y`} value={voice} onChange={(e) => setVoice(e.target.value)} />
              </Field>
              {summary.sample_phrases.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Phrases you use</p>
                  <ChipList items={summary.sample_phrases} />
                </div>
              )}
              <Field label="Words to look for in leads" htmlFor="ps-target" hint="Leads that mention these rank higher in Best match.">
                <TagInput id="ps-target" label="Words to look for" value={target} onChange={setTarget} placeholder="For example: shopify, restaurant" />
              </Field>
              <Field label="Words to avoid" htmlFor="ps-avoid" hint="Leads that mention these rank lower.">
                <TagInput id="ps-avoid" label="Words to avoid" value={avoid} onChange={setAvoid} placeholder="For example: wordpress plugin, cheap" />
              </Field>
              <button type="button" onClick={() => void saveSummary()} disabled={!summaryDirty || savingSummary} className={btnSecondary}>
                {savingSummary && <Spinner />}
                Save my corrections
              </button>
            </div>
          </div>
        ) : (
          !learn.running && <Notice tone="info">Nothing learned yet. Save your links above and press &quot;Learn from my links&quot;.</Notice>
        )}
      </Card>
    </div>
  );
}
