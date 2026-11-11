// Run: node --test worker/lib/dedupe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePair, keysOf, normalizeEmail, domainKey, normalizeHandle, titleFingerprint, summarizeLinks, applySignals } from './dedupe.mjs';

const body1 = 'We run a small bakery in Leeds and need a new online ordering website with Stripe payments, a menu page, opening hours, a gallery and a contact form. We would like it built on Shopify or WordPress and finished within six weeks. Please include examples of similar bakery or restaurant websites you have built before and your hourly rate.';

const reddit = { id: 'r1', source: 'Reddit', title: '[HIRING] Online ordering website for a Leeds bakery (Shopify or WordPress)', description: body1, author: 'u/BakeryOwner_Leeds', contact: 'email: sam@leedsbakehouse.co.uk · reddit: u/BakeryOwner_Leeds', tags: ['website'] };
const freelancer = { id: 'f1', source: 'Freelancer', title: 'Online ordering website for a Leeds bakery (Shopify or WordPress)', description: body1 + ' Posted via Freelancer.', author: null, contact: 'Bid on the project page (freelancer.com)' };

test('same ad cross-posted with no contact on one side is linked', () => {
  const r = comparePair(reddit, freelancer);
  assert.ok(r, 'should match');
  assert.equal(r.relation, 'cross_post');
  assert.ok(r.reasons.some((x) => /similar text|same title/.test(x)));
});

test('same email on two sources is a strong same_contact', () => {
  const a = { id: 'a', source: 'Reddit', title: 'Need a logo', description: 'x', contact: 'email: Sam.Baker@leedsbakehouse.co.uk' };
  const b = { id: 'b', source: 'Freelancer', title: 'Brand identity for bakery', description: 'y', best_email: 'sam.baker@leedsbakehouse.co.uk' };
  const r = comparePair(a, b);
  assert.equal(r.relation, 'same_contact');
  assert.equal(r.state, 'auto');
});

test('gmail dot and plus variants are the same mailbox', () => {
  assert.equal(normalizeEmail('John.Smith+leads@gmail.com').email, 'johnsmith@gmail.com');
});

test('generic domains and role mailboxes on free mail never match', () => {
  const a = { id: 'a', source: 'Reddit', title: 'Need a website for my shop', description: 'one', contact: 'email: info@gmail.com · site: apps.apple.com/us/app/foo/id1' };
  const b = { id: 'b', source: 'Freelancer', title: 'Logo for a startup', description: 'two', contact: 'email: info@gmail.com · site: apps.apple.com/us/app/bar/id2', best_email: 'someone@gmail.com' };
  assert.equal(normalizeEmail('info@gmail.com'), null);
  assert.equal(domainKey('apps.apple.com/us/app/foo/id1'), null);
  assert.equal(domainKey('https://gmail.com'), null);
  assert.equal(comparePair(a, b), null);
  assert.deepEqual(keysOf(a).filter((k) => k.kind === 'email' || k.kind === 'domain'), []);
});

test('two different people with a generic title do not match', () => {
  const a = { id: 'a', source: 'Reddit', title: 'Need a website developer', description: 'I need a site for my plumbing business in Texas', author: 'u/plumber_joe' };
  const b = { id: 'b', source: 'Freelancer', title: 'Need a website developer', description: 'Website for a dentist office, five pages', author: 'dentist_amy' };
  assert.equal(titleFingerprint('Need a website developer'), null);
  assert.equal(comparePair(a, b), null);
});

test('short titles do not fingerprint', () => {
  assert.equal(titleFingerprint('Logo design'), null);
  assert.equal(titleFingerprint('Need an app'), null);
});

test('same text blasted by different contacts is a blast, not a merge', () => {
  const t = 'Looking for partners to build our crypto exchange platform with guaranteed returns, contact us now for an exclusive investment opportunity in a revolutionary blockchain trading ecosystem, high profit guaranteed, join our private group today and start earning without any experience needed right away';
  const a = { id: 'a', source: 'Reddit', title: 'Exclusive blockchain trading ecosystem partners wanted now', description: t, author: 'u/crypto_fan_991', contact: 'telegram: @fastprofit_one' };
  const b = { id: 'b', source: 'Reddit', title: 'Exclusive blockchain trading ecosystem partners wanted now', description: t, author: 'u/crypto_fan_992', contact: 'telegram: @fastprofit_two' };
  const r = comparePair(a, b);
  assert.equal(r.relation, 'text_blast');
  const links = [{ relation: 'text_blast', state: 'auto', other: b }, { relation: 'text_blast', state: 'auto', other: { id: 'c', source: 'Freelancer' } }];
  const s = summarizeLinks(a, links);
  assert.ok(s.flag && s.make_suspicious && s.trust_delta < 0);
  const one = summarizeLinks(a, [links[0]]);
  assert.equal(one.flag, null);
});

test('same contact on two sources raises trust mildly, and re-applying does not stack', () => {
  const lead = { id: 'a', source: 'Reddit', trust_score: 60, flags: ['Very little detail in the post'], is_suspicious: false };
  const links = [{ relation: 'same_contact', state: 'auto', other: { id: 'b', source: 'Freelancer' } }];
  const s1 = summarizeLinks(lead, links);
  assert.equal(s1.trust_delta, 5);
  const first = applySignals(lead, null, s1);
  assert.equal(first.patch.trust_score, 65);
  const second = applySignals({ ...lead, ...first.patch }, first.signals, s1);
  assert.equal(second.patch.trust_score, 65);
  // split (no live links): back to the original
  const undone = applySignals({ ...lead, ...second.patch }, second.signals, summarizeLinks(lead, []));
  assert.equal(undone.patch.trust_score, 60);
});

test('handles: short or generic handles are ignored, real ones match', () => {
  assert.equal(normalizeHandle('u/admin'), null);
  assert.equal(normalizeHandle('bob'), null);
  assert.equal(normalizeHandle('u/Front-Extension-1847'), 'front-extension-1847');
  const a = { id: 'a', source: 'Reddit', title: 'Need app', description: 'a', author: 'u/Front-Extension-1847' };
  const b = { id: 'b', source: 'Web Form', title: 'Another thing', description: 'b', contact: 'discord: front-extension-1847' };
  assert.equal(comparePair(a, b).relation, 'same_contact');
});

test('same company website alone is only suspected, with text it is auto', () => {
  const a = { id: 'a', source: 'Reddit', title: 'Redesign our product pages', description: 'one two', website: 'https://www.acme-widgets.io/' };
  const b = { id: 'b', source: 'Freelancer', title: 'Build an iOS companion app', description: 'three', website: 'acme-widgets.io' };
  const r = comparePair(a, b);
  assert.equal(r.state, 'suspected');
});
