const SEVERE = [
  [/\b(stolen|hacked|cracked|combo ?lists?|brute ?forced?|account dumps?|nfa dumps?|leaked accounts?|free accounts? (?:dump|list)|bulk (?:hacked|cracked))\b/i, 'Possible stolen or hacked accounts'],
  [/\b(carded|carding|stolen cards?|cc dumps?|cvv)\b/i, 'Possible stolen payment data'],
];
const MEDIUM = [
  [/\b(pay first|payment first|send first|upfront payment|no mm|no middle ?man|no escrow)\b/i, 'Asks you to pay first or refuses a middleman'],
  [/\b(?:only|just) (?:accept(?:s|ing)? )?(?:crypto|btc|bitcoin|gift ?cards?|usdt)\b|\b(?:crypto|btc|gift ?cards?) only\b/i, 'Only accepts untraceable payment'],
  [/\bno refunds?\b/i, 'No refunds offered'],
];
const MINOR = [
  [/\b(telegram|whatsapp|signal|snap(?:chat)?)\b/i, 'Asks to continue on Telegram/WhatsApp or similar'],
  [/(\burgent\b|\basap\b|limited (?:time|slots)|today only)[\s\S]*!!|!!![\s\S]*(\burgent\b|\basap\b)/i, 'Pressure / urgency wording'],
];
const FLOOR = { account: 5, boosting: 3, 'top-up': 1, currency: 1, items: 1, keys: 1 };

// Pure trust score for a trade post. Returns {trust_score, trust_level, is_suspicious, flags}.
export function scoreTrade({ title = '', body = '', side, item_type, price }) {
  const text = `${title}\n${body}`;
  const flags = [];
  let severe = 0, medium = 0, minor = 0;
  const add = (kind, label) => {
    if (flags.includes(label)) return;
    flags.push(label);
    if (kind === 'severe') severe++; else if (kind === 'medium') medium++; else minor++;
  };
  for (const [re, label] of SEVERE) if (re.test(text)) add('severe', label);
  for (const [re, label] of MEDIUM) if (re.test(text)) add('medium', label);
  for (const [re, label] of MINOR) if (re.test(text)) add('minor', label);

  const amount = price && price.amount != null ? price.amount : null;
  if (side === 'seller' && amount != null && !price.hourly && FLOOR[item_type] != null && amount < FLOOR[item_type]) add('medium', 'Price looks too good to be true');
  if (text.trim().length < 60) add('minor', 'Very little detail in the post');

  let score = 50;
  if (price) score += 10;
  if (/(?<!no )(?<!no-)\b(middle ?man|mm ok|mm is ok|escrow|vouch(?:es|ed)?|trusted)\b/i.test(text)) score += 8;
  if (item_type === 'account' && /\b(full access|original email|oge|email access|nfa)\b/i.test(text)) score += 6;
  if (/\b(proof|screenshots?|imgur|video)\b/i.test(text)) score += 4;
  if (body.trim().length >= 200) score += 6;
  score -= Math.min(severe, 2) * 35 + medium * 14 + minor * 6;
  score = Math.max(5, Math.min(98, Math.round(score)));
  return {
    trust_score: score,
    trust_level: score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low',
    is_suspicious: severe > 0 || medium >= 2 || score < 35,
    flags,
  };
}
