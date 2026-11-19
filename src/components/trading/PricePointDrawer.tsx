"use client";

import Advanced from '@/components/settings/Advanced';
import { useEffect, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { Button, Drawer, Field, Input, Select, Textarea } from '@/components/ui';
import { itemLabel } from '@/lib/format';
import { savePoint } from '@/lib/stock-data';
import type { Rates } from '@/lib/stock-stats';
import { COMMON_GAMES } from '@/lib/trading-stats';
import { ITEM_TYPES } from '@/lib/types';
import { CURRENCIES, PLATFORMS, PRICE_KIND_LABEL, PRICE_KINDS, type PriceKind, type PricePoint } from '@/lib/types-stock';

type Draft = { game: string; item_type: string; item_key: string; price: string; currency: string; kind: PriceKind; source: string; date: string; note: string };

const today = () => new Date().toISOString().slice(0, 10);
const blank = (prefill?: Partial<Draft>): Draft => ({ game: '', item_type: 'account', item_key: '', price: '', currency: 'USD', kind: 'sold', source: '', date: today(), note: '', ...prefill });
const fromPoint = (p: PricePoint): Draft => ({
  game: p.game, item_type: p.item_type, item_key: p.item_key, price: String(p.price), currency: p.currency, kind: p.kind, source: p.source ?? '', date: p.captured_at.slice(0, 10), note: p.note ?? '',
});

/** Log a sale or price ("Log a sale / price") and edit existing manual points. */
export default function PricePointDrawer({ open, point, prefill, games, rates, onClose, onSaved }: { open: boolean; point: PricePoint | null; prefill?: Partial<Draft>; games: string[]; rates: Rates; onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useShell();
  const [d, setD] = useState<Draft>(blank);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setD(point ? fromPoint(point) : blank(prefill));
      setTouched(false);
    }
  }, [open, point?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const price = Number(d.price);
  const bad = { game: !d.game.trim(), price: d.price.trim() === '' || !Number.isFinite(price) || price <= 0, date: !d.date || Number.isNaN(Date.parse(d.date)) };
  const set = (patch: Partial<Draft>) => setD((c) => ({ ...c, ...patch }));
  const gameOptions = Array.from(new Set([...COMMON_GAMES, ...games]));
  const usd = !bad.price && rates[d.currency] ? Math.round(price * rates[d.currency] * 100) / 100 : null;

  const submit = async () => {
    setTouched(true);
    if (Object.values(bad).some(Boolean)) return;
    setSaving(true);
    const err = await savePoint(
      point?.id ?? null,
      { game: d.game.trim(), item_type: d.item_type, item_key: d.item_key, price, currency: d.currency, kind: d.kind, source: d.source.trim() || null, captured_at: new Date(`${d.date}T12:00:00`).toISOString(), note: d.note.trim() || null },
      rates,
    );
    setSaving(false);
    if (err) {
      pushToast('error', `Could not save: ${err}`);
      return;
    }
    pushToast('success', point ? 'Price updated.' : 'Price saved. The market numbers update within a few minutes.');
    onSaved();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={point ? 'Edit price' : 'Log a sale or price'}
      description="Real sales are the strongest evidence. Asking prices and buyer offers count too, but only when there are no sales."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {point ? 'Save changes' : 'Save price'}
          </Button>
        </>
      }
    >
      <datalist id="pp-games-list">
        {gameOptions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <datalist id="pp-sources-list">
        {PLATFORMS.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="space-y-4">
        <Field label="What kind of price is it?" htmlFor="pp-kind">
          <Select id="pp-kind" value={d.kind} onChange={(e) => set({ kind: e.target.value as PriceKind })}>
            {PRICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {PRICE_KIND_LABEL[k]}
                {k === 'sold' ? ' (it really sold for this)' : k === 'asking' ? ' (someone is asking this)' : ' (a buyer offered this)'}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Game" htmlFor="pp-game" error={touched && bad.game ? 'Pick or type a game.' : null}>
            <Input id="pp-game" list="pp-games-list" value={d.game} onChange={(e) => set({ game: e.target.value })} placeholder="Fortnite" invalid={touched && bad.game} autoFocus />
          </Field>
          <Field label="Kind of item" htmlFor="pp-type">
            <Select id="pp-type" value={d.item_type} onChange={(e) => set({ item_type: e.target.value })}>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {itemLabel(t)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <Field label="Price" htmlFor="pp-price" error={touched && bad.price ? 'Enter a price above 0.' : null} hint={usd !== null && d.currency !== 'USD' ? `About $${usd} (approximate rate)` : undefined}>
            <Input id="pp-price" type="number" min={0} step="any" inputMode="decimal" value={d.price} onChange={(e) => set({ price: e.target.value })} invalid={touched && bad.price} />
          </Field>
          <Field label="Currency" htmlFor="pp-cur">
            <Select id="pp-cur" value={d.currency} onChange={(e) => set({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Advanced id="price-point-form" title="Show advanced" hint="Where it was, the date, a detail like a rank, and a note.">
        <Field label="Detail (optional)" htmlFor="pp-key" hint="A rank, level, server or amount, for example: diamond, 10k, EU. Prices with the same detail are compared with each other.">
          <Input id="pp-key" value={d.item_key} onChange={(e) => set({ item_key: e.target.value })} placeholder="diamond" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Where" htmlFor="pp-src" hint="Platform, optional">
            <Input id="pp-src" list="pp-sources-list" value={d.source} onChange={(e) => set({ source: e.target.value })} placeholder="Reddit" />
          </Field>
          <Field label="Date" htmlFor="pp-date" error={touched && bad.date ? 'Pick a date.' : null}>
            <Input id="pp-date" type="date" value={d.date} max={today()} onChange={(e) => set({ date: e.target.value })} invalid={touched && bad.date} />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="pp-note">
          <Textarea id="pp-note" rows={2} value={d.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        </Advanced>
      </div>
    </Drawer>
  );
}
