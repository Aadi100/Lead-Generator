"use client";

import { useJob } from '@/lib/jobs';
import { useSettingForm } from '@/lib/settings';
import { fmtDateTime } from '@/lib/format';
import type { TargetingSettings } from '@/lib/types';
import { useShell } from '../AppShell';
import { Card, Field, JobNote, Spinner, TagInput, btnSecondary, inputCls } from '../ui';
import Advanced from './Advanced';
import SaveBar from './SettingsSaveBar';

const OWNED: (keyof TargetingSettings)[] = ['keywords', 'topics', 'exclude', 'min_budget', 'work_description', 'job_description', 'updated_at'];
const MAX_TAGS = 40;
type ListKey = 'keywords' | 'topics' | 'exclude';

function clean(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, MAX_TAGS);
}

function Chips({ label, items, current, onAdd }: { label: string; items: string[]; current: string[]; onAdd: (v: string) => void }) {
  const fresh = items.filter((i) => !current.includes(i.trim().toLowerCase()));
  if (fresh.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {fresh.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onAdd(i)}
            className="rounded-full border border-primary-border bg-primary-soft px-2.5 py-1 text-sm text-primary-text hover:bg-primary-soft"
            aria-label={`Add ${i} to ${label}`}
          >
            + {i}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TargetingTab() {
  const { pushToast } = useShell();
  const form = useSettingForm('targeting', OWNED);
  const run = useJob();
  const t = form.draft;

  const save = async (): Promise<boolean> => {
    const err = await form.save({ updated_at: new Date().toISOString() });
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', 'Targeting saved. The next scrape run will use it.');
    return true;
  };

  const setList = (key: ListKey, values: string[]) => form.patch({ [key]: clean(values) } as Partial<TargetingSettings>);

  const addOne = (key: ListKey, value: string) => setList(key, [...t[key], value]);

  const addAll = () => {
    const s = form.saved.suggested;
    if (!s) return;
    form.patch({ keywords: clean([...t.keywords, ...s.keywords]), topics: clean([...t.topics, ...s.topics]), exclude: clean([...t.exclude, ...s.exclude]) });
  };

  const suggest = async () => {
    if (!t.work_description.trim() && !t.job_description.trim()) {
      pushToast('error', 'Write a short description of your work or the jobs you want first.');
      return;
    }
    if (form.dirty && !(await save())) return;
    const out = await run.start('suggest_keywords', {});
    if (out.phase === 'done') pushToast('success', 'New suggestions are ready below.');
    else pushToast('error', out.error ?? 'Could not make suggestions.');
    await form.reload();
  };

  const suggested = form.saved.suggested;
  const hasSuggestions = !!suggested && suggested.keywords.length + suggested.topics.length + suggested.exclude.length > 0;

  return (
    <div className="space-y-4">
      <Card
        title="Targeting"
        subtitle="Tell me what work you want. I use this to find leads on every source, to rank leads in Best match, and to write better pitches."
      >
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Field
              label="Describe the work you do"
              htmlFor="tg-work"
              hint="Plain words are fine. What you build, for whom, and what makes you good at it."
            >
              <textarea
                id="tg-work"
                rows={4}
                className={inputCls}
                value={t.work_description}
                onChange={(e) => form.patch({ work_description: e.target.value })}
                placeholder="Example: I build fast websites and online shops for small restaurants and cafes, and design their logos and menus."
              />
            </Field>

            <Field
              label="Describe the jobs or clients you want to win"
              htmlFor="tg-job"
              hint="The more specific, the better the matches."
            >
              <textarea
                id="tg-job"
                rows={4}
                className={inputCls}
                value={t.job_description}
                onChange={(e) => form.patch({ job_description: e.target.value })}
                placeholder="Example: Owners who need a new website or Shopify store in the next month, budget above $500, who write clearly about what they want."
              />
            </Field>

            <Field
              label="Words and phrases to look for"
              htmlFor="tg-keywords"
              hint={`Press Enter after each one. ${t.keywords.length}/${MAX_TAGS}. Example: next.js, shopify store, logo for a bakery.`}
            >
              <TagInput id="tg-keywords" label="Words and phrases to look for" value={t.keywords} onChange={(v) => setList('keywords', v)} placeholder="shopify store" />
            </Field>

            <Advanced id="targeting" hint="Topics, words to skip and the smallest budget.">
            <Field
              label="Topics and kinds of projects"
              htmlFor="tg-topics"
              hint={`${t.topics.length}/${MAX_TAGS}. Example: restaurant websites, SaaS dashboards.`}
            >
              <TagInput id="tg-topics" label="Topics and kinds of projects" value={t.topics} onChange={(v) => setList('topics', v)} placeholder="restaurant websites" />
            </Field>

            <Field
              label="Skip posts that mention"
              htmlFor="tg-exclude"
              hint={`${t.exclude.length}/${MAX_TAGS}. Example: unpaid, wordpress plugin.`}
            >
              <TagInput id="tg-exclude" label="Skip posts that mention" value={t.exclude} onChange={(v) => setList('exclude', v)} placeholder="unpaid" />
            </Field>

            <Field
              label="Smallest budget worth my time (USD)"
              htmlFor="tg-budget"
              hint="Cheaper posts are marked, not hidden. Leave empty for no limit."
            >
              <input
                id="tg-budget"
                type="number"
                min={0}
                step={50}
                className={inputCls}
                value={t.min_budget ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const num = Number(v);
                  form.patch({ min_budget: v === '' || !Number.isFinite(num) || num < 0 ? null : num });
                }}
                placeholder="300"
              />
            </Field>

            </Advanced>

            <p className="text-sm text-fg-subtle">
              Changes apply the next time lead finders run, usually within about 30 minutes. You do not need to restart anything.
              {form.saved.updated_at ? ` Last saved ${fmtDateTime(form.saved.updated_at)}.` : ''}
            </p>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      <Card
        title="Suggestions"
        subtitle="I read your two descriptions and suggest words, topics and things to skip. Nothing is added until you click it."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void suggest()} disabled={run.running} className={btnSecondary}>
            {run.running ? <Spinner /> : null}
            Suggest keywords from my descriptions
          </button>
          {hasSuggestions && (
            <button type="button" onClick={addAll} className={btnSecondary}>
              Add all
            </button>
          )}
        </div>
        <div className="mt-3 space-y-3">
          <JobNote phase={run.phase} error={run.error} runningText="Reading your descriptions. This can take a minute…" />
          {suggested && hasSuggestions ? (
            <>
              <p className="text-xs text-fg-subtle">
                Made {fmtDateTime(suggested.generated_at)}{suggested.mode === 'heuristic' ? ' with simple word counting because the AI was not available' : ' by the AI'}.
              </p>
              <Chips label="Words and phrases to look for" items={suggested.keywords} current={t.keywords} onAdd={(v) => addOne('keywords', v)} />
              <Chips label="Topics and kinds of projects" items={suggested.topics} current={t.topics} onAdd={(v) => addOne('topics', v)} />
              <Chips label="Skip posts that mention" items={suggested.exclude} current={t.exclude} onAdd={(v) => addOne('exclude', v)} />
              <p className="text-xs text-fg-subtle">Added items still need Save.</p>
            </>
          ) : (
            !run.running && <p className="text-xs text-fg-subtle">No suggestions yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
