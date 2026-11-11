"use client";

import { useEffect, useState } from 'react';
import { Button, Drawer, Field, Input, Select, TagInput } from '@/components/ui';
import { ITEM_TYPES, type TradeEntry } from '@/lib/types';
import { itemLabel } from '@/lib/format';
import { COMMON_GAMES, blankEntry } from '@/lib/trading-stats';

export type EntryKind = 'sell' | 'want';

/** Add or edit one catalog entry (something I sell, or something I want to buy). */
export default function EntryDrawer({
  open,
  kind,
  entry,
  editing = true,
  games,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  kind: EntryKind;
  entry: TradeEntry | null;
  /** false when entry is only a prefill for a new item */
  editing?: boolean;
  games: string[];
  saving?: boolean;
  onClose: () => void;
  onSave: (entry: TradeEntry) => void;
}) {
  const [draft, setDraft] = useState<TradeEntry>(() => entry ?? blankEntry());
  const [priceText, setPriceText] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      const e = entry ?? blankEntry();
      setDraft(e);
      setPriceText(e.price === null ? '' : String(e.price));
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const priceNum = priceText.trim() === '' ? null : Number(priceText);
  const priceBad = priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0);
  const nameBad = !draft.label.trim() && !draft.game.trim();
  const priceLabel = kind === 'sell' ? 'Lowest price I accept (USD)' : 'Highest price I will pay (USD)';
  const sell = kind === 'sell';
  const gameOptions = Array.from(new Set([...COMMON_GAMES, ...games]));

  const submit = () => {
    setTouched(true);
    if (nameBad || priceBad) return;
    onSave({
      ...draft,
      label: draft.label.trim() || draft.game.trim(),
      game: draft.game.trim(),
      price: priceNum,
      keywords: draft.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 20),
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={entry && editing ? (sell ? 'Edit what I sell' : 'Edit what I want') : sell ? 'Add something I sell' : 'Add something I want to buy'}
      description={
        sell
          ? 'I look for people who want to buy this and show them under Buyers.'
          : 'I look for people selling this and show them under Sellers.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {entry && editing ? 'Save changes' : 'Add to catalog'}
          </Button>
        </>
      }
    >
      <datalist id="trading-games-list">
        {gameOptions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="space-y-4">
        <Field label="Name" htmlFor="te-label" hint={sell ? 'For example: Fortnite OG accounts' : 'For example: Valorant accounts with skins'} error={touched && nameBad ? 'Give it a name or pick a game.' : null}>
          <Input id="te-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={sell ? 'Fortnite OG accounts' : 'Valorant accounts with skins'} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Game" htmlFor="te-game">
            <Input id="te-game" list="trading-games-list" value={draft.game} onChange={(e) => setDraft({ ...draft, game: e.target.value })} placeholder="Fortnite" />
          </Field>
          <Field label="Kind of item" htmlFor="te-type">
            <Select id="te-type" value={draft.item_type} onChange={(e) => setDraft({ ...draft, item_type: e.target.value })}>
              <option value="">Any kind</option>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {itemLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={priceLabel} htmlFor="te-price" hint="Leave empty for no limit." error={touched && priceBad ? 'Use a number of zero or more.' : null}>
          <Input id="te-price" type="number" min={0} step={5} inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} invalid={touched && priceBad} />
        </Field>
        <Field label="Words that must show up (optional)" htmlFor="te-kw" hint="Example: og, full access, stacked. Press Enter after each one.">
          <TagInput id="te-kw" label="Words that must show up" value={draft.keywords} onChange={(v) => setDraft({ ...draft, keywords: v })} placeholder="og" lowercase />
        </Field>
      </div>
    </Drawer>
  );
}
