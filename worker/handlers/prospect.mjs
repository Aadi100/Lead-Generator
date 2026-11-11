import { getSetting } from '../lib/settings.mjs';
import { log } from '../lib/log.mjs';
import { runProspecting } from '../lib/osm-prospect.mjs';

async function check() {
  const cfg = await getSetting('prospecting');
  if (!cfg.enabled) return;
  const hours = Number(cfg.interval_hours) || 24;
  const last = cfg.last_run ? new Date(cfg.last_run).getTime() : 0;
  if (Date.now() - last < hours * 3600 * 1000) return;
  const r = await runProspecting();
  log('prospect', `found ${r.found}, inserted ${r.inserted}${r.errors?.length ? ', errors: ' + r.errors.join(' | ') : ''}`);
}

export const tasks = [{ name: 'prospect-check', everyMs: 30 * 60 * 1000, initialDelayMs: 60000, run: check }];

export const jobs = {
  async prospect_local() {
    const r = await runProspecting({ force: true });
    if (r.skipped) throw new Error(r.skipped);
    return { cities: r.cities, found: r.found, inserted: r.inserted };
  },
};
