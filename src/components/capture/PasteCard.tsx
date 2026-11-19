"use client";

import { useMemo, useState } from 'react';
import { useJob } from '@/lib/jobs';
import { readOutcomes, safeUrl, splitPosts, type ForceKind } from '@/lib/capture';
import { useShell } from '../AppShell';
import { Card, Field, JobNote, Notice, Spinner, Toggle, btnPrimary, btnSecondary, inputCls } from '../ui';
import OutcomeList, { type OutcomeRow } from './OutcomeList';

type KindChoice = 'auto' | ForceKind;

const KIND_OPTIONS: { value: KindChoice; label: string; hint: string }[] = [
  { value: 'auto', label: 'Let Lead Radar decide', hint: 'It checks whether the text is a game trade or a service request.' },
  { value: 'trade', label: 'Game trade', hint: 'Buying or selling accounts, boosting, top-ups, items.' },
  { value: 'service', label: 'Service request', hint: 'Someone who wants a website, app or design made.' },
];

export default function PasteCard() {
  const { workerOnline, pushToast } = useShell();
  const job = useJob();
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [source, setSource] = useState('');
  const [kind, setKind] = useState<KindChoice>('auto');
  const [byBlankLines, setByBlankLines] = useState(true);
  const [sentPosts, setSentPosts] = useState<string[]>([]);

  const posts = useMemo(() => splitPosts(text, byBlankLines), [text, byBlankLines]);
  const linkOk = !link.trim() || safeUrl(link) !== undefined;
  const finished = job.phase === 'done';
  const outcomes = useMemo(() => readOutcomes(job.result), [job.result]);

  const submit = async () => {
    if (!posts.length || !linkOk) return;
    const url = posts.length === 1 ? safeUrl(link) : undefined;
    const items = posts.map((p) => {
      const item: Record<string, unknown> = { text: p };
      if (url) item.url = url;
      if (source.trim()) item.site = source.trim();
      return item;
    });
    const body: Record<string, unknown> = { items };
    if (source.trim()) body.source_label = source.trim();
    if (kind !== 'auto') body.force_kind = kind;
    setSentPosts(posts);
    const out = await job.start('quick_add', body);
    if (out.phase === 'done') pushToast('success', 'Added to your leads.');
    else pushToast('error', out.error ?? 'Could not add the text.');
  };

  const reset = () => {
    job.reset();
    setText('');
    setLink('');
    setSentPosts([]);
  };

  const rows: OutcomeRow[] = sentPosts.map((p, pos) => ({
    label: p.replace(/\s+/g, ' ').slice(0, 160),
    outcome: outcomes.items.find((o) => o.index === pos) ?? null,
  }));

  return (
    <Card
      className="glass"
      title="Paste text"
      subtitle="Copy a post from anywhere (a forum thread, a marketplace request, a chat message) and paste it here."
    >
      {!workerOnline && !finished && (
        <div className="mb-3">
          <Notice tone="warn">The worker is not running, so this will wait. Run npm run worker in the project folder first.</Notice>
        </div>
      )}
      {!finished && (
        <div className="space-y-3">
          <Field label="The post or posts" htmlFor="paste-text" hint="Put --- on its own line between posts. Blank lines also separate posts unless you turn that off below.">
            <textarea
              id="paste-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={'WTS Valorant account, Radiant rank, 40 skins, $120, middleman ok\n---\nLooking to buy a Fortnite OG account under $150'}
              className={inputCls}
            />
          </Field>
          <Toggle id="paste-blank" checked={byBlankLines} onChange={setByBlankLines} label="Treat blank lines as the start of a new post" />
          <p className="text-sm text-fg-muted" aria-live="polite">
            {posts.length === 0 ? 'No posts found yet.' : `${posts.length} ${posts.length === 1 ? 'post' : 'posts'} will be added.`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Link to the post (optional)" htmlFor="paste-link" hint={posts.length > 1 ? 'Only used when you paste a single post.' : undefined}>
              <input id="paste-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" inputMode="url" className={inputCls} />
              {!linkOk && <p className="mt-1 text-xs text-danger">Use a full link that starts with http:// or https://.</p>}
            </Field>
            <Field label="Where is it from? (optional)" htmlFor="paste-source" hint="For example Reddit: r/GameTrade.">
              <input id="paste-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} className={inputCls} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-fg-muted">What kind of lead is it?</legend>
            <div className="space-y-1.5">
              {KIND_OPTIONS.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-start gap-2 text-sm text-fg-muted">
                  <input type="radio" name="paste-kind" value={o.value} checked={kind === o.value} onChange={() => setKind(o.value)} className="mt-1 h-4 w-4 border-border-strong text-primary-text" />
                  <span>
                    <span className="font-medium">{o.label}</span>
                    <span className="block text-xs text-fg-subtle">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" onClick={submit} disabled={!posts.length || !linkOk || job.running} className={btnPrimary}>
            {job.running ? <Spinner /> : null}
            {job.running ? 'Adding…' : 'Add to my leads'}
          </button>
        </div>
      )}
      <JobNote phase={job.phase} error={job.error} runningText="The worker is reading your text…" />
      {finished && (
        <>
          <OutcomeList summary={outcomes} rows={rows} />
          <div className="mt-3">
            <button type="button" onClick={reset} className={btnSecondary}>
              Paste more
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
