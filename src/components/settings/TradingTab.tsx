"use client";

import { useCallback, useEffect, useState } from 'react';
import { useJob } from '@/lib/jobs';
import { loadSettings, useSettingForm } from '@/lib/settings';
import { fmtDateTime, itemLabel } from '@/lib/format';
import { ITEM_TYPES, type TradeEntry, type TradeMarket, type TradeState, type TradingSettings, type TradingSuggestion } from '@/lib/types';
import { useShell } from '../AppShell';
import { PlusIcon, XIcon } from '../Icons';
import { Card, Field, JobNote, Notice, SaveBar, Spinner, TagInput, Toggle, btnPrimary, btnSecondary, inputCls, pill } from '../ui';

const OWNED: (keyof TradingSettings)[] = ['enabled', 'i_sell', 'i_want', 'games', 'extra_subreddits', 'updated_at'];
const MAX_ENTRIES = 30;

const COMMON_GAMES = [
  'Fortnite', 'Valorant', 'League of Legends', 'CS2', 'Genshin Impact', 'Honkai Star Rail', 'Roblox', 'Minecraft', 'GTA Online',
  'Rocket League', 'Apex Legends', 'Call of Duty', 'EA FC (FIFA)', 'Clash of Clans', 'Clash Royale', 'Brawl Stars', 'Mobile Legends',
  'PUBG Mobile', 'Free Fire', 'Diablo', 'World of Warcraft', 'RuneScape', 'Rainbow Six Siege', 'Overwatch', 'Destiny 2', 'Pokemon Go',
  'Dota 2', 'Steam', 'Epic Games',
];

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    // fall through to the simple id
  }
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankEntry(): TradeEntry {
  return { id: newId(), label: '', game: '', item_type: 'account', keywords: [], price: null };
}

function EntryEditor({
  kind,
  entries,
  onChange,
}: {
  kind: 'sell' | 'want';
  entries: TradeEntry[];
  onChange: (next: TradeEntry[]) => void;
}) {
  const update = (id: string, patch: Partial<TradeEntry>) => onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const priceLabel = kind === 'sell' ? 'Lowest price I accept (USD)' : 'Highest price I will pay (USD)';

  return (
    <div className="space-y-3">
      {entries.length === 0 && (
        <p className="text-sm text-fg-subtle">
          {kind === 'sell'
            ? 'Nothing added yet. Add what you sell, like "Fortnite OG accounts", and I look for people who want to buy it.'
            : 'Nothing added yet. Add what you want to buy, like "Valorant accounts under $100", and I look for people selling it.'}
        </p>
      )}
      {entries.map((e, i) => (
        <div key={e.id} className="rounded-lg border border-border bg-surface-2/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor={`te-${kind}-label-${e.id}`}>
              <input
                id={`te-${kind}-label-${e.id}`}
                className={inputCls}
                value={e.label}
                onChange={(ev) => update(e.id, { label: ev.target.value })}
                placeholder={kind === 'sell' ? 'Fortnite OG accounts' : 'Valorant accounts with skins'}
              />
            </Field>
            <Field label="Game" htmlFor={`te-${kind}-game-${e.id}`}>
              <input
                id={`te-${kind}-game-${e.id}`}
                className={inputCls}
                list="trade-games-list"
                value={e.game}
                onChange={(ev) => update(e.id, { game: ev.target.value })}
                placeholder="Fortnite"
              />
            </Field>
            <Field label="Kind of item" htmlFor={`te-${kind}-type-${e.id}`}>
              <select id={`te-${kind}-type-${e.id}`} className={inputCls} value={e.item_type} onChange={(ev) => update(e.id, { item_type: ev.target.value })}>
                <option value="">Any kind</option>
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {itemLabel(t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={priceLabel} htmlFor={`te-${kind}-price-${e.id}`} hint="Leave empty for no limit.">
              <input
                id={`te-${kind}-price-${e.id}`}
                type="number"
                min={0}
                step={5}
                className={inputCls}
                value={e.price ?? ''}
                onChange={(ev) => {
                  const v = ev.target.value.trim();
                  const num = Number(v);
                  update(e.id, { price: v === '' || !Number.isFinite(num) || num < 0 ? null : num });
                }}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Words that must show up (optional)" htmlFor={`te-${kind}-kw-${e.id}`} hint="Example: og, full access, stacked. Press Enter after each one.">
              <TagInput
                id={`te-${kind}-kw-${e.id}`}
                label="Words that must show up"
                value={e.keywords}
                onChange={(v) => update(e.id, { keywords: v.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 20) })}
                placeholder="og"
              />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onChange(entries.filter((x) => x.id !== e.id))}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-fg-subtle hover:bg-danger-soft hover:text-danger"
              aria-label={`Remove ${kind === 'sell' ? 'item I sell' : 'item I want'} ${i + 1}`}
            >
              <XIcon className="h-4 w-4" />
              Remove
            </button>
          </div>
        </div>
      ))}
      {entries.length < MAX_ENTRIES && (
        <button type="button" onClick={() => onChange([...entries, blankEntry()])} className={btnSecondary}>
          <PlusIcon className="h-4 w-4" />
          {kind === 'sell' ? 'Add something I sell' : 'Add something I want to buy'}
        </button>
      )}
    </div>
  );
}

function SuggestionCard({ s, onAdd, added }: { s: TradingSuggestion; onAdd: () => void; added: boolean }) {
  const conf = {
    high: 'bg-success-soft text-success ring-success-border',
    medium: 'bg-warning-soft text-warning ring-warning-border',
    low: 'bg-surface-2 text-fg-muted ring-border',
  } as const;
  return (
    <li className="rounded-lg border border-border bg-surface-2/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 break-words text-sm font-semibold text-fg">{s.title}</p>
        {s.game && <span className={`${pill} bg-primary-soft text-primary-text ring-primary-border`}>{s.game}</span>}
        {s.item_type && <span className={`${pill} bg-surface-2 text-fg-muted ring-border`}>{itemLabel(s.item_type)}</span>}
        <span className={`${pill} ${conf[s.confidence]}`}>{s.confidence} confidence</span>
        <span className={`${pill} ${s.basis === 'observed' ? 'bg-info-soft text-info ring-info-border' : 'bg-surface-2 text-fg-subtle ring-border'}`}>
          {s.basis === 'observed' ? 'Seen in your leads' : 'General knowledge'}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-muted">{s.why}</p>
      <button type="button" onClick={onAdd} disabled={added} className={`${btnSecondary} mt-2`}>
        <PlusIcon className="h-4 w-4" />
        {added ? 'Added below' : 'Add to what I sell'}
      </button>
    </li>
  );
}

function MarketTable({ market }: { market: TradeMarket }) {
  const rows = [...market.rows].sort((a, b) => b.wanted + b.offered - (a.wanted + a.offered)).slice(0, 12);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
            <th className="py-2 pr-3 font-semibold">Game</th>
            <th className="py-2 pr-3 font-semibold">Item</th>
            <th className="py-2 pr-3 text-right font-semibold">Want to buy</th>
            <th className="py-2 pr-3 text-right font-semibold">Selling</th>
            <th className="py-2 pr-3 text-right font-semibold">Typical price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.game}-${r.item_type}`} className="border-b border-border last:border-0">
              <td className="py-2 pr-3 font-medium text-fg">{r.game}</td>
              <td className="py-2 pr-3 text-fg-muted">{itemLabel(r.item_type)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.wanted}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.offered}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-fg-muted">{r.median_price !== null ? `$${Math.round(r.median_price).toLocaleString('en-US')}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TradingTab() {
  const { pushToast } = useShell();
  const form = useSettingForm('trading', OWNED);
  const scan = useJob();
  const suggest = useJob();
  const [market, setMarket] = useState<TradeMarket | null>(null);
  const [state, setState] = useState<TradeState | null>(null);
  const t = form.draft;

  const loadExtras = useCallback(async () => {
    const { values } = await loadSettings(['trade_market', 'trade_state']);
    setMarket(values.trade_market);
    setState(values.trade_state);
  }, []);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  const save = async (): Promise<boolean> => {
    const clean = {
      i_sell: t.i_sell.filter((e) => e.label.trim() || e.game.trim()),
      i_want: t.i_want.filter((e) => e.label.trim() || e.game.trim()),
      updated_at: new Date().toISOString(),
    };
    const err = await form.save(clean);
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return false;
    }
    pushToast('success', 'Trading settings saved.');
    return true;
  };

  const findNow = async () => {
    if (form.dirty && !(await save())) return;
    const out = await scan.start('trade_scan', {});
    if (out.phase === 'done') pushToast('success', `Found ${Number(out.result?.inserted ?? 0)} new trade leads.`);
    else pushToast('error', out.error ?? 'The search did not finish.');
    await form.reload();
    await loadExtras();
  };

  const suggestNow = async () => {
    if (form.dirty && !(await save())) return;
    const out = await suggest.start('suggest_trading', {});
    if (out.phase === 'done') pushToast('success', 'New ideas are ready below.');
    else pushToast('error', out.error ?? 'Could not make suggestions.');
    await form.reload();
    await loadExtras();
  };

  const addSuggestion = (s: TradingSuggestion) => {
    if (t.i_sell.length >= MAX_ENTRIES) return;
    form.patch({
      i_sell: [...t.i_sell, { id: newId(), label: s.title, game: s.game, item_type: s.item_type, keywords: [], price: null }],
    });
  };

  const suggestions = form.saved.suggestions;
  const lastResult = form.saved.last_result;
  const lastText =
    form.saved.last_run
      ? `Last search ${fmtDateTime(form.saved.last_run)}${lastResult && typeof lastResult === 'object' ? `: ${Number((lastResult as Record<string, unknown>).inserted ?? 0)} new leads.` : '.'}`
      : state?.reddit_last_run
        ? `Reddit last checked ${fmtDateTime(state.reddit_last_run)}.`
        : 'No search has run yet.';

  return (
    <div className="space-y-4">
      <datalist id="trade-games-list">
        {Array.from(new Set([...COMMON_GAMES, ...t.games])).map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <Card
        title="Game trading"
        subtitle="Tell me what you sell and what you want to buy. I look for people who want your items, and for people selling what you want."
      >
        {form.loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : (
          <div className="space-y-5">
            <Toggle
              id="tr-on"
              checked={t.enabled}
              onChange={(v) => form.patch({ enabled: v })}
              label="Look for game trading leads"
              description="Checks public Reddit trading communities every 20 minutes."
            />

            <Notice tone="info">
              Many game companies do not allow selling accounts, and fake or stolen accounts are common in this market. I flag posts that look
              like scams or stolen accounts, but always check the other person and use a middleman or escrow before paying.
            </Notice>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg">What I sell</h3>
              <EntryEditor kind="sell" entries={t.i_sell} onChange={(v) => form.patch({ i_sell: v })} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg">What I want to buy</h3>
              <EntryEditor kind="want" entries={t.i_want} onChange={(v) => form.patch({ i_want: v })} />
            </div>

            <Field label="Other games to watch" htmlFor="tr-games" hint="Games I should recognise even if they are not in the list. Press Enter after each one.">
              <TagInput id="tr-games" label="Other games to watch" value={t.games} onChange={(v) => form.patch({ games: v.map((g) => g.trim()).filter(Boolean).slice(0, 40) })} placeholder="Albion Online" />
            </Field>

            <Field
              label="Extra subreddits to watch"
              htmlFor="tr-subs"
              hint="Real subreddit names only, without r/. A wrong name can stop the whole Reddit search, so double-check the spelling."
            >
              <TagInput
                id="tr-subs"
                label="Extra subreddits to watch"
                value={t.extra_subreddits}
                onChange={(v) => form.patch({ extra_subreddits: v.map((x) => x.trim().replace(/^\/?r\//i, '')).filter(Boolean).slice(0, 20) })}
                placeholder="RocketLeagueExchange"
              />
            </Field>
          </div>
        )}
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={() => void save()} onReset={form.reset} error={form.error} />
      </Card>

      <Card title="Find leads now" subtitle={lastText}>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void findNow()} disabled={scan.running} className={btnPrimary}>
            {scan.running ? <Spinner /> : null}
            Find trade leads now
          </button>
          <JobNote phase={scan.phase} error={scan.error} runningText="Searching. This takes up to a minute…" />
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          Results appear on the Leads page under Game trading. Posts that match something you listed above are marked and ranked first.
        </p>
      </Card>

      <Card
        title="What could I sell?"
        subtitle="I look at what people are asking for in the leads I collected, and add general knowledge of popular games."
        actions={
          <button type="button" onClick={() => void suggestNow()} disabled={suggest.running} className={btnSecondary}>
            {suggest.running ? <Spinner /> : null}
            Suggest what I can sell
          </button>
        }
      >
        <JobNote phase={suggest.phase} error={suggest.error} runningText="Thinking it through. This can take a minute…" />
        {suggestions && suggestions.items.length > 0 ? (
          <div className="mt-2 space-y-3">
            <p className="text-xs text-fg-subtle">
              Made {fmtDateTime(suggestions.generated_at)}
              {suggestions.mode === 'heuristic' ? ' from simple counting because the AI was not available' : ' by the AI'}. These are ideas, not promises.
            </p>
            {suggestions.notes && <p className="whitespace-pre-wrap break-words text-sm text-fg-muted">{suggestions.notes}</p>}
            <ul className="grid gap-2 lg:grid-cols-2">
              {suggestions.items.map((s, i) => (
                <SuggestionCard
                  key={`${s.title}-${i}`}
                  s={s}
                  added={t.i_sell.some((e) => e.label.trim().toLowerCase() === s.title.trim().toLowerCase())}
                  onAdd={() => addSuggestion(s)}
                />
              ))}
            </ul>
            <p className="text-xs text-fg-subtle">Items you add still need Save at the top.</p>
          </div>
        ) : (
          !suggest.running && <p className="mt-1 text-sm text-fg-subtle">No ideas yet. Press the button, or wait a few days so more leads build up.</p>
        )}
      </Card>

      <Card
        title="What people are trading"
        subtitle={market?.generated_at ? `Based on the last ${market.days} days, updated ${fmtDateTime(market.generated_at)}` : 'Builds up as trade leads arrive'}
      >
        {market && market.rows.length > 0 ? (
          <>
            <MarketTable market={market} />
            <p className="mt-2 text-xs text-fg-subtle">
              This only counts posts I could read on public Reddit, so treat it as a hint, not the whole market.
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-subtle">Nothing to show yet. Turn trading on and run a search, then check back after a day or two.</p>
        )}
      </Card>
    </div>
  );
}
