"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { CatalogIcon, PlusIcon, SearchIcon, TrashIcon, XIcon } from '@/components/Icons';
import { PageHeader } from '@/components/shell';
import { Badge, Banner, Button, Card, EmptyState, Field, IconButton, Input, Modal, Notice, SaveBar, Skeleton, Stagger, TagInput, Toggle } from '@/components/ui';
import { fmtDateTime, itemLabel } from '@/lib/format';
import { useSettingForm } from '@/lib/settings';
import { useTradeLeads, useTradingSettings } from '@/lib/trading-data';
import { entryCounts, money } from '@/lib/trading-stats';
import type { TradeEntry, TradingSettings } from '@/lib/types';
import EntryDrawer, { type EntryKind } from './EntryDrawer';
import JobAction from './JobAction';
import TradingNav from './TradingNav';

const OWNED: (keyof TradingSettings)[] = ['enabled', 'i_sell', 'i_want', 'games', 'extra_subreddits', 'discord', 'updated_at'];
const MAX_ENTRIES = 30;

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function EntryCard({ entry, kind, counts, onEdit, onDelete }: { entry: TradeEntry; kind: EntryKind; counts: { matched: number; open: number }; onEdit: () => void; onDelete: () => void }) {
  const sell = kind === 'sell';
  return (
    <li className="flex h-full flex-col rounded-card border border-border bg-surface p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-[15px] font-semibold leading-snug text-fg">{entry.label || entry.game}</p>
        <div className="-mr-1 -mt-1 flex shrink-0">
          <IconButton label={`Edit ${entry.label || entry.game}`} size="sm" onClick={onEdit}>
            <PencilIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label={`Remove ${entry.label || entry.game}`} size="sm" onClick={onDelete}>
            <TrashIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Badge tone="accent">{entry.game || 'Any game'}</Badge>
        <Badge>{entry.item_type ? itemLabel(entry.item_type) : 'Any kind'}</Badge>
      </div>
      {entry.keywords.length > 0 && (
        <p className="mt-2 text-xs text-fg-subtle">
          Must mention: <span className="text-fg-muted">{entry.keywords.join(', ')}</span>
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[13px]">
        <div>
          <dt className="text-[11px] text-fg-subtle">{sell ? 'Lowest price I accept' : 'Highest I will pay'}</dt>
          <dd className={entry.price !== null ? 'font-num font-semibold text-fg' : 'font-medium text-fg-muted'}>{entry.price !== null ? money(entry.price) : 'No limit'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-fg-subtle">{sell ? 'Buyers found' : 'Sellers found'}</dt>
          <dd className="font-num font-semibold text-fg">
            {counts.matched}
            {counts.open > 0 && <span className="ml-1.5 font-sans text-xs font-medium text-accent-text">({counts.open} new)</span>}
          </dd>
        </div>
      </dl>
      {counts.matched > 0 && (
        <Link href={`/trading/${sell ? 'buyers' : 'sellers'}?matched=1`} className="mt-auto pt-2 text-[13px] font-medium text-primary-text hover:underline">
          See {sell ? 'buyers' : 'sellers'}
        </Link>
      )}
    </li>
  );
}

export default function TradingCatalog() {
  const { pushToast } = useShell();
  const form = useSettingForm('trading', OWNED);
  const { leads, reload: reloadLeads } = useTradeLeads();
  const { bundle, reload: reloadExtras } = useTradingSettings();
  const [drawer, setDrawer] = useState<{ kind: EntryKind; entry: TradeEntry | null } | null>(null);
  const [removing, setRemoving] = useState<{ kind: EntryKind; entry: TradeEntry } | null>(null);
  const [busy, setBusy] = useState(false);
  const t = form.draft;

  const clean = (d: TradingSettings): Partial<TradingSettings> => ({
    i_sell: d.i_sell.filter((e) => e.label.trim() || e.game.trim()),
    i_want: d.i_want.filter((e) => e.label.trim() || e.game.trim()),
    discord: { ...d.discord, channels: d.discord.channels.filter((c) => c.id.trim()).map((c) => ({ id: c.id.trim(), label: c.label.trim() || c.id.trim() })) },
  });

  const save = async (extra?: Partial<TradingSettings>, okText = 'Saved.'): Promise<boolean> => {
    const err = await form.save({ ...clean({ ...t, ...extra }), ...extra, updated_at: new Date().toISOString() });
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', okText);
    void reloadExtras();
    return true;
  };

  const saveEntry = async (kind: EntryKind, entry: TradeEntry) => {
    const key = kind === 'sell' ? 'i_sell' : 'i_want';
    const list = t[key];
    const exists = list.some((e) => e.id === entry.id);
    const next = exists ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry];
    setBusy(true);
    const ok = await save({ [key]: next } as Partial<TradingSettings>, exists ? 'Changes saved.' : 'Added to your catalog.');
    setBusy(false);
    if (ok) setDrawer(null);
  };

  const removeEntry = async () => {
    if (!removing) return;
    const key = removing.kind === 'sell' ? 'i_sell' : 'i_want';
    setBusy(true);
    const ok = await save({ [key]: t[key].filter((e) => e.id !== removing.entry.id) } as Partial<TradingSettings>, 'Removed from your catalog.');
    setBusy(false);
    if (ok) setRemoving(null);
  };

  const counts = useMemo(() => {
    const m = new Map<string, { matched: number; open: number }>();
    for (const e of t.i_sell) m.set(`sell:${e.id}`, entryCounts(e, 'sell', leads));
    for (const e of t.i_want) m.set(`want:${e.id}`, entryCounts(e, 'want', leads));
    return m;
  }, [t.i_sell, t.i_want, leads]);

  const setChannels = (channels: { id: string; label: string }[]) => form.patch({ discord: { ...t.discord, channels } });
  const botSaved = bundle ? bundle.integrations.discord.bot_token.trim() !== '' : null;
  const dStatus = bundle?.integrations.status.discord;
  const subs = bundle?.state.subs_ok ?? [];
  const lastRun = form.saved.last_run ?? bundle?.state.reddit_last_run ?? null;
  const lastResult = form.saved.last_result && typeof form.saved.last_result === 'object' ? Number((form.saved.last_result as Record<string, unknown>).inserted ?? 0) : null;

  const renderSection = (kind: EntryKind) => {
    const list = kind === 'sell' ? t.i_sell : t.i_want;
    const sell = kind === 'sell';
    return (
      <Card
        title={sell ? 'What I sell' : 'What I want to buy'}
        subtitle={sell ? 'I look for people who want to buy these. They show up under Buyers.' : 'I look for people selling these. They show up under Sellers.'}
        actions={
          list.length < MAX_ENTRIES && (
            <Button size="sm" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setDrawer({ kind, entry: null })}>
              {sell ? 'Add something I sell' : 'Add something I want'}
            </Button>
          )
        }
      >
        {form.loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<CatalogIcon className="h-5 w-5" />}
            title={sell ? 'Nothing listed yet' : 'Nothing on your wish list yet'}
            text={sell ? 'Add what you sell, like "Fortnite OG accounts", and I will look for people who want to buy it.' : 'Add what you want to buy, like "Valorant accounts under $100", and I will look for people selling it.'}
            action={
              <Button variant="primary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setDrawer({ kind, entry: null })}>
                {sell ? 'Add something I sell' : 'Add something I want'}
              </Button>
            }
            className="border-0 py-8"
          />
        ) : (
          <Stagger as="ul" className="grid gap-3 sm:grid-cols-2" step={35}>
            {list.map((e) => (
              <EntryCard key={e.id} entry={e} kind={kind} counts={counts.get(`${kind}:${e.id}`) ?? { matched: 0, open: 0 }} onEdit={() => setDrawer({ kind, entry: e })} onDelete={() => setRemoving({ kind, entry: e })} />
            ))}
          </Stagger>
        )}
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        title="My catalog"
        subtitle="Tell me what you sell and what you want to buy. I match every new post against this list."
        actions={
          <JobAction
            type="trade_scan"
            label="Find leads now"
            runningText="Searching Reddit and Discord"
            variant="primary"
            icon={<SearchIcon className="h-4 w-4" />}
            beforeStart={async () => (form.dirty ? save(undefined, 'Saved before searching.') : true)}
            successText={(r) => `Found ${Number(r?.inserted ?? 0)} new trade leads.`}
            onDone={() => {
              void form.reload();
              void reloadExtras();
              void reloadLeads();
            }}
          />
        }
      />
      <TradingNav />

      {form.error && (
        <Banner tone="danger" title="Could not load your trading settings" className="mb-4" action={<Button size="sm" onClick={() => void form.reload()}>Retry</Button>}>
          {form.error}
        </Banner>
      )}

      <Card className="mb-4">
        <Toggle
          id="cat-on"
          checked={t.enabled}
          onChange={(v) => void save({ enabled: v }, v ? 'Trading search is on.' : 'Trading search is off.')}
          label="Look for game trading leads"
          description={lastRun ? `Checks public Reddit trading communities every 20 minutes. Last search ${fmtDateTime(lastRun)}${lastResult !== null ? `, ${lastResult} new leads` : ''}.` : 'Checks public Reddit trading communities every 20 minutes, and your Discord channels if you add them below.'}
        />
        <div className="mt-3">
          <Notice tone="info">
            Many game companies do not allow selling accounts, and fake or stolen accounts are common in this market. I flag posts that look like scams, but always check the other person and use a middleman or escrow before paying.
          </Notice>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {renderSection('sell')}
        {renderSection('want')}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Where I look" subtitle="Extra games and communities on top of the built-in ones">
          <div className="space-y-4">
            <Field label="Other games to watch" htmlFor="cat-games" hint="Games I should recognise even if they are not in my list. Press Enter after each one.">
              <TagInput id="cat-games" label="Other games to watch" value={t.games} onChange={(v) => form.patch({ games: v.map((g) => g.trim()).filter(Boolean).slice(0, 40) })} placeholder="Albion Online" />
            </Field>
            <Field label="Extra subreddits to watch" htmlFor="cat-subs">
              <TagInput id="cat-subs" label="Extra subreddits to watch" value={t.extra_subreddits} onChange={(v) => form.patch({ extra_subreddits: v.map((x) => x.trim().replace(/^\/?r\//i, '')).filter(Boolean).slice(0, 20) })} placeholder="RocketLeagueExchange" />
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
                <span className="mt-px font-semibold">Careful:</span>
                <span className="text-fg-muted">use real subreddit names without r/. A wrong name can stop the whole Reddit search, so double-check the spelling.</span>
              </p>
            </Field>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-fg">Reddit communities that work</p>
              {subs.length === 0 ? (
                <p className="text-xs text-fg-subtle">Not checked yet. The worker verifies them the first time it searches.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {subs.map((s) => (
                    <li key={s}>
                      <Badge tone="success">r/{s}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card title="Discord channels" subtitle="Optional. A Discord bot that you add to a server yourself reads the channels you list.">
          <Toggle id="cat-dc" checked={t.discord.enabled} onChange={(v) => form.patch({ discord: { ...t.discord, enabled: v } })} label="Read Discord trading channels" description="It only reads channels the bot has been given access to." />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-fg-subtle">Bot status:</span>
            {botSaved === false ? (
              <Badge tone="warning" dot>
                No bot token yet
              </Badge>
            ) : dStatus ? (
              <Badge tone={dStatus.ok ? 'success' : 'danger'} dot title={dStatus.checked_at ? `Checked ${fmtDateTime(dStatus.checked_at)}` : undefined}>
                {dStatus.ok ? 'Working' : 'Problem'}
              </Badge>
            ) : (
              <Badge dot>Not tested yet</Badge>
            )}
            {dStatus?.message && <span className="min-w-0 break-words text-xs text-fg-subtle">{dStatus.message}</span>}
            <Link href="/settings?tab=connections" className="text-primary-text hover:underline">
              Bot token and test
            </Link>
          </div>
          {t.discord.enabled && (
            <div className="mt-3 space-y-3">
              {t.discord.channels.length === 0 && <p className="text-sm text-fg-subtle">No channels yet. Add one below.</p>}
              {t.discord.channels.map((c, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input aria-label={`Channel ID ${i + 1}`} value={c.id} inputMode="numeric" onChange={(e) => setChannels(t.discord.channels.map((x, idx) => (idx === i ? { ...x, id: e.target.value.replace(/\D/g, '') } : x)))} placeholder="Channel ID, like 123456789012345678" />
                  <Input aria-label={`Channel name ${i + 1}`} value={c.label} onChange={(e) => setChannels(t.discord.channels.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} placeholder="Name you will recognise" />
                  <IconButton label={`Remove channel ${i + 1}`} onClick={() => setChannels(t.discord.channels.filter((_, idx) => idx !== i))}>
                    <XIcon className="h-4 w-4" />
                  </IconButton>
                </div>
              ))}
              <Button leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => setChannels([...t.discord.channels, { id: '', label: '' }])}>
                Add a channel
              </Button>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-fg-subtle">
                <li>In Discord, open User Settings, then Advanced, and turn on Developer Mode.</li>
                <li>Right-click the channel and choose Copy Channel ID. Paste it above.</li>
                <li>The bot must be in that server with View Channel and Read Message History, and Message Content Intent must be on in the bot&apos;s page on the Discord developer portal. Only add the bot to servers where you are allowed to.</li>
              </ol>
            </div>
          )}
        </Card>
      </div>

      {form.dirty && (
        <div className="sticky bottom-3 z-20 mt-4 overflow-hidden rounded-card border border-border shadow-float [&>div]:!m-0 [&>div]:!border-0">
          <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save(undefined, 'Trading settings saved.')} onReset={form.reset} error={form.error} />
        </div>
      )}

      <EntryDrawer
        open={drawer !== null}
        kind={drawer?.kind ?? 'sell'}
        entry={drawer?.entry ?? null}
        games={t.games}
        saving={busy}
        onClose={() => setDrawer(null)}
        onSave={(e) => drawer && void saveEntry(drawer.kind, e)}
      />

      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this from your catalog?"
        description="I stop matching new posts against it. Leads already found stay where they are."
        size="sm"
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={() => void removeEntry()}>
              Remove
            </Button>
          </>
        }
      >
        <p className="break-words text-sm text-fg">{removing?.entry.label || removing?.entry.game}</p>
      </Modal>
    </div>
  );
}
