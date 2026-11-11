import { createScorer } from './scoring.mjs';
import { buildGameIndex, findGame, gameForSubreddit } from './trade-games.mjs';

let scorer;
const getScorer = () => (scorer ||= createScorer({}));

const PAY_RE = /(paypal|\bpp\b|\busd\b|cash ?app|venmo|zelle|\bbtc\b|bitcoin|\bltc\b|\beth\b|crypto|usdt|\bmoney\b|\bcash\b|[$€£]\s?\d|\d\s?[$€£]|\bwise\b|skrill|revolut|binance)/i;
const BUYER_FIRST = /\b(anyone selling|does anyone (?:sell|have)|who(?:'s| is)? selling|where (?:can|do) i buy|who sells)\b/i;
const SELLER_RE = /\[\s*store\s*\]|\b(wts|selling|for sale|sell(?:ing)? my|\[sell\]|i(?:'m| am) selling|available for sale|up for sale|boosting service|boost service|i will boost|offering (?:a )?boost|professional boosters?|cheap boost|carry service|we (?:offer|sell|boost)|top ?-?up service|fast delivery)\b/i;
const BUYER_RE = /\b(wtb|buying|\[buy\]|looking (?:for|to buy)|lf|wanted|want to buy|need (?:a|an|some|to buy)|in need of|i want to buy|paying|need boost(?:er)?|want (?:a )?boost)\b/i;
const TAG_RE = /(\[\s*(?:h|w|wts|wtb|store|sell(?:ing)?|buy(?:ing)?)\s*\]|\bwts\b|\bwtb\b)/i;

const BOOST_RE = /\b(boost(?:ing|er|ers|ed)?|elo ?boost|rank ?boost|rank(?:ed)? (?:up|push)|placements?|coaching|carry|carries|power ?level(?:ing)?|leveling service)\b/i;
const TOPUP_EXPLICIT = /\b(top ?-?up|topup|recharge)\b/i;
const ACCOUNT_RE = /\b(accounts?|accs?|smurfs?|full access)\b/i;
const CURRENCYISH = /\b(v-?bucks|robux|diamonds|uc|gems|genesis crystals|primogems|oneiric shards|valorant points|riot points|vp|credits|coins|gold|bells|stardust|gil|adena|kinah|gp)\b/i;
const BULK_CURRENCY = /(\b\d+(?:\.\d+)?\s?[kmb]\b[^.\n]{0,25}\b(?:gold|gp|coins)\b|\b(?:gold|gp)\b[^.\n]{0,25}\b\d+(?:\.\d+)?\s?[kmb]\b|\bosrs gold\b|\brs3 gold\b)/i;
const ITEMS_RE = /\b(skins?|playskins?|knife|knives|karambits?|bayonets?|butterfly|m9|flip knife|gut knife|huntsman|falchion|bowie|daggers?|bundles?|inventory|items?|cosmetics?|pets?|gloves?|stickers?|crates?|cases?)\b/i;
const KEYS_RE = /\b(keys?|gift ?cards?|cd ?keys?|codes?|redeem)\b/i;

export function haveWant(title) {
  let m = /\[\s*h\s*\]\s*([^\[]*)\[\s*w\s*\]\s*(.*)$/i.exec(title);
  if (m) return { have: m[1], want: m[2] };
  m = /\[\s*w\s*\]\s*([^\[]*)\[\s*h\s*\]\s*(.*)$/i.exec(title);
  if (m) return { want: m[1], have: m[2] };
  m = /\bh\s*:\s*(.*?)\s+w\s*:\s*(.*)$/i.exec(title);
  if (m) return { have: m[1], want: m[2] };
  return null;
}

export function detectItemType(text, game) {
  if (BOOST_RE.test(text)) return 'boosting';
  if (TOPUP_EXPLICIT.test(text)) return 'top-up';
  if (ACCOUNT_RE.test(text)) return 'account';
  if (CURRENCYISH.test(text)) return game === 'RuneScape' || BULK_CURRENCY.test(text) ? 'currency' : 'top-up';
  if (ITEMS_RE.test(text)) return 'items';
  if (KEYS_RE.test(text)) return 'keys';
  return 'other';
}

function sideFromMarkers(text) {
  if (!text) return null;
  if (BUYER_FIRST.test(text)) return 'buyer';
  const s = text.search(SELLER_RE);
  const b = text.search(BUYER_RE);
  if (s >= 0 && b >= 0) return s < b ? 'seller' : 'buyer';
  if (s >= 0) return 'seller';
  if (b >= 0) return 'buyer';
  return null;
}

export function detectSide(title, body, itemType, price) {
  const hw = haveWant(title);
  if (hw) {
    const havePay = PAY_RE.test(hw.have);
    const wantPay = PAY_RE.test(hw.want);
    if (havePay && !wantPay) return { side: 'buyer', swap: false };
    if (wantPay && !havePay) return { side: 'seller', swap: false };
    return { side: null, swap: true };
  }
  let side = null;
  if (/^\s*\[\s*w\s*\]/i.test(title)) side = 'buyer';
  else if (/^\s*\[\s*h\s*\]/i.test(title)) side = 'seller';
  side = side || sideFromMarkers(title) || sideFromMarkers(String(body || '').slice(0, 400));
  if (!side && /\bboost(?:ing|ers?)\b/i.test(title)) side = 'seller';
  if (!side && price && ['account', 'items', 'top-up', 'currency'].includes(itemType)) side = 'seller';
  return { side, swap: false };
}

// Pure. Returns side/game/item_type/price and keep=false for anything that is not a real trade post.
export function parseTradePost({ title = '', body = '', subreddit = '' }, gameIndex = buildGameIndex()) {
  const t = String(title).replace(/\s+/g, ' ').trim();
  const b = String(body || '').trim();
  const text = `${t}\n${b.slice(0, 1500)}`;
  const game = findGame(t, b.slice(0, 1500), gameIndex) || gameForSubreddit(subreddit);
  const item_type = detectItemType(text, game);
  const price = getScorer().extractBudget(text);
  const { side, swap } = detectSide(t, b, item_type, price);
  const explicit = TAG_RE.test(t) || /\b(wts|wtb)\b/i.test(b.slice(0, 200));
  const keywords = [...new Set([BOOST_RE, ACCOUNT_RE, CURRENCYISH, ITEMS_RE].map((re) => (re.exec(text) || [])[0]).filter(Boolean).map((s) => s.toLowerCase()))];
  const keep = !!(side && game && (item_type !== 'other' || explicit));
  return { side, game, item_type, price, keywords, explicit, swap, keep };
}
