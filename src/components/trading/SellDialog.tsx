"use client";

import { useEffect, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { Banner, Button, Field, Input, Modal } from '@/components/ui';
import { sellStock } from '@/lib/stock-data';
import { fmtMoney, type Rates } from '@/lib/stock-stats';
import type { StockItem } from '@/lib/types-stock';

/** Asks for the real price and quantity, then records the sale (and the sold price point). */
export default function SellDialog({ item, rates, defaultPrice, open, onClose, onDone }: { item: StockItem | null; rates: Rates; defaultPrice?: number | null; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { pushToast } = useShell();
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open && item) {
      const p = defaultPrice ?? item.ask_price;
      setPrice(p === null || p === undefined ? '' : String(p));
      setQty(String(item.quantity));
      setTouched(false);
    }
  }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;
  const priceNum = price.trim() === '' ? NaN : Number(price);
  const qtyNum = Number(qty);
  const priceBad = !Number.isFinite(priceNum) || priceNum <= 0;
  const qtyBad = !Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > item.quantity;
  const profit = !priceBad && item.cost !== null && !qtyBad ? (priceNum - item.cost) * qtyNum : null;

  const submit = async () => {
    setTouched(true);
    if (priceBad || qtyBad) return;
    setBusy(true);
    const r = await sellStock(item, { price: priceNum, quantity: qtyNum }, rates);
    setBusy(false);
    if (r.error) {
      pushToast('error', `Could not record the sale: ${r.error}`);
      return;
    }
    pushToast('success', r.leadClosed ? 'Sale recorded. The buyer lead is now marked Won.' : 'Sale recorded and the price was saved to your price history.');
    onDone?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as sold"
      description={`${item.title}${item.quantity > 1 ? ` (${item.quantity} in stock)` : ''}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Record sale
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Sold price per unit (${item.currency})`} htmlFor="sd-price" error={touched && priceBad ? 'Enter the price you got.' : null}>
            <Input id="sd-price" type="number" min={0} step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} invalid={touched && priceBad} autoFocus />
          </Field>
          <Field label="Units sold" htmlFor="sd-qty" error={touched && qtyBad ? `Between 1 and ${item.quantity}.` : null}>
            <Input id="sd-qty" type="number" min={1} max={item.quantity} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} invalid={touched && qtyBad} />
          </Field>
        </div>
        {profit !== null ? (
          <Banner tone={profit >= 0 ? 'success' : 'warning'}>
            Profit on this sale: <span className="font-num font-semibold">{fmtMoney(profit, item.currency)}</span> ({fmtMoney(item.cost, item.currency)} paid per unit).
          </Banner>
        ) : (
          <p className="text-xs text-fg-subtle">{item.cost === null ? 'No cost saved for this item, so profit is not calculated.' : ''}</p>
        )}
        {item.buyer_lead_id && <p className="text-xs text-fg-subtle">This item is reserved for a buyer lead; it will be marked Won.</p>}
      </div>
    </Modal>
  );
}
