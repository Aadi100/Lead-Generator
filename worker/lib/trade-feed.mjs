import * as cheerio from 'cheerio';
import { createScorer } from './scoring.mjs';
import { buildGameIndex } from './trade-games.mjs';
import { parseTradePost } from './trade-parse.mjs';
import { scoreTrade } from './trade-score.mjs';
import { matchTrade } from './trade-match.mjs';

let scorer;
const getScorer = () => (scorer ||= createScorer({}));
const arr = (v) => (Array.isArray(v) ? v : []);

export function gameIndexFor(trading = {}) {
  return buildGameIndex([...arr(trading.games), ...arr(trading.i_sell).map((e) => e.game), ...arr(trading.i_want).map((e) => e.game)]);
}

export function parseRedditAtom(xml) {
  const $ = cheerio.load(String(xml || ''), { xml: true });
  const out = [];
  $('entry').each((_, el) => {
    const e = $(el);
    const content = e.children('content').text();
    const md = /<div class="md">([\s\S]*?)<\/div>\s*(?:<!--|$)/.exec(content);
    const link = e.children('link').attr('href') || '';
    const sub = e.children('category').attr('term') || (/\/r\/([^/]+)\//.exec(link) || [])[1] || '';
    out.push({
      title: e.children('title').text().trim(),
      link,
      sub,
      author: e.find('author > name').first().text().replace(/^\/?u\//, '').trim(),
      body: md ? getScorer().stripHtml(md[1]) : '',
      posted: e.children('published').text() || e.children('updated').text() || null,
    });
  });
  return out;
}

// Turns one public post into a lead row (or null when it is not a real trade post).
export function buildTradeLead(post, { trading = {}, gameIndex, stock } = {}) {
  const index = gameIndex || gameIndexFor(trading);
  const parsed = parseTradePost({ title: post.title, body: post.body, subreddit: post.subreddit }, index);
  if (!parsed.keep) return null;
  const sc = scoreTrade({ title: post.title, body: post.body, side: parsed.side, item_type: parsed.item_type, price: parsed.price });
  const lead = {
    title: String(post.title).slice(0, 300),
    description: (post.body || post.title).slice(0, 4000),
    url: post.url,
    budget: parsed.price ? parsed.price.text : 'TBD',
    budget_amount: parsed.price ? parsed.price.amount : null,
    source: post.source,
    source_detail: post.sourceDetail || null,
    type: 'Outbound',
    status: 'New',
    lead_kind: 'trade',
    category: 'Gaming',
    categories: ['Gaming'],
    tags: [...new Set([parsed.game.toLowerCase(), parsed.item_type, ...parsed.keywords])].slice(0, 8),
    author: post.author || null,
    author_info: null,
    contact: post.contact || null,
    posted_at: post.postedAt || null,
    trust_score: sc.trust_score,
    trust_level: sc.trust_level,
    is_suspicious: sc.is_suspicious,
    flags: sc.flags,
    trade_side: parsed.side,
    game: parsed.game,
    item_type: parsed.item_type,
    enrich_status: 'skipped',
  };
  const match = matchTrade(lead, trading, index, stock);
  lead.trade_match = match ? match.label : null;
  lead.alerted_at = match ? null : new Date().toISOString();
  return lead;
}

const CORE_TYPES = ['account', 'boosting', 'top-up', 'currency'];
// Accounts, boosting, top-ups and currency are always kept. Other kinds of posts are kept only when they match something the user listed.
export const worthSaving = (lead) => !!lead && (!!lead.trade_match || CORE_TYPES.includes(lead.item_type));

export function redditPostToLead(entry, ctx) {
  return buildTradeLead({
    title: entry.title, body: entry.body, url: entry.link, source: 'Reddit', sourceDetail: entry.sub ? `r/${entry.sub}` : null,
    author: entry.author ? `u/${entry.author}` : null, contact: entry.author ? `reddit: u/${entry.author}` : null, postedAt: entry.posted,
    subreddit: entry.sub,
  }, ctx);
}

export function discordMessageToLead(msg, { guildId, channelId, label }, ctx) {
  if (!msg || msg.author?.bot || !String(msg.content || '').trim()) return null;
  const content = String(msg.content).replace(/<@!?\d+>/g, '').trim();
  if (content.length < 8) return null;
  const firstLine = content.split('\n').find((l) => l.trim()) || content;
  const user = msg.author?.username || 'unknown';
  return buildTradeLead({
    title: firstLine.slice(0, 140), body: content, url: `https://discord.com/channels/${guildId || '@me'}/${channelId}/${msg.id}`,
    source: 'Discord', sourceDetail: `Discord: ${label || channelId}`,
    author: msg.author?.global_name || user, contact: `discord: ${user} (${msg.author?.id})`, postedAt: msg.timestamp || null,
  }, ctx);
}

export const snowflakeGt = (a, b) => {
  try { return BigInt(a) > BigInt(b); } catch { return false; }
};
