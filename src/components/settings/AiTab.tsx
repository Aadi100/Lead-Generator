"use client";

import { useSettingForm } from '@/lib/settings';
import { useJob } from '@/lib/jobs';
import type { AiKeyProvider, AiProvider } from '@/lib/types';
import { useShell } from '../AppShell';
import { SendIcon } from '../Icons';
import { Card, Field, JobNote, Spinner, btnSecondary, cx, inputCls } from '../ui';
import SaveBar from './SettingsSaveBar';
import SecretInput from './SecretInput';

const CHOICES: { id: AiProvider; title: string; text: string; badge?: string }[] = [
  { id: 'anthropic', title: 'Claude', text: 'Uses a Claude API key from console.anthropic.com. Pay as you go.' },
  { id: 'gemini', title: 'Google Gemini', text: 'Uses a Gemini key from aistudio.google.com. Has a free tier.', badge: 'Free tier' },
  { id: 'deepseek', title: 'DeepSeek', text: 'Uses a DeepSeek key from platform.deepseek.com. Very cheap.' },
];

const KEY_INFO: Record<AiKeyProvider, { name: string; where: string; model: string }> = {
  anthropic: { name: 'Claude', where: 'console.anthropic.com > API keys', model: 'claude-sonnet-5-5' },
  gemini: { name: 'Gemini', where: 'aistudio.google.com > Get API key', model: 'gemini-2.5-flash' },
  deepseek: { name: 'DeepSeek', where: 'platform.deepseek.com > API keys', model: 'deepseek-chat' },
};

export default function AiTab() {
  const { pushToast } = useShell();
  const form = useSettingForm('ai');
  const test = useJob();
  const a = form.draft;
  const provider = a.provider;

  const save = async (): Promise<boolean> => {
    const err = await form.save();
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', 'AI writer saved. The helper picks it up within a few minutes (or when you restart it).');
    return true;
  };

  const runTest = async () => {
    if (form.dirty && !(await save())) return;
    await test.start('ai_test', {});
  };

  const setKey = (p: AiKeyProvider, patch: Partial<{ api_key: string; model: string }>) => form.patch({ [p]: { ...a[p], ...patch } });
  const result = test.phase === 'done' && test.result ? (test.result as { using?: string; reply?: string; ms?: number }) : null;

  return (
    <div className="space-y-4">
      <Card title="Which AI writes your messages?" subtitle="Pick one. You can switch any time and nothing else changes.">
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div role="radiogroup" aria-label="AI writer" className="grid gap-2 sm:grid-cols-2">
            {CHOICES.map((c) => {
              const on = provider === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => form.patch({ provider: c.id })}
                  className={cx(
                    'ctl rounded-card border p-3.5 text-left transition-colors duration-fast',
                    on ? 'border-primary-border bg-primary-soft ring-1 ring-inset ring-primary-border' : 'border-border bg-surface hover:bg-surface-2',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cx('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-primary bg-primary' : 'border-border-strong')}>
                      {on && <span className="h-1.5 w-1.5 rounded-full bg-primary-on" />}
                    </span>
                    <span className="text-sm font-semibold text-fg">{c.title}</span>
                    {c.badge && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">{c.badge}</span>}
                  </span>
                  <span className="mt-1.5 block text-sm text-fg-muted">{c.text}</span>
                </button>
              );
            })}
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      {!form.loading && (
        <Card title={`${KEY_INFO[provider].name} key`} subtitle={`Get it at ${KEY_INFO[provider].where}. It is saved only in your own database and used by the helper.`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Key" htmlFor="ai-key">
              <SecretInput id="ai-key" autoComplete="off" value={a[provider].api_key} onChange={(e) => setKey(provider, { api_key: e.target.value })} placeholder="Paste your key" />
            </Field>
            <Field label="Model (optional)" htmlFor="ai-model" hint={`Leave empty to use ${KEY_INFO[provider].model}.`}>
              <input id="ai-model" className={inputCls} value={a[provider].model} onChange={(e) => setKey(provider, { model: e.target.value })} placeholder={KEY_INFO[provider].model} />
            </Field>
          </div>
        </Card>
      )}

      {!form.loading && (
        <Card title="Test the AI" subtitle="Sends one tiny question to the AI you picked. It writes nothing and sends nothing to anyone.">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void runTest()} disabled={test.running} className={`${btnSecondary} min-h-10`}>
              {test.running ? <Spinner /> : <SendIcon className="h-4 w-4" />}
              Test the AI
            </button>
            <JobNote phase={test.phase} error={test.error} runningText="Asking the AI…" doneText={result ? `It works. ${result.using ?? ''} answered in ${((result.ms ?? 0) / 1000).toFixed(1)}s.` : 'It works.'} />
          </div>
          <p className="mt-2 text-sm text-fg-subtle">The background helper must be running for the test.</p>
        </Card>
      )}
    </div>
  );
}
