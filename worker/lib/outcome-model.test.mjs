// Run: node --test worker/lib/outcome-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { labelExamples, trainModel, scoreLead, blendScore, summarizeModel, budgetBand, featuresOf } from './outcome-model.mjs';

let n = 0;
const mk = (o) => ({ id: `l${++n}`, source: 'Reddit', category: 'Website', budget_amount: 0, trust_score: 60, tags: [], best_email: null, lead_kind: 'request', status: 'New', ...o });

function dataset() {
  const out = [];
  // Reddit + Website + Shopify tag: wins often
  for (let i = 0; i < 10; i++) out.push(mk({ source: 'Reddit', category: 'Website', tags: ['shopify'], budget_amount: 800, best_email: 'a@b.co', status: i < 7 ? 'Replied' : i < 8 ? 'Won' : 'Ignored' }));
  // Freelancer + Design: nearly always ignored
  for (let i = 0; i < 12; i++) out.push(mk({ source: 'Freelancer', category: 'Design', tags: ['logo'], budget_amount: 30, status: i < 11 ? 'Ignored' : 'Replied' }));
  // untouched
  for (let i = 0; i < 5; i++) out.push(mk({ status: 'New' }));
  return out;
}

test('too little data gives an honest not-ready model', () => {
  const m = trainModel(labelExamples([mk({ status: 'Won' }), mk({ status: 'Ignored' })]));
  assert.equal(m.status, 'insufficient');
  assert.match(m.note, /Not enough data/);
  assert.equal(scoreLead(m, mk()), null);
});

test('one-sided outcomes are not enough either', () => {
  const leads = Array.from({ length: 30 }, () => mk({ status: 'Ignored' }));
  assert.equal(trainModel(labelExamples(leads)).status, 'insufficient');
});

test('learns what wins and explains it', () => {
  const m = trainModel(labelExamples(dataset()));
  assert.equal(m.status, 'ready');
  const good = scoreLead(m, mk({ source: 'Reddit', category: 'Website', tags: ['shopify'], budget_amount: 900, best_email: 'x@y.co' }));
  const bad = scoreLead(m, mk({ source: 'Freelancer', category: 'Design', tags: ['logo'], budget_amount: 25 }));
  assert.ok(good.score > 60, `good ${good.score}`);
  assert.ok(bad.score < 40, `bad ${bad.score}`);
  assert.ok(good.score > bad.score + 25);
  assert.ok(good.reasons.length > 0 && good.reasons.every((r) => r.n >= 5 && typeof r.text === 'string'));
  assert.ok(bad.reasons.some((r) => r.effect === 'down'));
  const s = summarizeModel(m);
  assert.ok(s.top_positive.length > 0 && s.top_negative.length > 0);
  assert.ok(s.top_positive.every((x) => x.n >= 5));
});

test('features with fewer than 5 samples are ignored', () => {
  const leads = dataset();
  leads.push(mk({ source: 'Hacker News', status: 'Won' }), mk({ source: 'Hacker News', status: 'Won' }));
  const m = trainModel(labelExamples(leads));
  assert.equal(m.features['source:Hacker News'], undefined);
});

test('smoothing keeps tiny samples from reaching extremes', () => {
  const m = trainModel(labelExamples(dataset()));
  for (const f of Object.values(m.features)) assert.ok(f.rate > 0.02 && f.rate < 0.98);
});

test('deals override lead status and trade leads are skipped', () => {
  const a = mk({ status: 'Pitched' });
  const t = mk({ status: 'Won', lead_kind: 'trade' });
  const ex = labelExamples([a, t], [{ lead_id: a.id, stage: 'paid' }]);
  assert.equal(ex.length, 1);
  assert.equal(ex[0].status, 'Won');
});

test('blend keeps the original score when the model has nothing to say', () => {
  assert.equal(blendScore(72, null, 0.4), 72);
  assert.equal(blendScore(80, 20, 0.5), 50);
  assert.equal(blendScore(80, 20, 0.15), 71);
  assert.equal(blendScore(null, 40, 0.3), 40);
});

test('budget bands', () => {
  assert.equal(budgetBand(null), 'unknown');
  assert.equal(budgetBand(250), '100to499');
  assert.ok(featuresOf(mk({ tags: ['a', 'b'] })).some((f) => f.key === 'topic:a'));
});
