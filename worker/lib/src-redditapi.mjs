import { tradeTargets, toTradeLead } from './src-common.mjs';

export const SERVICE_QUERIES = [
  '"looking for a web developer"', '"need a website"', '"looking for a graphic designer"', '"need a logo"',
  '"looking for an app developer"', '"need a mobile app"', '"hiring a freelance developer"',
  '"need a shopify developer"', '"need a wordpress developer"', '"looking for a ui/ux designer"',
  '"need someone to build"', '"need an automation"',
];

export function tradeRedditQueries(trading = {}, max = 6) {
  return tradeTargets(trading, max).map((t) => `"${t.game}${t.item ? ' ' + t.item : ''}" ${t.side === 'buyer' ? '(WTB OR buying OR LF)' : '(WTS OR selling)'}`);
}

export const userAgent = (cfg) => `LeadRadar/1.0 (by u/${String(cfg.username || 'unknown').replace(/^\/?u\//i, '').trim() || 'unknown'})`;
export const basicAuth = (id, secret) => 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');

export function searchUrl(q) {
  return `https://oauth.reddit.com/search?${new URLSearchParams({ q, sort: 'new', t: 'day', limit: '40', type: 'link' })}`;
}

// responses: [{kind, data:{children:[{data}]}}] -> unique posts with their kind
export function collectPosts(responses) {
  const seen = new Set();
  const posts = [];
  const authorCounts = {};
  for (const r of responses) {
    for (const c of r.data?.children || []) {
      const d = c.data;
      if (!d || seen.has(d.id)) continue;
      seen.add(d.id);
      posts.push({
        kind: r.kind, id: d.id, title: d.title || '', body: d.selftext || '', author: d.author || '', permalink: d.permalink,
        created_utc: d.created_utc, subreddit: d.subreddit,
      });
      if (d.author) authorCounts[d.author] = (authorCounts[d.author] || 0) + 1;
    }
  }
  return { posts, authorCounts };
}

export function candidatesFrom(posts, { scorer, trade }) {
  const out = [];
  for (const p of posts) {
    if (p.kind === 'trade') {
      if (!trade) continue;
      const parsed = trade.parseTradePost({ title: p.title, body: p.body, subreddit: p.subreddit });
      if (!parsed || !parsed.side || !parsed.game) continue;
      out.push({ ...p, parsed });
      continue;
    }
    if (scorer.isSeller(p.title, p.body) || !scorer.hasBuyerIntent(p.title, p.body)) continue;
    if (!scorer.classify(p.title, p.body).category) continue;
    if (!scorer.ROLE_RE.test(p.title + ' ' + p.body.slice(0, 700))) continue;
    out.push(p);
  }
  return out;
}

const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
const fmtAge = (d) => (d >= 365 ? Math.floor(d / 365) + 'y ' + Math.floor((d % 365) / 30) + 'm' : d >= 30 ? Math.floor(d / 30) + 'm' : Math.floor(d) + 'd');

export function profileSignals(author, profile, now = Date.now()) {
  const extra = [];
  let bonus = 0;
  let info = 'Account details unavailable';
  if (profile && profile.created_utc) {
    const days = (now / 1000 - profile.created_utc) / 86400;
    const karma = (profile.link_karma || 0) + (profile.comment_karma || 0);
    if (days < 30) extra.push({ sev: 'medium', label: 'Reddit account is less than 30 days old' });
    if (karma < 20) extra.push({ sev: 'medium', label: 'Reddit account has almost no karma' });
    if (profile.is_suspended) extra.push({ sev: 'severe', label: 'Reddit account is suspended' });
    if (days > 365) bonus += 6;
    if (karma > 500) bonus += 4;
    if (profile.has_verified_email) bonus += 3;
    info = `u/${author} · ${fmtAge(days)} old · ${fmtK(karma)} karma${profile.has_verified_email ? ' · verified email' : ''}`;
  }
  return { extra, bonus, info };
}

export function buildRedditLeads(cands, profiles, { scorer, authorCounts = {}, now = Date.now() }) {
  const counts = Object.fromEntries(Object.entries(authorCounts).map(([k, v]) => ['u/' + k, v]));
  return cands.map((d) => {
    const sig = profileSignals(d.author, profiles[d.author], now);
    const lead = scorer.buildLead({
      title: d.title, body: d.body, url: 'https://www.reddit.com' + d.permalink, source: 'Reddit', sourceDetail: 'r/' + d.subreddit,
      author: d.author ? 'u/' + d.author : null, authorInfo: sig.info, postedAt: new Date(d.created_utc * 1000).toISOString(),
      ctx: { bonus: sig.bonus, extraFlags: sig.extra, authorCounts: counts },
    });
    if (d.parsed) toTradeLead(lead, d.parsed);
    if (d.author) lead.contact = [`reddit: u/${d.author}`, lead.contact].filter(Boolean).join(' · ');
    return lead;
  });
}
