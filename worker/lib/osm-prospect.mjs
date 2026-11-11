import { sb } from './db.mjs';
import { log } from './log.mjs';
import { getSetting, patchSetting } from './settings.mjs';
import { sleep } from './util.mjs';
import { buildProspectRow, fetchBusinessesWithoutWebsite, geocodeCity, tagFor } from './osm-query.mjs';

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export async function runProspecting({ force = false, limit, dryRun = false } = {}) {
  const cfg = await getSetting('prospecting');
  if (!force && !cfg.enabled) return { cities: 0, found: 0, inserted: 0, skipped: 'disabled' };
  const cities = (cfg.cities || []).map((c) => String(c).trim()).filter(Boolean);
  const types = (cfg.business_types || []).filter((t) => tagFor(t));
  if (!cities.length || !types.length) return { cities: 0, found: 0, inserted: 0, skipped: 'Add at least one city and one business type' };

  let remaining = Number(limit || cfg.per_run_limit) || 30;
  const geoCache = { ...(cfg.geo_cache || {}) };
  const errors = [];
  let found = 0;
  let inserted = 0;
  const rows = [];

  for (const city of cities) {
    if (remaining <= 0) break;
    try {
      if (!geoCache[city]) {
        const g = await geocodeCity(city);
        geoCache[city] = { bbox: g.bbox };
      }
      const candidates = [];
      for (const type of shuffle([...types])) {
        try {
          candidates.push(...(await fetchBusinessesWithoutWebsite(geoCache[city].bbox, type, 100)).map((el) => buildProspectRow(el, city)));
        } catch (e) {
          errors.push(`${city}/${type}: ${e.message}`);
        }
        if (candidates.length >= remaining * 4) break;
        await sleep(500);
      }
      found += candidates.length;
      shuffle(candidates).sort((a, b) => b._rank - a._rank);
      const urls = candidates.map((c) => c.url);
      const existing = new Set();
      for (let i = 0; i < urls.length; i += 100) {
        const { data } = await sb.from('leads').select('url').in('url', urls.slice(i, i + 100));
        (data || []).forEach((r) => existing.add(r.url));
      }
      const fresh = candidates.filter((c) => !existing.has(c.url)).slice(0, remaining);
      const clean = fresh.map(({ _rank, ...row }) => row);
      if (clean.length && !dryRun) {
        const { data, error } = await sb.from('leads').upsert(clean, { onConflict: 'url', ignoreDuplicates: true }).select('id');
        if (error) throw new Error(error.message);
        inserted += (data || []).length;
        remaining -= (data || []).length;
      } else {
        rows.push(...clean);
        remaining -= clean.length;
      }
    } catch (e) {
      errors.push(`${city}: ${e.message}`);
      log('prospect', `${city}: ${e.message}`);
    }
  }
  const result = { cities: cities.length, found, inserted, errors: errors.slice(0, 5) };
  if (!dryRun) await patchSetting('prospecting', { last_run: new Date().toISOString(), last_result: result, geo_cache: geoCache });
  return dryRun ? { ...result, rows } : result;
}
