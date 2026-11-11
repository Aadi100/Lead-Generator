import crypto from 'node:crypto';
import { createScorer } from './scoring.mjs';
import { parseTradePost } from './trade-parse.mjs';
import { scoreTrade } from './trade-score.mjs';
import { matchTrade } from './trade-match.mjs';
import { gameIndexFor } from './trade-feed.mjs';

export const MAX_ITEMS = 80;
const MAX_TEXT = 1500;
const CAPTURE_FLAG = 'Captured by hand: not checked automatically';

const MARKETPLACES = [
  ['eldorado.gg', 'Eldorado'], ['g2g.com', 'G2G'], ['z2u.com', 'Z2U'], ['funpay.com', 'FunPay'], ['playerauctions.com', 'PlayerAuctions'],
  ['gameboost.com', 'GameBoost'], ['u7buy.com', 'U7Buy'], ['itemku.com', 'Itemku'], ['playerup.com', 'PlayerUp'], ['elitepvpers.com', 'ElitePvPers'],
];
// Freelance sites: leads captured here are work requests (not game trades), named after the site.
const FREELANCE_SITES = [['fiverr.com', 'Fiverr'], ['upwork.com', 'Upwork']];
const CHATS = [['discord.com', 'Discord'], ['discordapp.com', 'Discord'], ['web.telegram.org', 'Telegram'], ['telegram.org', 'Telegram'], ['t.me', 'Telegram']];
const WANT_RE = /\b(wtb|want to buy|looking for|lf|wanted|buying|in need of)\b/i;
const RATING_RE = /(\d(?:\.\d+)?)\s*(?:\/\s*5|★|stars?)?\s*[,|·-]\s*(\d[\d,.]*\s?k?)\s*(sales|orders|reviews?|feedbacks?|sold)/i;

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const hostOf = (v) => String(v || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
const brandFor = (host, list) => (list.find(([d]) => host === d || host.endsWith('.' + d)) || [])[1] || null;
const isHttp = (u) => /^https?:\/\/\S{4,480}$/i.test(String(u || '').trim());

export function stableUrl(text) {
  const norm = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `manual-${crypto.createHash('sha1').update(norm).digest('hex').slice(0, 16)}`;
}

// Works out where the item came from and what to call it. Pure.
export function describeItem(item, { sourceLabel } = {}) {
  const text = String(item?.text || '').trim().slice(0, MAX_TEXT);
  const host = hostOf(item?.site) || (isHttp(item?.url) ? hostOf(item.url) : '');
  const marketBrand = brandFor(host, MARKETPLACES);
  const chatBrand = marketBrand ? null : brandFor(host, CHATS);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = clip(item?.title || lines[0] || '', 140);
  const author = clip(item?.author || (marketBrand && (/seller\s*[:\-]\s*([^|(\n,]{2,40})/i.exec(text) || [])[1]) || '', 80) || null;
  const rating = marketBrand ? RATING_RE.exec(text) : null;
  const authorInfo = rating ? `${rating[1]} rating · ${rating[2].trim()} ${rating[3].toLowerCase()}` : null;
  const body = [text, item?.page_title && `Page: ${clip(item.page_title, 200)}`, item?.price_text && `Price: ${clip(item.price_text, 60)}`].filter(Boolean).join('\n');
  const freelanceBrand = marketBrand || chatBrand ? null : brandFor(host, FREELANCE_SITES);
  const source = marketBrand || chatBrand || freelanceBrand || clip(sourceLabel, 60) || host || 'Manual';
  const channel = clip(item?.channel_label, 80);
  const sourceDetail = marketBrand || freelanceBrand ? 'Captured from page' : channel || 'Captured by hand';
  const contact = author && chatBrand ? `${chatBrand.toLowerCase()}: ${author}` : author && marketBrand ? `${marketBrand.toLowerCase()}: ${author}` : null;
  const url = isHttp(item?.url) ? String(item.url).trim() : stableUrl(text);
  return { text, title, body, author, authorInfo, source, sourceDetail, contact, url, marketplace: !!marketBrand, chat: chatBrand };
}

function tradeLead(d, ctx) {
  const parsed = parseTradePost({ title: d.title, body: d.body }, ctx.gameIndex);
  if (!parsed.game) return { found: false, reason: 'I could not tell which game this is about. Put the game name in the text.' };
  let side = parsed.side;
  if (!side && parsed.swap) return { found: true, reason: 'This looks like items for items. I could not tell who is buying and who is selling.' };
  if (!side && d.marketplace) side = WANT_RE.test(`${d.title} ${d.text}`) ? 'buyer' : 'seller';
  if (!side) return { found: true, reason: 'I could not tell if this person is buying or selling. Add "WTB" or "WTS" to the text.' };
  if (parsed.item_type === 'other' && !d.marketplace && !parsed.explicit) return { found: true, reason: 'I could not tell if this is an account, boosting, top-up or items.' };

  const sc = scoreTrade({ title: d.title, body: d.body, side, item_type: parsed.item_type, price: parsed.price });
  const lead = {
    title: d.title,
    description: (d.text || d.title).slice(0, 4000),
    url: d.url,
    budget: parsed.price ? parsed.price.text : 'TBD',
    budget_amount: parsed.price ? parsed.price.amount : null,
    source: d.source,
    source_detail: d.sourceDetail,
    type: 'Outbound',
    status: 'New',
    lead_kind: 'trade',
    category: 'Gaming',
    categories: ['Gaming'],
    tags: [...new Set([parsed.game.toLowerCase(), parsed.item_type, ...parsed.keywords])].slice(0, 8),
    author: d.author,
    author_info: d.authorInfo,
    contact: d.contact,
    posted_at: ctx.nowIso,
    trust_score: sc.trust_score,
    trust_level: sc.trust_level,
    is_suspicious: sc.is_suspicious,
    flags: [...sc.flags, CAPTURE_FLAG],
    trade_side: side,
    game: parsed.game,
    item_type: parsed.item_type,
    enrich_status: 'skipped',
    alerted_at: ctx.nowIso,
  };
  const match = matchTrade(lead, ctx.trading, ctx.gameIndex, ctx.stock);
  lead.trade_match = match ? match.label : null;
  return { found: true, lead, meta: { kind: 'trade', game: lead.game, item_type: lead.item_type, side, trade_match: lead.trade_match, trust: lead.trust_score } };
}

function requestLead(d, ctx, forced) {
  const S = ctx.scorer;
  if (!forced) {
    if (S.isSeller(d.title, d.body)) return { reason: 'This looks like someone advertising their own services, not someone asking for work.' };
    if (!S.hasBuyerIntent(d.title, d.body)) return { reason: 'This does not read like someone asking for a website, app, design or automation.' };
  }
  const cls = S.classify(d.title, d.body);
  if (!cls.category && !forced) return { reason: 'This is not about websites, apps, design or automation, and none of your Targeting keywords match.' };
  const lead = S.buildLead({
    title: d.title, body: d.body, url: d.url, source: d.source, sourceDetail: d.sourceDetail, author: d.author, authorInfo: d.authorInfo,
    contacts: d.contact ? [d.contact] : [], postedAt: ctx.nowIso, ctx: {},
  });
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v || []);
  lead.flags = [...parse(lead.flags), CAPTURE_FLAG];
  lead.categories = parse(lead.categories);
  lead.tags = parse(lead.tags);
  if (!lead.category) { lead.category = 'Other'; lead.categories = ['Other']; }
  lead.lead_kind = 'request';
  lead.alerted_at = ctx.nowIso;
  return { lead, meta: { kind: 'request', trust: lead.trust_score } };
}

// Pure: one captured item -> {lead, meta} or {skip: reason}.
export function processItem(item, ctx) {
  const d = describeItem(item, ctx);
  if (d.text.length < 8) return { skip: 'The text is too short to read.' };
  if (ctx.forceKind === 'request') return requestLead(d, ctx, true);
  const trade = tradeLead(d, ctx);
  if (trade.lead) return trade;
  if (ctx.forceKind === 'trade') return { skip: trade.reason };
  const req = requestLead(d, ctx, false);
  if (req.lead) return req;
  return { skip: trade.found ? trade.reason : 'I could not find a game trade or a work request in this text.' };
}

// deps: { existingUrls(urls) -> Set, insert(rows) -> count }. No network, no logging of item text.
export async function runQuickAdd(payload, { trading = {}, targeting = {}, stock, existingUrls, insert, now = () => new Date() }) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) throw new Error('Nothing to add. Paste some text first.');
  if (items.length > MAX_ITEMS) throw new Error(`Send at most ${MAX_ITEMS} items at a time.`);
  const forceKind = payload?.force_kind === 'trade' ? 'trade' : payload?.force_kind === 'request' || payload?.force_kind === 'service' ? 'request' : null;
  const ctx = { trading, stock, gameIndex: gameIndexFor(trading), scorer: createScorer(targeting), sourceLabel: payload?.source_label, forceKind, nowIso: now().toISOString() };

  const out = new Array(items.length);
  const candidates = [];
  const seen = new Set();
  items.forEach((raw, index) => {
    try {
      const r = processItem(raw || {}, ctx);
      if (r.skip) { out[index] = { index, outcome: 'skipped', reason: r.skip }; return; }
      const info = { title: clip(r.lead.title, 100), ...r.meta };
      if (seen.has(r.lead.url)) { out[index] = { index, outcome: 'duplicate', reason: 'The same item appears twice in this batch.', ...info }; return; }
      seen.add(r.lead.url);
      candidates.push({ index, lead: r.lead, info });
    } catch {
      out[index] = { index, outcome: 'skipped', reason: 'I could not read this item.' };
    }
  });

  const existing = candidates.length ? await existingUrls(candidates.map((c) => c.lead.url)) : new Set();
  const fresh = [];
  for (const c of candidates) {
    if (existing.has(c.lead.url)) out[c.index] = { index: c.index, outcome: 'duplicate', reason: 'You already have this lead.', ...c.info };
    else { out[c.index] = { index: c.index, outcome: 'inserted', ...c.info }; fresh.push(c); }
  }
  const inserted = fresh.length ? await insert(fresh.map((c) => c.lead)) : 0;
  const lost = fresh.length - inserted;
  const dupes = out.filter((o) => o.outcome === 'duplicate').length + Math.max(0, lost);
  return { ok: true, inserted, duplicates: dupes, skipped: out.filter((o) => o.outcome === 'skipped').length, items: out };
}
