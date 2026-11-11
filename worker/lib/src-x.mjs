import { tradeGames, toTradeLead } from './src-common.mjs';

export const X_SERVICE_QUERY = '("looking for" OR "need a" OR "hiring") ("web developer" OR "website designer" OR "app developer" OR "logo designer" OR "graphic designer" OR "freelance developer") -is:retweet -is:reply lang:en';

export function xTradeQuery(trading = {}) {
  const games = tradeGames(trading).slice(0, 8);
  const build = (list) => `(wtb OR buying OR "looking to buy" OR wts OR selling) (${list.map((g) => `"${g}"`).join(' OR ')}) (account OR boosting OR "top up") -is:retweet -is:reply lang:en`;
  let list = games;
  while (list.length && build(list).length > 450) list = list.slice(0, -1);
  return list.length ? build(list) : null;
}

export function xSearchUrl(query) {
  const p = new URLSearchParams({
    query, max_results: '50', 'tweet.fields': 'created_at,author_id,public_metrics', expansions: 'author_id',
    'user.fields': 'created_at,public_metrics,verified,username,description',
  });
  return `https://api.twitter.com/2/tweets/search/recent?${p}`;
}

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n));
const age = (d) => (d >= 365 ? Math.floor(d / 365) + 'y ' + Math.floor((d % 365) / 30) + 'm' : d >= 30 ? Math.floor(d / 30) + 'm' : Math.floor(d) + 'd');

export function leadsFromX(res, { scorer, trade, kind = 'service', now = Date.now() }) {
  const out = [];
  const users = {};
  for (const u of res.includes?.users || []) users[u.id] = u;
  for (const t of res.data || []) {
    const u = users[t.author_id] || {};
    const text = t.text || '';
    const title = text.replace(/\s+/g, ' ').slice(0, 140);
    const days = u.created_at ? (now - new Date(u.created_at).getTime()) / 86400000 : null;
    const followers = u.public_metrics ? u.public_metrics.followers_count : null;
    const extra = [];
    let bonus = 0;
    if (days !== null && days < 30) extra.push({ sev: 'medium', label: 'X account is less than 30 days old' });
    if (followers !== null && followers < 10) extra.push({ sev: 'medium', label: 'X account has fewer than 10 followers' });
    if (u.verified) bonus += 6;
    if (followers > 500) bonus += 6;
    if (days > 365) bonus += 4;
    const base = {
      title, body: text, url: `https://x.com/${u.username || 'i'}/status/${t.id}`, source: 'X', sourceDetail: 'x.com',
      author: u.username ? '@' + u.username : null,
      authorInfo: u.username ? `@${u.username} · ${days !== null ? age(days) + ' old' : 'age unknown'}${followers !== null ? ' · ' + fmt(followers) + ' followers' : ''}${u.verified ? ' · verified' : ''}` : null,
      postedAt: t.created_at, ctx: { bonus, extraFlags: extra },
    };
    let lead;
    if (kind === 'trade') {
      if (!trade) continue;
      const parsed = trade.parseTradePost({ title, body: text });
      if (!parsed || !parsed.side || !parsed.game) continue;
      lead = toTradeLead(scorer.buildLead(base), parsed);
    } else {
      if (scorer.isSeller(title, text) || !scorer.hasBuyerIntent(title, text)) continue;
      lead = scorer.buildLead(base);
      if (!lead.category) continue;
    }
    if (u.username) lead.contact = [`X: @${u.username} (reply or DM)`, lead.contact].filter(Boolean).join(' · ');
    out.push(lead);
  }
  return out;
}
