"use client";

import { useCallback, useState, type ReactNode } from 'react';
import { useShell } from '@/components/AppShell';
import { PlusIcon } from '@/components/Icons';
import { Badge, Button, Stagger } from '@/components/ui';
import { fmtDateTime, itemLabel } from '@/lib/format';
import { loadSetting, patchSetting } from '@/lib/settings';
import { blankEntry } from '@/lib/trading-stats';
import type { TradeEntry, TradingSettings, TradingSuggestion, TradingSuggestions } from '@/lib/types';
import EntryDrawer from './EntryDrawer';

const CONF_TONE = { high: 'success', medium: 'warning', low: 'neutral' } as const;

export function SuggestionCard({ s, added, onAdd }: { s: TradingSuggestion; added: boolean; onAdd: () => void }) {
  return (
    <li className="flex h-full flex-col rounded-card border border-border bg-surface-2/60 p-3.5">
      <p className="break-words text-sm font-semibold text-fg">{s.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {s.game && <Badge tone="primary">{s.game}</Badge>}
        {s.item_type && <Badge>{itemLabel(s.item_type)}</Badge>}
        <Badge tone={CONF_TONE[s.confidence]}>{s.confidence} confidence</Badge>
        <Badge tone={s.basis === 'observed' ? 'info' : 'neutral'}>{s.basis === 'observed' ? 'Seen in your leads' : 'General knowledge'}</Badge>
      </div>
      <p className="mt-2 flex-1 whitespace-pre-wrap break-words text-[13px] text-fg-muted">{s.why}</p>
      <Button size="sm" className="mt-3 self-start" disabled={added} onClick={onAdd} leftIcon={<PlusIcon className="h-4 w-4" />}>
        {added ? 'In your catalog' : 'Add to catalog'}
      </Button>
    </li>
  );
}

export function SuggestionGrid({
  suggestions,
  trading,
  onAdd,
  limit,
  header,
}: {
  suggestions: TradingSuggestions;
  trading: TradingSettings;
  onAdd: (s: TradingSuggestion) => void;
  limit?: number;
  header?: ReactNode;
}) {
  const items = limit ? suggestions.items.slice(0, limit) : suggestions.items;
  const has = (s: TradingSuggestion) => trading.i_sell.some((e) => e.label.trim().toLowerCase() === s.title.trim().toLowerCase());
  return (
    <div>
      <p className="mb-3 text-xs text-fg-subtle">
        Made {fmtDateTime(suggestions.generated_at)}
        {suggestions.mode === 'heuristic' ? ' by simple counting because the AI was not available' : ' by the AI'}. These are ideas, not promises, and some games do not allow selling accounts.
      </p>
      {header}
      {suggestions.notes && <p className="mb-3 whitespace-pre-wrap break-words text-sm text-fg-muted">{suggestions.notes}</p>}
      <Stagger as="ul" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((s, i) => (
          <SuggestionCard key={`${s.title}-${i}`} s={s} added={has(s)} onAdd={() => onAdd(s)} />
        ))}
      </Stagger>
    </div>
  );
}

/** Opens the entry drawer prefilled from a suggestion and writes the new entry into settings.trading.i_sell. */
export function useCatalogAdder(onAdded: () => void, games: string[]) {
  const { pushToast } = useShell();
  const [pending, setPending] = useState<TradeEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const start = useCallback((s: TradingSuggestion) => {
    setPending(blankEntry({ label: s.title, game: s.game, item_type: s.item_type || 'account' }));
  }, []);

  const save = async (entry: TradeEntry) => {
    setSaving(true);
    const cur = await loadSetting('trading');
    if (cur.error) {
      setSaving(false);
      pushToast('error', `Could not save: ${cur.error}`);
      return;
    }
    const res = await patchSetting('trading', { i_sell: [...cur.value.i_sell, entry], updated_at: new Date().toISOString() });
    setSaving(false);
    if (res.error) {
      pushToast('error', `Could not save: ${res.error}`);
      return;
    }
    setPending(null);
    pushToast('success', `Added "${entry.label}" to what you sell.`);
    onAdded();
  };

  const drawer = <EntryDrawer open={pending !== null} kind="sell" entry={pending} editing={false} games={games} saving={saving} onClose={() => setPending(null)} onSave={(e) => void save(e)} />;
  return { start, drawer };
}
