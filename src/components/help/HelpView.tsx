"use client";

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell';
import { Badge, Button, Card, EmptyState, Kbd, Reveal, Table, THead, Th, Tr, Td, CountUp } from '@/components/ui';
import { ChevronIcon, SearchIcon, XIcon } from '@/components/Icons';
import { useShell } from '@/components/AppShell';
import { supabase } from '@/lib/supabaseClient';
import { loadSetting } from '@/lib/settings';
import { timeAgo } from '@/lib/format';
import { GETTING_STARTED, SECTION_ORDER, SHORTCUTS, entryText, matches, type HelpEntry } from '@/lib/help-content';

const linkCls = 'btn inline-flex min-h-7 items-center rounded-ctl border border-border-strong bg-surface px-2.5 py-1 text-[13px] font-medium text-fg hover:bg-surface-2';

function Links({ e }: { e: HelpEntry }) {
  if (!e.links?.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {e.links.map((l) => (
        <Link key={l.href} href={l.href} className={linkCls}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

/** Expandable answer. Opens by itself while a search is active. */
function Entry({ e, forceOpen }: { e: HelpEntry; forceOpen: boolean }) {
  return (
    <details open={forceOpen || undefined} className="group border-t border-border first:border-t-0">
      <summary className="btn flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{e.title}</span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-fast group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 text-sm leading-relaxed text-fg-muted">
        <p className="max-w-3xl">{e.body}</p>
        <Links e={e} />
      </div>
    </details>
  );
}

function Section({ id, title, blurb, entries, searching }: { id: string; title: string; blurb?: string; entries: HelpEntry[]; searching: boolean }) {
  if (!entries.length) return null;
  return (
    <Card id={id} title={title} subtitle={blurb} padding="none" className="scroll-mt-20">
      <div>
        {entries.map((e) => (
          <Entry key={e.id} e={e} forceOpen={searching} />
        ))}
      </div>
    </Card>
  );
}

type Counts = { leads: number | null; outreach: number | null; deals: number | null; tasks: number | null };

function AboutCard() {
  const { workerOnline, claudeReady } = useShell();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [info, setInfo] = useState<{ version: string | null; seen: string | null; handlers: number } | null>(null);

  useEffect(() => {
    let live = true;
    const count = async (table: string) => {
      const { count: c, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
      return error ? null : (c ?? 0);
    };
    void (async () => {
      const [leads, outreach, deals, tasks, w] = await Promise.all([count('leads'), count('outreach'), count('deals'), count('tasks'), loadSetting('worker_status')]);
      if (!live) return;
      setCounts({ leads, outreach, deals, tasks });
      setInfo({ version: w.value.claude.version, seen: w.value.last_seen, handlers: w.value.handlers.length });
    })();
    return () => {
      live = false;
    };
  }, []);

  const stat = (label: string, v: number | null | undefined) => (
    <div className="rounded-card border border-border bg-surface-2/60 p-3.5">
      <p className="text-[13px] font-medium text-fg-subtle">{label}</p>
      <p className="font-num mt-1 text-2xl font-semibold text-fg">{v == null ? (counts ? '-' : '...') : <CountUp value={v} />}</p>
    </div>
  );

  return (
    <Card id="about" title="About this install" subtitle="Lead Radar runs on your own computer and your own database." className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={workerOnline ? 'success' : 'danger'} dot>
          {workerOnline ? 'Helper running' : 'Helper offline: start it to send and write'}
        </Badge>
        <Badge tone={claudeReady ? 'success' : 'neutral'} dot>
          {claudeReady ? 'AI writer ready' : 'AI writer not found'}
        </Badge>
        {info?.version && <Badge>AI writer {info.version}</Badge>}
        {info?.seen && <span className="text-xs text-fg-subtle">Helper last seen {timeAgo(info.seen)}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat('Leads', counts?.leads)}
        {stat('Messages', counts?.outreach)}
        {stat('Deals', counts?.deals)}
        {stat('Tasks', counts?.tasks)}
      </div>
    </Card>
  );
}

function HelpBody() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const [q, setQ] = useState(urlQ);

  // Keep the URL in step with the box (debounced) so a search can be shared or reloaded.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q === urlQ) return;
      const p = new URLSearchParams(params.toString());
      if (q.trim()) p.set('q', q);
      else p.delete('q');
      const s = p.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [q, urlQ, params, pathname, router]);

  const searching = q.trim().length > 0;
  const keep = useCallback((e: HelpEntry) => !searching || matches(entryText(e), q), [searching, q]);

  const steps = GETTING_STARTED.filter(keep);
  const sections = SECTION_ORDER.map((s) => ({ ...s, entries: s.entries.filter(keep) }));
  const shortcuts = SHORTCUTS.filter((s) => !searching || matches(`${s.keys.join(' ')} ${s.action} ${s.where} shortcuts keyboard`, q));
  const aboutHit = !searching || matches('about background helper worker ai writer claude cli version counts leads outreach deals tasks', q);
  const total = steps.length + sections.reduce((n, s) => n + s.entries.length, 0) + shortcuts.length;

  const toc = [
    { id: 'start', label: 'Start here' },
    { id: 'faq', label: 'Common questions' },
    { id: 'modules', label: 'What each page does' },
    { id: 'glossary', label: 'What the words mean' },
    { id: 'shortcuts', label: 'Keyboard shortcuts' },
    { id: 'safety', label: 'Safety rules' },
    { id: 'about', label: 'About this install' },
  ];

  const byId = (id: string) => sections.find((s) => s.id === id);

  return (
    <PageContainer>
      <PageHeader title="Help" subtitle="Start here, answers to common questions, and what the words in the app mean." />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-xl flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help, for example &quot;Looks real&quot; or &quot;key&quot;"
            aria-label="Search help"
            className="field h-11 w-full pl-9 pr-10"
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="btn absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-ctl text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-sm text-fg-subtle" role="status" aria-live="polite">
          {searching ? `${total} result${total === 1 ? '' : 's'}` : 'Tip: press Ctrl + K anywhere to jump to a page.'}
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Help sections" className="mb-4 hidden lg:sticky lg:top-20 lg:mb-0 lg:block lg:self-start">
          <ul className="space-y-0.5 text-sm">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="btn block rounded-ctl px-2.5 py-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg">
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          {searching && total === 0 && !aboutHit && (
            <EmptyState
              icon={<SearchIcon className="h-5 w-5" />}
              title="Nothing matches that"
              text="Try a shorter or simpler word, such as email, leads or helper."
              action={<Button onClick={() => setQ('')}>Clear search</Button>}
            />
          )}

          {steps.length > 0 && (
            <Reveal>
              <Card id="start" title="Start here" subtitle="Five steps from empty to your first sent message." className="scroll-mt-20">
                <ol className="space-y-3">
                  {steps.map((s) => (
                    <li key={s.id} className="flex gap-3">
                      <span className="font-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary-text ring-1 ring-inset ring-primary-border" aria-hidden="true">
                        {s.step}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-fg">
                          <span className="sr-only">Step {s.step}: </span>
                          {s.title}
                        </p>
                        <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-fg-muted">{s.body}</p>
                        <Links e={s} />
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </Reveal>
          )}

          {byId('faq') && <Section {...(byId('faq') as (typeof sections)[number])} searching={searching} />}
          {byId('modules') && <Section {...(byId('modules') as (typeof sections)[number])} searching={searching} />}
          {byId('glossary') && <Section {...(byId('glossary') as (typeof sections)[number])} searching={searching} />}

          {shortcuts.length > 0 && (
            <Card id="shortcuts" title="Keyboard shortcuts" subtitle="Everything here works in the app today." padding="none" className="scroll-mt-20">
              <Table caption="Keyboard shortcuts" className="rounded-none border-0">
                <THead>
                  <tr>
                    <Th>Keys</Th>
                    <Th>What it does</Th>
                    <Th className="hidden sm:table-cell">Where</Th>
                  </tr>
                </THead>
                <tbody>
                  {shortcuts.map((s, i) => (
                    <Tr key={i}>
                      <Td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {s.keys.map((k, j) => (
                            <span key={k} className="inline-flex items-center gap-1">
                              {j > 0 && <span className="text-fg-subtle">{s.keys.length === 2 && s.keys[0] === 'Ctrl' ? '+' : '/'}</span>}
                              <Kbd>{k}</Kbd>
                            </span>
                          ))}
                        </span>
                      </Td>
                      <Td className="text-fg">
                        {s.action}
                        <span className="mt-0.5 block text-xs text-fg-subtle sm:hidden">{s.where}</span>
                      </Td>
                      <Td className="hidden text-fg-muted sm:table-cell">{s.where}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {byId('safety') && <Section {...(byId('safety') as (typeof sections)[number])} searching={searching} />}
          {aboutHit && <AboutCard />}
        </div>
      </div>
    </PageContainer>
  );
}

export default function HelpView() {
  return (
    <Suspense fallback={null}>
      <HelpBody />
    </Suspense>
  );
}
