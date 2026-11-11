import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting, patchSetting } from '../lib/settings.mjs';
import { fetchJson, fetchPage } from '../lib/http-fetch.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import { getIntegrations, recordStatus, backoffActive, startBackoff, explainHttp, makeTask } from '../lib/src-common.mjs';
import { PLACES_URL, buildPlaceRow, pickCombos, placeUrl, websiteProblem } from '../lib/src-places.mjs';

async function existingUrls(urls) {
  const have = new Set();
  for (let i = 0; i < urls.length; i += 100) {
    const { data } = await sb.from('leads').select('url').in('url', urls.slice(i, i + 100));
    (data || []).forEach((r) => have.add(r.url));
  }
  return have;
}

// force = "Run now" button: ignores the on/off switch of the schedule but still needs a Serper key and cities + niches.
export async function runPlaces({ force = false, ...deps } = {}) {
  const d = {
    fetchJson, insert: insertLeads, setStatus: recordStatus, existing: existingUrls,
    check: (url) => fetchPage(url, { timeoutMs: 8000, maxBytes: 20000 }), ...deps,
  };
  const cfg = d.prospecting || (await getSetting('prospecting'));
  if (!force && !cfg.places_enabled) return { skipped: 'off' };
  const key = String(((d.integrations || (await getIntegrations())).serper || {}).api_key || '').trim();
  if (!key) {
    await d.setStatus('places', false, 'Needs a Serper API key (Settings > Connections) to look up local businesses.');
    return { skipped: 'needs key' };
  }
  const cities = (cfg.cities || []).map((c) => String(c).trim()).filter(Boolean);
  const niches = (cfg.places_niches || []).map((c) => String(c).trim()).filter(Boolean);
  if (!cities.length || !niches.length) return { skipped: 'Add at least one city (Prospecting) and one business niche for Google Places' };
  if (backoffActive('places', key)) return { skipped: 'backoff' };

  const state = d.state || (await getSetting('src_state'));
  const { combos, next } = pickCombos(cities, niches, Number(state.places_cursor) || 0, 4);
  let remaining = Number(cfg.per_run_limit) || 30;
  let seen = 0;
  let checked = 0;
  let inserted = 0;
  let failure = null;
  const rows = [];

  for (const { city, niche } of combos) {
    if (remaining <= 0) break;
    const res = await d.fetchJson(PLACES_URL, {
      method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: `${niche} in ${city}`, num: 20 }), gapMs: 1500,
    });
    if (!res.ok) { failure = res; break; }
    const places = (res.json && res.json.places) || [];
    seen += places.length;
    const withUrl = places.filter((p) => p.title && placeUrl(p));
    const have = await d.existing(withUrl.map(placeUrl));
    const batch = [];
    for (const p of withUrl) {
      if (batch.length >= remaining) break;
      if (have.has(placeUrl(p))) continue;
      if (p.website) checked++;
      const problem = await websiteProblem(p.website, d.check);
      if (problem) batch.push(buildPlaceRow(p, { city, niche, problem }));
    }
    if (d.dryRun) rows.push(...batch);
    else if (batch.length) inserted += await d.insert(batch);
    remaining -= batch.length;
  }

  if (d.dryRun) return { searches: combos.length, seen, websitesChecked: checked, matched: rows.length, rows };
  if (!failure) await patchSetting('src_state', { places_cursor: next });
  if (failure) {
    const ex = explainHttp('serper', failure, 'google.serper.dev');
    startBackoff('places', key, ex.backoffMs);
    await d.setStatus('places', false, ex.message);
    log('src-places', ex.message);
    return { failed: failure.status || 'network', inserted };
  }
  await d.setStatus('places', true, `Working. Last run: ${combos.length} searches, ${seen} businesses seen, ${checked} websites checked, ${inserted} new prospects.`);
  return { searches: combos.length, seen, websitesChecked: checked, inserted };
}

export const jobs = {
  async prospect_places() {
    const r = await runPlaces({ force: true });
    if (r.skipped === 'needs key') throw new Error('Add your Serper API key in Settings > Connections first.');
    if (r.skipped) throw new Error(String(r.skipped));
    if (r.failed !== undefined) throw new Error('Google Places search (Serper) returned an error. See the status in Settings > Connections.');
    return r;
  },
};
export const tasks = [makeTask('places', 24 * 3600 * 1000, () => runPlaces())];
