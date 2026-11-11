// Run: node --test worker/lib/price-market.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { marketStats, verdict, verdictText, trimOutliers, toUsd, normCurrency, currencyFromText, normalizeItemKey, itemKeyFromText, pointFromLead, pointFromDeal, pointFromStock, leadVerdict, weeklySeries, mergeRates, percentile } from './price-market.mjs';
import { matchStock } from './stock-match.mjs';
import { matchTrade } from './trade-match.mjs';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const pt = (usd, kind = 'sold', extra = {}) => ({ game: 'Fortnite', item_type: 'account', item_key: '', price_usd: usd, kind, captured_at: '2026-11-01T00:00:00Z', ...extra });
const T = { game: 'fortnite', item_type: 'account' };

test('currency normalisation and USD estimate', () => {
  assert.equal(normCurrency('€'), 'EUR');
  assert.equal(normCurrency('gbp'), 'GBP');
  assert.equal(normCurrency(''), 'USD');
  assert.equal(currencyFromText('selling for 50 eur'), 'EUR');
  assert.equal(currencyFromText('£20 paypal'), 'GBP');
  assert.equal(currencyFromText('$30'), 'USD');
  assert.equal(toUsd(100, 'EUR', { EUR: 1.1 }), 110);
  assert.equal(toUsd(10, 'XYZ'), null);
  assert.equal(toUsd(-5, 'USD'), null);
  assert.equal(mergeRates({ eur: 2, bad: 'x' }).EUR, 2);
});

test('item keys', () => {
  assert.equal(normalizeItemKey('10K V-Bucks'), '10000 v bucks');
  assert.equal(normalizeItemKey('1.5k'), '1500');
  assert.equal(itemKeyFromText('Selling Diamond 2 account'), 'diamond');
  assert.equal(itemKeyFromText('10k robux cheap'), '10000 robux');
  assert.equal(itemKeyFromText('nothing here'), '');
});

test('fewer than 3 points is not enough data and never invents a market', () => {
  assert.equal(marketStats([pt(10), pt(12)], T, { now: NOW }).enough, false);
  assert.equal(marketStats([], T, { now: NOW }).enough, false);
  const s = marketStats([pt(10), pt(12)], T, { now: NOW });
  assert.equal(s.median, null);
  assert.match(s.reason, /at least 3/);
  assert.deepEqual(verdict(20, s), { verdict: null, pct: null });
  assert.equal(verdictText(verdict(20, s), s), 'No market data yet');
});

test('sold prices come first; asking is a labelled fallback', () => {
  const sold = [pt(100), pt(110), pt(120)];
  const ask = [pt(10, 'asking'), pt(20, 'asking'), pt(30, 'offer'), pt(40, 'asking')];
  const a = marketStats([...sold, ...ask], T, { now: NOW });
  assert.equal(a.basis, 'sold');
  assert.equal(a.median, 110);
  const b = marketStats([pt(100), ...ask], T, { now: NOW });
  assert.equal(b.basis, 'asking');
  assert.equal(b.confidence, 'low');
  assert.equal(b.n_sold, 1);
});

test('percentiles and outlier trimming', () => {
  const v = [10, 11, 12, 13, 14, 15, 500];
  assert.ok(!trimOutliers(v).includes(500));
  assert.deepEqual(trimOutliers([1, 100, 200]), [1, 100, 200]);
  const s = marketStats(v.map((x) => pt(x)), T, { now: NOW });
  assert.equal(s.n, 6);
  assert.equal(s.median, 12.5);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.25), 2);
  assert.ok(s.p25 < s.median && s.median < s.p75);
  assert.equal(s.confidence, 'medium');
});

test('item key narrows when it has enough samples, otherwise falls back to the whole type', () => {
  const pts = [pt(50, 'sold', { item_key: 'diamond' }), pt(55, 'sold', { item_key: 'diamond' }), pt(60, 'sold', { item_key: 'diamond' }), pt(10), pt(12), pt(14)];
  const d = marketStats(pts, { ...T, item_key: 'Diamond' }, { now: NOW });
  assert.equal(d.scope, 'item');
  assert.equal(d.median, 55);
  const g = marketStats(pts, { ...T, item_key: 'gold' }, { now: NOW });
  assert.equal(g.scope, 'type');
});

test('old points and other games are ignored, excluded lead is skipped', () => {
  const old = { ...pt(500), captured_at: '2025-01-01T00:00:00Z' };
  const other = { ...pt(500), game: 'Valorant' };
  assert.equal(marketStats([old, old, old, other, other, other], T, { now: NOW }).enough, false);
  const own = [pt(10, 'asking', { lead_id: 'L' }), pt(10, 'asking'), pt(12, 'asking')];
  assert.equal(marketStats(own, T, { now: NOW, excludeLeadId: 'L' }).enough, false);
});

test('verdict below / fair / above with percent', () => {
  const s = marketStats([pt(100), pt(100), pt(100), pt(100)], T, { now: NOW });
  assert.deepEqual(verdict(82, s), { verdict: 'below', pct: -18 });
  assert.equal(verdict(105, s).verdict, 'fair');
  assert.deepEqual(verdict(130, s), { verdict: 'above', pct: 30 });
  assert.equal(verdictText(verdict(82, s), s), '18% below market, based on 4 sales');
  assert.equal(verdictText(verdict(130, s), s), '30% above market, based on 4 sales');
  assert.equal(verdict(null, s).verdict, null);
});

test('points from leads, deals and stock', () => {
  const lead = { id: 'a', lead_kind: 'trade', game: 'Fortnite', item_type: 'account', title: 'Selling diamond acc', budget: '€40', budget_amount: 40, trade_side: 'seller', status: 'New', source: 'Reddit', created_at: '2026-11-01T00:00:00Z' };
  const p = pointFromLead(lead, { EUR: 1.1, USD: 1 });
  assert.equal(p.kind, 'asking');
  assert.equal(p.price_usd, 44);
  assert.equal(p.ref_key, 'lead-ask:a');
  assert.equal(pointFromLead({ ...lead, trade_side: 'buyer' }).kind, 'offer');
  assert.equal(pointFromLead({ ...lead, status: 'Won' }).kind, 'sold');
  assert.equal(pointFromLead({ ...lead, is_suspicious: true }), null);
  assert.equal(pointFromLead({ ...lead, budget_amount: null }), null);
  assert.equal(pointFromDeal({ id: 'd', kind: 'trade', stage: 'talking', game: 'Fortnite', value: 10 }), null);
  assert.equal(pointFromDeal({ id: 'd', kind: 'trade', stage: 'done', game: 'Fortnite', value: 10, currency: 'USD' }).ref_key, 'deal:d');
  const sp = pointFromStock({ id: 's', game: 'Fortnite', item_type: 'account', title: 'OG', sold_price: 30, currency: 'USD', sold_at: '2026-11-02T00:00:00Z' });
  assert.equal(sp.kind, 'sold');
  assert.equal(sp.price_usd, 30);
});

test('leadVerdict excludes the lead itself and handles no data', () => {
  const lead = { id: 'x', game: 'Fortnite', item_type: 'account', title: 'selling acc', budget: '$80', budget_amount: 80 };
  const pts = [pt(100), pt(100), pt(100)];
  const v = leadVerdict(lead, pts, undefined, NOW);
  assert.equal(v.price_verdict, 'below');
  assert.equal(v.market_samples, 3);
  assert.equal(leadVerdict(lead, [pt(100)], undefined, NOW).price_verdict, null);
  assert.equal(leadVerdict({ ...lead, budget_amount: null }, pts).price_verdict, null);
});

test('weekly series', () => {
  const s = weeklySeries([pt(10), pt(20, 'sold', { captured_at: '2026-11-02T00:00:00Z' }), pt(99, 'asking')], { game: 'fortnite', now: NOW });
  assert.equal(s.length >= 1, true);
  assert.equal(s.reduce((a, b) => a + b.n, 0), 2);
});

const stockItem = (o) => ({ id: 's1', game: 'Fortnite', item_type: 'account', title: 'OG Fortnite account', quantity: 1, ask_price: 50, currency: 'USD', status: 'in_stock', ...o });
const buyer = { trade_side: 'buyer', game: 'Fortnite', item_type: 'account', title: 'WTB og fortnite account', description: '', budget: '$60', budget_amount: 60 };

test('stock matching: only in_stock with quantity, shows ask vs budget', () => {
  const m = matchStock(buyer, [stockItem({}), stockItem({ id: 's2', status: 'sold' }), stockItem({ id: 's3', quantity: 0 }), stockItem({ id: 's4', status: 'reserved' }), stockItem({ id: 's5', game: 'Valorant' })]);
  assert.equal(m.length, 1);
  assert.equal(m[0].item.id, 's1');
  assert.equal(m[0].fits, true);
  assert.equal(m[0].diff_pct, -17);
  const pricey = matchStock({ ...buyer, budget: '$20', budget_amount: 20 }, [stockItem({})]);
  assert.equal(pricey[0].fits, false);
  assert.equal(matchStock({ ...buyer, trade_side: 'seller' }, [stockItem({})]).length, 0);
});

test('matchTrade uses stock when stock rows exist, catalog when none', () => {
  const trading = { i_sell: [{ label: 'Fortnite accounts', game: 'Fortnite', item_type: 'account', keywords: [], price: null }] };
  assert.match(matchTrade(buyer, trading).label, /Buyer for your Fortnite accounts/);
  assert.match(matchTrade(buyer, trading, undefined, { any: false, items: [] }).label, /Fortnite accounts/);
  const withStock = matchTrade(buyer, trading, undefined, { any: true, items: [stockItem({})] });
  assert.equal(withStock.label, 'Buyer for your stock: OG Fortnite account');
  assert.equal(matchTrade(buyer, trading, undefined, { any: true, items: [] }), null);
});
