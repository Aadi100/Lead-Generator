import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { fetchJson } from '../lib/http-fetch.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import {
  getIntegrations, loadScorer, loadTrade, recordStatus, backoffActive, startBackoff, explainHttp, prepareLead, makeTask, cleanBearer,
} from '../lib/src-common.mjs';
import { X_SERVICE_QUERY, xTradeQuery, xSearchUrl, leadsFromX } from '../lib/src-x.mjs';

export async function runX(deps = {}) {
  const d = { fetchJson, insert: insertLeads, setStatus: recordStatus, ...deps };
  const cfg = (d.integrations || (await getIntegrations())).x;
  const token = cleanBearer(cfg.bearer_token);
  if (!cfg.enabled || !token) return { skipped: 'off' };
  if (backoffActive('x', token)) return { skipped: 'backoff' };

  const trading = d.trading || (await getSetting('trading'));
  const searches = [{ kind: 'service', query: X_SERVICE_QUERY }];
  const tq = trading.enabled ? xTradeQuery(trading) : null;
  if (tq) searches.push({ kind: 'trade', query: tq });

  const scorer = d.scorer || (await loadScorer());
  const trade = 'trade' in d ? d.trade : await loadTrade();
  const leads = [];
  let failure = null;
  for (const s of searches) {
    const res = await d.fetchJson(xSearchUrl(s.query), { headers: { Authorization: `Bearer ${token}` }, gapMs: 2000 });
    if (!res.ok) { failure = res; break; }
    leads.push(...leadsFromX(res.json || {}, { scorer, trade, kind: s.kind }));
  }
  const inserted = leads.length ? await d.insert(leads.map(prepareLead)) : 0;

  if (failure) {
    const ex = explainHttp('x', failure, 'api.twitter.com');
    startBackoff('x', token, ex.backoffMs);
    await d.setStatus('x', false, ex.message);
    log('x', ex.message);
    return { failed: failure.status, inserted };
  }
  await d.setStatus('x', true, `Working. Last run: ${leads.length} matching posts, ${inserted} new.`);
  return { searches: searches.length, matched: leads.length, inserted };
}

export const jobs = {};
export const tasks = [makeTask('x', 30 * 60 * 1000, () => runX())];
