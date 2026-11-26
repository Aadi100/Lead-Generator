// Run: node --test worker/lib/ai-http.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseResponse, explainError, callApi } from './ai-http.mjs';

test('anthropic request has key header, model, system', () => {
  const r = buildRequest('anthropic', { key: 'k1', system: 'S', prompt: 'P' });
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.headers['x-api-key'], 'k1');
  assert.equal(r.body.system, 'S');
  assert.equal(r.body.messages[0].content, 'P');
  assert.ok(r.body.model);
});
test('gemini request keeps the key out of the url', () => {
  const r = buildRequest('gemini', { key: 'SECRET', model: 'gemini-2.5-pro', system: 'S', prompt: 'P' });
  assert.ok(!r.url.includes('SECRET'));
  assert.equal(r.headers['x-goog-api-key'], 'SECRET');
  assert.ok(r.url.includes('gemini-2.5-pro:generateContent'));
  assert.equal(r.body.systemInstruction.parts[0].text, 'S');
});
test('deepseek request is chat-completions with bearer', () => {
  const r = buildRequest('deepseek', { key: 'd', prompt: 'P' });
  assert.equal(r.headers.authorization, 'Bearer d');
  assert.equal(r.body.messages.length, 1);
  assert.equal(r.body.model, 'deepseek-chat');
});
test('parse each response shape', () => {
  assert.equal(parseResponse('anthropic', { content: [{ type: 'text', text: ' hi ' }] }), 'hi');
  assert.equal(parseResponse('gemini', { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }), 'ab');
  assert.equal(parseResponse('deepseek', { choices: [{ message: { content: 'yo' } }] }), 'yo');
  assert.throws(() => parseResponse('deepseek', { choices: [] }), /empty/);
});
test('errors are plain and never contain the key', async () => {
  assert.match(explainError('gemini', 401, '{"error":{"message":"API key not valid"}}'), /rejected the key/);
  assert.match(explainError('deepseek', 402, ''), /no balance/);
  const fake = async () => ({ ok: false, status: 429, text: async () => '{"error":{"message":"slow down"}}' });
  await assert.rejects(callApi('anthropic', { key: 'TOPSECRET', prompt: 'x' }, { fetchImpl: fake }), (e) => /429/.test(e.message) && !e.message.includes('TOPSECRET'));
  await assert.rejects(callApi('anthropic', { key: '', prompt: 'x' }), /No key saved/);
});
