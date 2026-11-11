// Run: node --test worker/lib/reply-assist-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAssistRules, proposeNextStep, parseAssistJson, templateReply, replySubject, nextReplyStep, buildAssistPrompt, NO_DRAFT } from './reply-assist-core.mjs';

const c = (t, s = '') => classifyAssistRules(t, s).category;

test('classification by rules', () => {
  assert.equal(c('Sounds good, can we talk Thursday?'), 'interested');
  assert.equal(c('How much would a 5 page site cost?'), 'asks_price');
  assert.equal(c('Do you have a portfolio or some examples?'), 'asks_portfolio');
  assert.equal(c('We already have an agency and it is too expensive anyway'), 'objection');
  assert.equal(c('Not right now, maybe next quarter.'), 'not_now');
  assert.equal(c('Please remove me from your list.'), 'unsubscribe');
  assert.equal(c('Thanks but not interested.'), 'unsubscribe');
  assert.equal(c('I am out of the office until Monday', 'Automatic reply'), 'out_of_office');
  assert.equal(c('Who are you?'), 'other');
});

test('stop requests never get a draft and propose do-not-contact', () => {
  const n = proposeNextStep('unsubscribe', { name: 'Sam' });
  assert.equal(n.next_step.id, 'add_suppression');
  assert.equal(n.task, null);
  assert.ok(NO_DRAFT.has('unsubscribe'));
  assert.equal(templateReply({ category: 'unsubscribe', reply: {} }), '');
  assert.throws(() => parseAssistJson({ classification: 'asks_price', reply_body: '' }));
  assert.equal(parseAssistJson({ classification: 'unsubscribe', summary: 'wants out', reply_body: 'Sure, here is my pitch again' }).body, '');
});

test('every other category gets a draftable next step and a task', () => {
  for (const cat of ['interested', 'asks_price', 'asks_portfolio', 'objection', 'not_now', 'other']) {
    const n = proposeNextStep(cat, { name: 'Sam' });
    assert.ok(n.next_step.id && n.actions.length >= 1 && n.actions[0].primary);
    assert.ok(n.task && n.task.due_in_days > 0);
  }
  assert.equal(proposeNextStep('not_now').task.due_in_days, 30);
});

test('template replies never invent prices or times', () => {
  for (const cat of ['interested', 'asks_price', 'asks_portfolio', 'objection', 'not_now', 'other']) {
    const t = templateReply({ category: cat, reply: { from_name: 'Sam Baker' }, profile: { signature: 'Alex' } });
    assert.match(t, /^Hi Sam,/);
    assert.doesNotMatch(t, /\$\d|\d+\s?(usd|eur)/i);
    assert.match(t, /Alex$/);
  }
});

test('subject, step and prompt', () => {
  assert.equal(replySubject('About your post'), 'Re: About your post');
  assert.equal(replySubject('Re: About your post'), 'Re: About your post');
  assert.equal(nextReplyStep([{ step: 1 }, { step: 2 }]), 10);
  assert.equal(nextReplyStep([{ step: 1 }, { step: 10 }, { step: 11 }]), 12);
  const p = buildAssistPrompt({ reply: { subject: 'Re: hi', body: 'How much?' }, lead: { title: 'Bakery site' }, profile: { your_name: 'Alex' } });
  assert.match(p, /Never pitch to someone who said no/);
  assert.match(p, /How much\?/);
});
