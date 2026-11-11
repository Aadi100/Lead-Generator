import { tradeTargets, toTradeLead } from './src-common.mjs';

const WHO = '("web developer" OR "website designer" OR "app developer" OR "graphic designer" OR "logo designer" OR "UI/UX designer" OR "shopify developer" OR "wordpress developer")';
const ASK = '("looking for" OR "need a" OR "hiring a" OR "looking to hire")';
const SITES = ['linkedin.com/posts', 'x.com', 'facebook.com/groups', 'reddit.com/r', 'indiehackers.com', 'quora.com'];
const SRC = [[/linkedin\.com/, 'LinkedIn'], [/(^|\.)(x|twitter)\.com/, 'X'], [/facebook\.com/, 'Facebook'], [/reddit\.com/, 'Reddit'], [/instagram\.com/, 'Instagram'], [/quora\.com/, 'Quora'], [/indiehackers\.com/, 'Indie Hackers']];

export function serviceQueries() {
  return SITES.map((s) => ({ kind: 'service', q: `site:${s} ${ASK} ${WHO}` }));
}

export function tradeQueries(trading = {}, max = 8) {
  const out = [];
  const targets = tradeTargets(trading, max);
  for (const [i, t] of targets.entries()) {
    const verbs = t.side === 'buyer' ? '("WTB" OR "buying" OR "looking to buy" OR "LF")' : '("WTS" OR "selling" OR "for sale")';
    const base = `${verbs} "${t.game}"${t.item ? ` ${t.item}` : ''}`;
    out.push({ kind: 'trade', q: `site:reddit.com/r ${base}` });
    if (i < 2) out.push({ kind: 'trade', q: `site:x.com ${base}` });
  }
  return out.slice(0, max);
}

export const sourceOf = (link) => {
  const host = (link.match(/^https?:\/\/([^/]+)/) || [])[1] || '';
  return (SRC.find(([re]) => re.test(host)) || [null, 'Web'])[1];
};

// results: [{kind, q, organic:[{title, link, snippet}]}]
export function leadsFromSerper(results, { scorer, trade, seen = new Set() }) {
  const out = [];
  let skippedTrade = 0;
  for (const r of results) {
    for (const o of r.organic || []) {
      if (!o.link || seen.has(o.link)) continue;
      const title = String(o.title || '').trim();
      const body = String(o.snippet || '').trim();
      const base = {
        title, body, url: o.link, source: sourceOf(o.link), sourceDetail: 'found via Google', author: null,
        authorInfo: 'Public post found through Google search', ctx: { snippetOnly: true, bonus: -4 },
      };
      if (r.kind === 'trade') {
        if (!trade) { skippedTrade++; continue; }
        const parsed = trade.parseTradePost({ title, body });
        if (!parsed || !parsed.side || !parsed.game) continue;
        seen.add(o.link);
        out.push(toTradeLead(scorer.buildLead(base), parsed));
        continue;
      }
      if (scorer.isSeller(title, body) || !scorer.hasBuyerIntent(title, body)) continue;
      const lead = scorer.buildLead(base);
      if (!lead.category) continue;
      seen.add(o.link);
      out.push(lead);
    }
  }
  return { leads: out, skippedTrade };
}
