import assert from 'node:assert/strict';
import { buildPayload, sendPush, isGone } from './push.mjs';

const p = buildPayload({ title: 'x'.repeat(200), body: 'a\n\n b', url: 'https://evil.com', event: 'reply' });
assert.equal(p.title.length, 70); assert.equal(p.body, 'a b'); assert.equal(p.url, '/'); assert.equal(buildPayload({ url: '//evil' }).url, '/');
assert.equal(buildPayload({ url: '/leads?id=1' }).url, '/leads?id=1');

const rows = [{ id: '1', endpoint: 'e1', p256dh: 'p', auth: 'a' }, { id: '2', endpoint: 'gone', p256dh: 'p', auth: 'a' }, { id: '3', endpoint: 'bad', p256dh: 'p', auth: 'a' }];
const deleted = [], updated = [];
const db = { from: () => ({
  select: () => ({ eq: async () => ({ data: rows, error: null }) }),
  update: () => ({ eq: async (_c, id) => { updated.push(id); return {}; } }),
  delete: () => ({ eq: async (_c, id) => { deleted.push(id); return {}; } }),
}) };
const calls = [];
const lib = { sendNotification: async (sub, body) => { calls.push({ sub, body }); if (sub.endpoint === 'gone') throw Object.assign(new Error('Gone'), { statusCode: 410 }); if (sub.endpoint === 'bad') throw Object.assign(new Error('boom'), { statusCode: 500 }); } };
const r = await sendPush({ title: 'New lead', body: 'Landing page', url: '/leads' }, { lib, db });
assert.deepEqual([r.sent, r.pruned, r.failed], [1, 1, 1]);
assert.deepEqual(deleted, ['2']); assert.deepEqual(updated, ['1']);
assert.equal(JSON.parse(calls[0].body).title, 'New lead'); assert.equal(calls[0].sub.keys.auth, 'a');
assert.ok(isGone({ statusCode: 404 }) && !isGone({ statusCode: 500 }));
console.log('push tests ok');
