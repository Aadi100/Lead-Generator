import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { fetchJson } from '../lib/http-fetch.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import { getIntegrations, loadScorer, recordStatus, backoffActive, startBackoff, explainHttp, prepareLead, makeTask } from '../lib/src-common.mjs';
import { SITE_SPECS, leadsFromSite } from '../lib/src-sites.mjs';

// Indie Hackers, LinkedIn and Fiverr discovery. All three go through Serper only.
export async function runSite(id, deps = {}) {
  const spec = SITE_SPECS[id];
  const d = { fetchJson, insert: insertLeads, setStatus: recordStatus, ...deps };
  const ints = d.integrations || (await getIntegrations());
  const cfg = ints.serper;
  if (cfg[spec.setting] === false) return { skipped: 'off' };
  if (!cfg.api_key) {
    await d.setStatus(id, false, `Needs a Serper API key (Settings > Connections). ${spec.label} is only read through Google search.`);
    return { skipped: 'needs key' };
  }
  if (!cfg.enabled) return { skipped: 'off' };
  if (backoffActive(id, cfg.api_key)) return { skipped: 'backoff' };

  const targeting = d.targeting || (await getSetting('targeting'));
  const results = [];
  let failure = null;
  for (const qd of spec.queries(targeting)) {
    const res = await d.fetchJson('https://google.serper.dev/search', {
      method: 'POST', headers: { 'X-API-KEY': String(cfg.api_key).trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: qd.q, num: 10, tbs: 'qdr:m' }), gapMs: 1500,
    });
    if (!res.ok) { failure = res; break; }
    results.push({ ...qd, organic: res.json?.organic || [] });
  }
  const scorer = d.scorer || (await loadScorer());
  const leads = leadsFromSite(spec, results, { scorer });
  if (d.dryRun) return { searches: results.length, matched: leads.length, sample: leads.slice(0, 5) };
  const inserted = leads.length ? await d.insert(leads.map(prepareLead)) : 0;

  if (failure) {
    const ex = explainHttp('serper', failure, 'google.serper.dev');
    startBackoff(id, cfg.api_key, ex.backoffMs);
    await d.setStatus(id, false, ex.message);
    log(`src-${id}`, ex.message);
    return { failed: failure.status, searches: results.length, inserted };
  }
  await d.setStatus(id, true, `Working. Last run: ${results.length} searches, ${leads.length} matching posts, ${inserted} new.`);
  return { searches: results.length, matched: leads.length, inserted };
}

const toJob = (id) => async () => {
  const r = await runSite(id);
  if (r.skipped) throw new Error(r.skipped === 'needs key' ? 'Add your Serper API key in Settings > Connections first.' : r.skipped === 'off' ? 'This source is switched off in Settings > Connections.' : `Skipped (${r.skipped}).`);
  if (r.failed !== undefined) throw new Error('Google search (Serper) returned an error. See the status in Settings > Connections.');
  return r;
};

export const jobs = Object.fromEntries(Object.values(SITE_SPECS).map((s) => [s.job, toJob(s.id)]));
// Staggered by the different intervals and random start delays of makeTask.
export const tasks = Object.values(SITE_SPECS).map((s) => makeTask(s.id, s.intervalMs, () => runSite(s.id)));
