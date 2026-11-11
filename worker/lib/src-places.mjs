// Local businesses from the Serper "places" endpoint (Google Maps data as a search API; we never open Google Maps).
// Kept only when the business has no website, or the website it lists does not load.

export const PLACES_URL = 'https://google.serper.dev/places';
const BLOCKISH = new Set([401, 403, 405, 406, 429, 451, 999]);

export function placeUrl(p) {
  if (p.cid) return `https://www.google.com/maps?cid=${p.cid}`;
  if (p.placeId) return `https://www.google.com/maps/place/?q=place_id:${p.placeId}`;
  return null;
}

// Rotates through city x niche pairs so a small per-run budget still covers everything over time.
export function pickCombos(cities, niches, cursor = 0, max = 4) {
  const all = [];
  for (const c of cities) for (const n of niches) all.push({ city: c, niche: n });
  if (!all.length) return { combos: [], next: 0 };
  const out = [];
  for (let i = 0; i < Math.min(max, all.length); i++) out.push(all[(cursor + i) % all.length]);
  return { combos: out, next: (cursor + out.length) % all.length };
}

// check: async (url) => ({ ok, status }). Returns 'none' | 'broken' | null (site is fine or could not be judged).
export async function websiteProblem(website, check) {
  const w = String(website || '').trim();
  if (!w) return 'none';
  const url = /^https?:\/\//i.test(w) ? w : `https://${w}`;
  const r = await check(url);
  if (r.ok) return null;
  if (!r.status) return /ENOTFOUND|ECONNREFUSED|CERT|timeout|EAI_AGAIN/i.test(String(r.error || '')) ? 'broken' : null;
  if (BLOCKISH.has(r.status)) return null;
  return r.status >= 400 ? 'broken' : null;
}

export function buildPlaceRow(p, { city, niche, problem }) {
  const url = placeUrl(p);
  const phone = String(p.phoneNumber || '').trim();
  const reason = problem === 'broken' ? `The website it lists (${p.website}) does not load.` : 'Google lists no website for this business.';
  const rating = p.rating ? `${p.rating} stars${p.ratingCount ? ` (${p.ratingCount} reviews)` : ''}` : '';
  const trust = Math.min(80, 55 + (phone ? 8 : 0) + (p.rating >= 4 ? 5 : 0) + (p.ratingCount >= 20 ? 5 : 0));
  const lines = [`Type: ${p.category || niche}`, p.address && `Address: ${p.address}`, phone && `Phone: ${phone}`, rating && `Rating: ${rating}`, reason].filter(Boolean);
  return {
    title: `${p.title} in ${city} ${problem === 'broken' ? 'has a broken website' : 'has no website'}`.slice(0, 300),
    description: lines.join('\n'),
    url, budget: 'TBD', source: 'Google Places', source_detail: `${city} (${niche})`, type: 'Outbound', status: 'New',
    category: 'Website', categories: ['Website'], tags: [niche].slice(0, 3),
    author: p.title, author_info: p.address || null, contact: phone ? `phone: ${phone}` : null,
    trust_score: trust, trust_level: trust >= 70 ? 'High' : 'Medium', is_suspicious: false,
    flags: ['Business data from Google can be out of date: confirm it is open'],
    lead_kind: 'prospect', alerted_at: new Date().toISOString(), enrich_status: 'pending',
    website: problem === 'broken' ? String(p.website).trim() : null, socials: {},
  };
}
