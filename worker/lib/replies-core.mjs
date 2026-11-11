export const REPLY_CATEGORIES = ['interested', 'question', 'not_interested', 'out_of_office', 'bounce', 'other'];

export const normId = (s) => String(s || '').trim().replace(/^<|>$/g, '').toLowerCase();

export function refIds(parsed) {
  const out = new Set();
  const add = (v) => String(v || '').split(/\s+/).map(normId).filter(Boolean).forEach((x) => out.add(x));
  add(parsed.inReplyTo);
  const refs = parsed.references;
  if (Array.isArray(refs)) refs.forEach(add);
  else add(refs);
  return out;
}

export function fromAddress(parsed) {
  const v = parsed?.from?.value?.[0];
  return { email: String(v?.address || '').trim().toLowerCase(), name: v?.name || '' };
}

export const isOwnMessage = (email, own) => !!email && own.map((e) => String(e || '').toLowerCase()).includes(email);

export function isBounce(parsed) {
  const { email } = fromAddress(parsed);
  const subject = String(parsed.subject || '');
  const ct = parsed.headers?.get?.('content-type');
  return /^(mailer-daemon|postmaster)@/i.test(email)
    || /undeliver|delivery status notification|delivery (has )?failed|mail delivery failed|returned mail|failure notice|delivery failure|could not be delivered/i.test(subject)
    || ct?.value === 'multipart/report';
}

export function bouncedRecipient(parsed, knownEmails = []) {
  let text = String(parsed.text || '');
  for (const a of parsed.attachments || []) {
    if (/delivery-status|rfc822/i.test(a.contentType || '')) text += '\n' + a.content?.toString?.('utf8');
  }
  const m = /(?:Final|Original)-Recipient:\s*(?:rfc822;)?\s*<?([^\s<>;]+@[^\s<>;]+)/i.exec(text);
  if (m) return m[1].toLowerCase();
  const emails = (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) || []).map((e) => e.toLowerCase());
  const known = new Set(knownEmails.map((e) => String(e || '').toLowerCase()));
  return emails.find((e) => known.has(e)) || emails.find((e) => !/^(mailer-daemon|postmaster)@/.test(e)) || null;
}

export function matchReply({ parsed, rows }) {
  const ids = refIds(parsed);
  if (ids.size) {
    const hit = rows.find((r) => r.message_id && ids.has(normId(r.message_id)));
    if (hit) return { row: hit, how: 'message_id' };
  }
  const from = fromAddress(parsed).email;
  if (!from) return null;
  const when = parsed.date ? new Date(parsed.date).getTime() : Date.now();
  const candidates = rows
    .filter((r) => r.sent_at && String(r.to_email || '').toLowerCase() === from && when >= new Date(r.sent_at).getTime() - 5 * 60000)
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  return candidates.length ? { row: candidates[0], how: 'from_address' } : null;
}

export function cleanReplyBody(text) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.split('\n').filter((l) => !l.trim().startsWith('>')).join('\n');
  t = t.split(/^On .{5,200} wrote:\s*$/m)[0];
  t = t.split(/^-{2,}\s*Original Message\s*-{2,}/im)[0];
  t = t.split(/^From:\s.+$/m)[0];
  return t.replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}

const RULES = [
  ['out_of_office', /out of (the )?office|automatic reply|auto-?reply|autoreply|on (vacation|holiday|leave)|away from (my )?(desk|email)|i am currently away|will (be back|return) on/i],
  ['not_interested', /\b(unsubscribe|remove me|stop (emailing|contacting|sending)|do not (contact|email)|don't (contact|email) me|not interested|no thanks|no thank you|not looking|take me off|already (have|found|hired|working with))\b/i],
  ['interested', /\b(interested|sounds good|sounds great|let'?s (talk|chat|do it|schedule|connect)|call me|can we (talk|chat|schedule|meet|connect)|yes,? (please|i|we)|send (me )?(a )?(quote|proposal|details|examples|portfolio|samples)|how much|what('s| is| are) your (rate|price|cost|rates|pricing)|tell me more|when (are you|can you)|available (this|next|tomorrow))\b/i],
];

export function classifyReplyRules(text, subject = '', headers) {
  const auto = String(headers?.get?.('auto-submitted') || '');
  if (auto && auto.toLowerCase() !== 'no') return { category: 'out_of_office', summary: 'Automatic reply' };
  const body = cleanReplyBody(text);
  const all = `${subject}\n${body}`;
  let category = 'other';
  for (const [cat, re] of RULES) if (re.test(all)) { category = cat; break; }
  if (category === 'other' && body.includes('?')) category = 'question';
  const first = body.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 3) || '';
  return { category, summary: first.slice(0, 140) };
}

export function buildClassifyPrompt(subject, body) {
  return [
    'A freelancer sent a cold email and got this reply. Classify the reply.',
    'Categories: interested (wants to talk, asks price or details), question (asks something without clear interest), not_interested (declines or asks to stop), out_of_office (automatic reply), other.',
    `Subject: ${subject}`,
    `Reply:\n${cleanReplyBody(body).slice(0, 1500)}`,
    'Return ONLY JSON: {"category": "...", "summary": "one sentence, max 20 words"}',
  ].join('\n\n');
}
