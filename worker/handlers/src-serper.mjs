import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { fetchJson } from '../lib/http-fetch.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import {
  getIntegrations, loadScorer, loadTrade, recordStatus, backoffActive, startBackoff, explainHttp, prepareLead, makeTask,
} from '../lib/src-common.mjs';
import { serviceQueries, tradeQueries, leadsFromSerper } from '../lib/src-serper.mjs';

export async function runSerper(deps = {}) {
  const d = { fetchJson, insert: insertLeads, setStatus: recordStatus, ...deps };
  const cfg = (d.integrations || (await getIntegrations())).serper;
  if (!cfg.enabled || !cfg.api_key) return { skipped: 'off' };
  if (backoffActive('serper', cfg.api_key)) return { skipped: 'backoff' };

  const trading = d.trading || (await getSetting('trading'));
  const queries = [
    ...(cfg.services !== false ? serviceQueries() : []),
    ...(cfg.trading !== false && trading.enabled ? tradeQueries(trading) : []),
  ];
  if (!queries.length) return { skipped: 'nothing to search' };

  const results = [];
  let failure = null;
  for (const qd of queries) {
    const res = await d.fetchJson('https://google.serper.dev/search', {
      method: 'POST', headers: { 'X-API-KEY': String(cfg.api_key).trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: qd.q, num: 20, tbs: 'qdr:w' }), gapMs: 1000,
    });
    if (!res.ok) { failure = res; break; }
    results.push({ kind: qd.kind, q: qd.q, organic: res.json?.organic || [] });
  }

  const scorer = d.scorer || (await loadScorer());
  const trade = 'trade' in d ? d.trade : await loadTrade();
  const { leads, skippedTrade } = leadsFromSerper(results, { scorer, trade });
  const inserted = leads.length ? await d.insert(leads.map(prepareLead)) : 0;

  if (failure) {
    const ex = explainHttp('serper', failure, 'google.serper.dev');
    startBackoff('serper', cfg.api_key, ex.backoffMs);
    await d.setStatus('serper', false, ex.message);
    log('serper', ex.message);
    return { failed: failure.status, searches: results.length, inserted };
  }
  await d.setStatus('serper', true, `Working. Last run: ${results.length} searches, ${leads.length} matching posts, ${inserted} new.`);
  return { searches: results.length, matched: leads.length, inserted, skippedTrade };
}

export const jobs = {};
export const tasks = [makeTask('serper', 6 * 3600 * 1000, () => runSerper())];
