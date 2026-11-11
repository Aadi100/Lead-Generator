// Serper-only discovery for sites we never fetch directly (LinkedIn, Indie Hackers, Fiverr talk).
// We only read the title, link and snippet Google returns. Nothing on those sites is opened.
import { sourceOf } from './src-serper.mjs';

const HOUR = 3600 * 1000;
const DEFAULT_WHO = ['web developer', 'website designer', 'app developer', 'graphic designer', 'logo designer', 'UI/UX designer', 'shopify developer', 'wordpress developer'];
const ASK = '("looking for" OR "need a" OR "hiring a" OR "looking to hire")';

// The user's own Targeting keywords come first, then the defaults. Short, plain phrases only.
export function whoPhrases(targeting = {}, max = 8) {
  const mine = [...(targeting.keywords || []), ...(targeting.topics || [])]
    .map((k) => String(k || '').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((k) => k.length >= 3 && k.length <= 40);
  const out = [];
  for (const k of [...mine.slice(0, 4), ...DEFAULT_WHO]) if (!out.some((o) => o.toLowerCase() === k.toLowerCase())) out.push(k);
  return out.slice(0, max);
}
const orGroup = (list) => `(${list.map((w) => `"${w}"`).join(' OR ')})`;

export const SITE_SPECS = {
  indiehackers: {
    id: 'indiehackers', label: 'Indie Hackers', setting: 'indiehackers', intervalMs: 12 * HOUR, job: 'source_indiehackers',
    queries: (t) => [{ part: 'Indie Hackers', q: `site:indiehackers.com ${ASK} ${orGroup(whoPhrases(t, 6))}` }],
  },
  linkedin: {
    id: 'linkedin', label: 'LinkedIn', setting: 'linkedin', intervalMs: 8 * HOUR, job: 'source_linkedin',
    queries: (t) => [
      { part: 'LinkedIn posts', q: `site:linkedin.com/posts ${ASK} ${orGroup(whoPhrases(t, 6))}` },
      { part: 'LinkedIn jobs', q: `site:linkedin.com/jobs (contract OR freelance OR "part-time" OR "project-based") ${orGroup(whoPhrases(t, 6))}`, jobs: true },
    ],
  },
  fiverr: {
    id: 'fiverr', label: 'Fiverr discovery', setting: 'fiverr', intervalMs: 12 * HOUR, job: 'source_fiverr',
    queries: (t) => [
      { part: 'Fiverr discovery', q: `("looking for a freelancer" OR "need a freelancer" OR "hire a freelancer" OR "post a request on fiverr") ${orGroup(whoPhrases(t, 5))} -site:fiverr.com -site:upwork.com -site:linkedin.com` },
    ],
  },
};

const CONTRACT_RE = /\b(contract|contractor|freelance|freelancer|part[- ]time|project[- ]based|short[- ]term|one[- ]off|gig)\b/i;

// results: [{part, q, jobs, organic:[{title, link, snippet}]}]. Same gates as the main Serper source.
export function leadsFromSite(spec, results, { scorer, seen = new Set() }) {
  const out = [];
  for (const r of results) {
    for (const o of r.organic || []) {
      if (!o.link || seen.has(o.link)) continue;
      if (/linkedin\.com/i.test(o.link) && !/\/(jobs|posts|feed\/update|pulse)\//i.test(o.link)) continue;
      const title = String(o.title || '').trim();
      const body = String(o.snippet || '').trim();
      const isJob = !!r.jobs || /linkedin\.com\/jobs\//i.test(o.link);
      if (scorer.isSeller(title, body)) continue;
      if (isJob ? !CONTRACT_RE.test(`${title} ${body}`) : !scorer.hasBuyerIntent(title, body)) continue;
      const lead = scorer.buildLead({
        title, body, url: o.link, source: sourceOf(o.link), sourceDetail: `found via Google (${r.part})`, author: null,
        authorInfo: isJob ? 'Public job post found through Google search' : 'Public post found through Google search',
        ctx: { snippetOnly: true, bonus: isJob ? 2 : -4 },
      });
      if (!lead.category) continue;
      if (spec.id === 'fiverr') lead.tags = JSON.stringify([...new Set([...JSON.parse(lead.tags || '[]'), 'fiverr-discovery'])].slice(0, 8));
      seen.add(o.link);
      out.push(lead);
    }
  }
  return out;
}
