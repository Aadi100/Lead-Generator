"use client";

import { useEffect, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { Button, Drawer, Field, Input, Select, TagInput, Textarea } from '@/components/ui';
import { itemLabel } from '@/lib/format';
import { saveStock } from '@/lib/stock-data';
import { COMMON_GAMES } from '@/lib/trading-stats';
import { ITEM_TYPES } from '@/lib/types';
import { CURRENCIES, PLATFORMS, type StockItem } from '@/lib/types-stock';

type Draft = { game: string; item_type: string; title: string; description: string; quantity: string; ask_price: string; currency: string; cost: string; listed_on: string[]; notes: string };

const blank = (): Draft => ({ game: '', item_type: 'account', title: '', description: '', quantity: '1', ask_price: '', currency: 'USD', cost: '', listed_on: [], notes: '' });
const fromItem = (i: StockItem): Draft => ({
  game: i.game, item_type: i.item_type, title: i.title, description: i.description ?? '', quantity: String(i.quantity),
  ask_price: i.ask_price === null ? '' : String(i.ask_price), currency: i.currency, cost: i.cost === null ? '' : String(i.cost), listed_on: i.listed_on, notes: i.notes ?? '',
});
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

/** Add or edit one stock item. */
import Advanced from '@/components/settings/Advanced';

export default function StockDrawer({ open, item, games, onClose, onSaved }: { open: boolean; item: StockItem | null; games: string[]; onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useShell();
  const [d, setD] = useState<Draft>(blank);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setD(item ? fromItem(item) : blank());
      setTouched(false);
    }
  }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const qty = Number(d.quantity);
  const ask = numOrNull(d.ask_price);
  const cost = numOrNull(d.cost);
  const bad = {
    title: !d.title.trim(),
    game: !d.game.trim(),
    qty: !Number.isInteger(qty) || qty < 0,
    ask: ask !== null && (!Number.isFinite(ask) || ask < 0),
    cost: cost !== null && (!Number.isFinite(cost) || cost < 0),
  };
  const gameOptions = Array.from(new Set([...COMMON_GAMES, ...games]));
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));

  const submit = async () => {
    setTouched(true);
    if (Object.values(bad).some(Boolean)) return;
    setSaving(true);
    const keepStatus = item && item.status !== 'sold' ? item.status : 'in_stock';
    const err = await saveStock(item?.id ?? null, {
      game: d.game.trim(), item_type: d.item_type, title: d.title.trim(), description: d.description.trim() || null, quantity: qty,
      ask_price: ask, currency: d.currency, cost, status: item ? item.status : keepStatus, listed_on: d.listed_on, notes: d.notes.trim() || null,
    });
    setSaving(false);
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return;
    }
    pushToast('success', item ? 'Stock item updated.' : 'Added to your stock.');
    onSaved();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={item ? 'Edit stock item' : 'Add to stock'}
      description="Add something you have to sell. Prices are per unit."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {item ? 'Save changes' : 'Add to stock'}
          </Button>
        </>
      }
    >
      <datalist id="stock-games-list">
        {gameOptions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="space-y-4">
        <Field label="Title" htmlFor="st-title" hint="For example: OG Fortnite account, 2018 skins" error={touched && bad.title ? 'Give it a short title.' : null}>
          <Input id="st-title" value={d.title} onChange={(e) => set({ title: e.target.value })} autoFocus invalid={touched && bad.title} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Game" htmlFor="st-game" error={touched && bad.game ? 'Pick or type a game.' : null}>
            <Input id="st-game" list="stock-games-list" value={d.game} onChange={(e) => set({ game: e.target.value })} placeholder="Fortnite" invalid={touched && bad.game} />
          </Field>
          <Field label="Kind of item" htmlFor="st-type">
            <Select id="st-type" value={d.item_type} onChange={(e) => set({ item_type: e.target.value })}>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {itemLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quantity" htmlFor="st-qty" error={touched && bad.qty ? 'Whole number, 0 or more.' : null}>
            <Input id="st-qty" type="number" min={0} step={1} inputMode="numeric" value={d.quantity} onChange={(e) => set({ quantity: e.target.value })} invalid={touched && bad.qty} />
          </Field>
          <Field label="Asking price" htmlFor="st-ask" error={touched && bad.ask ? 'A number, 0 or more.' : null}>
            <Input id="st-ask" type="number" min={0} step="any" inputMode="decimal" value={d.ask_price} onChange={(e) => set({ ask_price: e.target.value })} invalid={touched && bad.ask} />
          </Field>
          <Field label="Currency" htmlFor="st-cur">
            <Select id="st-cur" value={d.currency} onChange={(e) => set({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Details (optional)" htmlFor="st-desc" hint="Rank, level, skins, server. Words here help match buyers.">
          <Textarea id="st-desc" rows={3} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Advanced id="stock-form" title="Show advanced" hint="What you paid, where it is listed and private notes.">
        <Field label="What you paid (optional)" htmlFor="st-cost" hint="Per unit, same currency. Used to work out profit when you sell." error={touched && bad.cost ? 'A number, 0 or more.' : null}>
          <Input id="st-cost" type="number" min={0} step="any" inputMode="decimal" value={d.cost} onChange={(e) => set({ cost: e.target.value })} invalid={touched && bad.cost} />
        </Field>
        <Field label="Listed on" htmlFor="st-listed" hint="Platforms where it is for sale. Press Enter after each one.">
          <TagInput id="st-listed" label="Listed on" value={d.listed_on} onChange={(v) => set({ listed_on: v })} placeholder={PLATFORMS.slice(0, 3).join(', ')} />
        </Field>
        <Field label="Private notes (optional)" htmlFor="st-notes">
          <Textarea id="st-notes" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        </Advanced>
      </div>
    </Drawer>
  );
}
