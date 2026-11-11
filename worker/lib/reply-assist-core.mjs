// Pure logic for the reply assistant: classify a reply, propose a next step, build the prompt, check the answer.
// Nothing here sends anything. A drafted answer is saved as an outreach row with status 'draft'.

import { cleanReplyBody } from './replies-core.mjs';
import { sanitizeBody } from './draft-core.mjs';

export const ASSIST_CATEGORIES = ['interested', 'asks_price', 'asks_portfolio', 'objection', 'not_now', 'unsubscribe', 'out_of_office', 'other'];
export const NO_DRAFT = new Set(['unsubscribe', 'out_of_office']);

const RULES = [
  ['out_of_office', /out of (the )?office|automatic reply|auto-?reply|autoreply|on (vacation|holiday|leave)|away from (my )?(desk|email)|i am currently away|will (be back|return) on/i],
  ['unsubscribe', /\b(unsubscribe|remove me|stop (emailing|contacting|sending|messaging)|do not (contact|email)|don'?t (contact|email|message) me|take me off|leave me alone|not interested|no thanks|no thank you|please stop|opt me out)\b/i],
  ['asks_price', /\b(how much|price|pricing|prices|cost|costs|rate|rates|quote|estimate|budget|fee|fees|what do you charge)\b/i],
  ['asks_portfolio', /\b(portfolio|examples?|samples?|previous work|past work|case stud(y|ies)|work you'?ve done|show me (some|your)|do you have any (work|websites|apps))\b/i],
  ['objection', /\b(too expensive|too much|already (have|found|hired|working with)|happy with (my|our|the)|in-?house|not sure (we|i) need|don'?t need|no budget|can'?t afford|why should|how are you different|we use)\b/i],
  ['not_now', /\b(later|next (week|month|quarter|year)|not right now|not at the moment|bad timing|busy (right )?now|revisit|check back|circle back|get back to you|in a few (weeks|months)|after the (holidays|summer))\b/i],
  ['interested', /\b(interested|sounds (good|great)|let'?s (talk|chat|do it|schedule|connect|go)|call me|can we (talk|chat|schedule|meet|connect)|yes,? (please|i|we)|tell me more|when (are you|can you)|available (this|next|tomorrow)|love to)\b/i],
];

const SNIPPETS = {
  not_now: { days: 30, title: (n) => `Follow up with ${n}: they asked to talk later` },
  interested: { days: 1, title: (n) => `Reply to ${n}: they are interested` },
  asks_price: { days: 2, title: (n) => `Send a quote to ${n}` },
  asks_portfolio: { days: 2, title: (n) => `Send examples to ${n}` },
  objection: { days: 3, title: (n) => `Follow up with ${n} about their concern` },
  other: { days: 2, title: (n) => `Reply to ${n}` },
};

export function classifyAssistRules(text, subject = '') {
  const body = cleanReplyBody(text);
  const all = `${subject}\n${body}`;
  let category = 'other';
  for (const [cat, re] of RULES) if (re.test(all)) { category = cat; break; }
  const first = body.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 3) || '';
  return { category, summary: first.slice(0, 140) };
}

const ACTION = {
  book_call: { id: 'book_call', label: 'Suggest a short call' },
  send_price: { id: 'send_price', label: 'Answer the price question' },
  send_portfolio: { id: 'send_portfolio', label: 'Send examples of your work' },
  answer: { id: 'answer', label: 'Answer their message' },
  create_task: { id: 'create_task', label: 'Create a task' },
  mark_won: { id: 'mark_won', label: 'Mark won' },
  mark_lost: { id: 'mark_lost', label: 'Mark lost' },
  add_suppression: { id: 'add_suppression', label: 'Add to do-not-contact' },
  mark_handled: { id: 'mark_handled', label: 'Mark as handled' },
};

// What to do next, as buttons the user can press. Order = priority. Never auto-run.
export function proposeNextStep(category, { name = 'them' } = {}) {
  const task = SNIPPETS[category] ? { title: SNIPPETS[category].title(name), due_in_days: SNIPPETS[category].days } : null;
  const pick = (primary, why, extra = []) => ({
    next_step: { id: primary, label: ACTION[primary].label, reason: why },
    actions: [primary, ...extra].map((id, i) => ({ ...ACTION[id], primary: i === 0 })),
    task,
  });
  switch (category) {
    case 'unsubscribe':
      return { ...pick('add_suppression', 'They asked you to stop. Do not send a pitch. Add them to do-not-contact so nothing goes out again.', ['mark_lost', 'mark_handled']), task: null };
    case 'out_of_office':
      return { ...pick('mark_handled', 'This is an automatic reply. Wait for them to come back.'), task: null };
    case 'interested':
      return pick('book_call', 'They sound interested. Offer a short call and ask when suits them.', ['create_task', 'mark_won']);
    case 'asks_price':
      return pick('send_price', 'They asked about price. Answer or ask what the scope is, then follow up.', ['create_task', 'mark_won']);
    case 'asks_portfolio':
      return pick('send_portfolio', 'They want to see your work. Send relevant examples.', ['create_task']);
    case 'objection':
      return pick('answer', 'They raised a concern. A short, calm answer with no pressure is best.', ['create_task', 'mark_lost']);
    case 'not_now':
      return pick('create_task', 'Bad timing. Set a reminder to check back, and thank them.', ['mark_lost']);
    default:
      return pick('answer', 'Read their message and answer it.', ['create_task', 'mark_handled']);
  }
}

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (a) => (Array.isArray(a) && a.length ? a.join('; ') : '');

export const ASSIST_SYSTEM = [
  'You help a freelancer who builds websites, apps and designs answer a reply to their cold email.',
  'You output only valid JSON, nothing before or after it.',
  'Write like a thoughtful person: plain words, no hype, no exclamation marks, no emojis, no em dashes.',
].join(' ');

export function buildAssistPrompt({ reply, lead, profile = {}, summary = {}, rules = '', original, allowedLinks = [], instruction }) {
  const sender = [
    `Name: ${profile.your_name || '(not set)'}`,
    profile.business_name || summary.business_name ? `Business: ${profile.business_name || summary.business_name}` : '',
    list(profile.services) || list(summary.services) ? `Services: ${list(profile.services) || list(summary.services)}` : '',
    list(summary.portfolio_highlights) ? `Real work you may mention: ${list(summary.portfolio_highlights)}` : '',
    summary.voice ? `Voice: ${summary.voice}` : '',
    profile.notes ? `Notes from the sender (may include pricing guidance): ${clip(profile.notes, 500)}` : '',
    profile.signature ? `Sign-off (use exactly): ${profile.signature}` : profile.your_name ? `Sign off with the name: ${profile.your_name}` : 'No name is known: end without a signature.',
    allowedLinks.length ? `Links you may use (only these): ${allowedLinks.join(', ')}` : 'Do not include any links.',
  ].filter(Boolean).join('\n');

  return [
    'Classify this reply and write the answer the freelancer could send.',
    '',
    '# Sender', sender,
    '',
    '# The lead', [`Title: ${clip(lead?.title, 200)}`, lead?.company_name ? `Company: ${lead.company_name}` : '', lead?.owner_name ? `Contact: ${lead.owner_name}` : '', `What is known: ${clip(lead?.description, 600)}`].filter(Boolean).join('\n'),
    '',
    '# Our email they replied to', original ? `Subject: ${clip(original.subject, 120)}\n${clip(original.body, 900)}` : '(not available)',
    '',
    '# Their reply', `Subject: ${clip(reply.subject, 120)}\n${cleanReplyBody(reply.body).slice(0, 1800)}`,
    '',
    '# Writing rules (follow strictly)', rules || '(none)',
    '',
    '# Hard requirements',
    `classification must be one of: ${ASSIST_CATEGORIES.join(', ')}.`,
    'If they ask to stop, unsubscribe, or say they are not interested, classification is "unsubscribe" and reply_body must be an empty string. Never pitch to someone who said no.',
    'If it is an automatic out-of-office message, classification is "out_of_office" and reply_body must be an empty string.',
    'Otherwise reply_body is a short answer, under 110 words. Answer exactly what they asked. Make one easy next step (for example a 15 minute call).',
    'Never invent prices, clients, results, dates or availability. If they ask the price and the sender notes contain no pricing guidance, ask one or two scoping questions and say you will send a quote after.',
    'No placeholders in brackets, no "Subject:" line inside the body, no markdown, no mention of being an AI.',
    instruction ? `Instruction from the sender (obey it): ${clip(instruction, 500)}` : '',
    '',
    'Return JSON exactly like: {"classification": "...", "summary": "one sentence, max 20 words", "next_step_reason": "one short sentence", "reply_body": "..."}',
  ].filter((l) => l !== '').join('\n');
}

export function parseAssistJson(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('AI reply was not an object');
  const category = ASSIST_CATEGORIES.includes(obj.classification) ? obj.classification : null;
  if (!category) throw new Error('AI gave an unknown classification');
  const body = NO_DRAFT.has(category) ? '' : sanitizeBody(obj.reply_body);
  if (!NO_DRAFT.has(category) && !body) throw new Error('AI reply has no body');
  return { category, summary: clip(obj.summary, 200), reason: clip(obj.next_step_reason, 200), body };
}

const first = (n) => {
  const w = String(n || '').trim().split(/\s+/)[0];
  return /^[A-Za-z][A-Za-z'-]{1,}$/.test(w) ? w : '';
};

// Used when the AI is not available. Short and careful: it never states prices or availability.
export function templateReply({ category, reply, profile = {} }) {
  if (NO_DRAFT.has(category)) return '';
  const hi = first(reply.from_name) ? `Hi ${first(reply.from_name)},` : 'Hello,';
  const sign = String(profile.signature || '').trim() || profile.your_name || '';
  const tail = sign ? `\n\n${sign}` : '';
  const lines = {
    interested: 'Thanks for getting back to me. Would a short 15 minute call work? Tell me a day and time that suits you and I will fit in.',
    asks_price: 'Thanks for asking. The price depends on what you need, so it would help to know the pages or features you have in mind and your timeline. Send me a few details and I will come back with a clear quote.',
    asks_portfolio: 'Happy to share some examples. Tell me which kind of project is closest to yours and I will send the most relevant ones.',
    objection: 'Thanks for being straight with me, that is useful to hear. If it helps, I can answer any questions without any commitment. If now is not the right time, that is fine.',
    not_now: 'No problem at all, thanks for letting me know. I will check back later. If anything changes before then, just reply here.',
    other: 'Thanks for your reply. Let me know what would be most useful and I will help.',
  };
  return `${hi}\n\n${lines[category] || lines.other}${tail}`;
}

export function replySubject(subject) {
  const s = String(subject || '').trim();
  if (!s) return 'Re: your message';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

// The next free step for an answer. Steps 1 to 3 are the sequence, answers use 10 and up (UNIQUE(lead_id, step)).
export function nextReplyStep(existingRows) {
  const used = new Set((existingRows || []).map((r) => Number(r.step)));
  let s = 10;
  while (used.has(s)) s++;
  return s;
}
