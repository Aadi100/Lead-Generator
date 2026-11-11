import { log } from '../lib/log.mjs';
import { fetchJson, fetchPage } from '../lib/http-fetch.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import { getIntegrations, loadScorer, recordStatus, backoffActive, startBackoff, explainHttp, makeTask } from '../lib/src-common.mjs';
import { PH_API, PH_FEED, PH_QUERY, leadsFromLaunches, parseApi, parseFeed } from '../lib/src-producthunt.mjs';

export async function runProductHunt(deps = {}) {
  const d = { fetchJson, fetchPage, insert: insertLeads, setStatus: recordStatus, ...deps };
  const cfg = (d.integrations || (await getIntegrations())).producthunt;
  if (!cfg.enabled) return { skipped: 'off' };
  const token = String(cfg.token || '').trim().replace(/^bearer\s+/i, '');
  if (backoffActive('producthunt', token || 'feed')) return { skipped: 'backoff' };

  let posts = [];
  let mode = 'feed';
  let failure = null;
  if (token) {
    mode = 'api';
    const res = await d.fetchJson(PH_API, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: PH_QUERY }), gapMs: 2000,
    });
    if (!res.ok || (res.json && res.json.errors)) failure = res.ok ? { status: 401, error: 'api error' } : res;
    else posts = parseApi(res.json);
  } else {
    const res = await d.fetchPage(PH_FEED, { timeoutMs: 15000 });
    if (!res.ok || !/<feed/i.test(res.text)) failure = { status: res.status, error: res.error };
    else posts = parseFeed(res.text);
  }
  if (failure) {
    const ex = explainHttp('producthunt', failure, 'producthunt.com');
    startBackoff('producthunt', token || 'feed', ex.backoffMs);
    await d.setStatus('producthunt', false, ex.message);
    log('src-producthunt', ex.message);
    return { failed: failure.status || 'network' };
  }
  const scorer = d.scorer || (await loadScorer());
  const leads = leadsFromLaunches(posts, { scorer });
  if (d.dryRun) return { mode, launches: posts.length, matched: leads.length, sample: leads.slice(0, 5) };
  const inserted = leads.length ? await d.insert(leads) : 0;
  await d.setStatus('producthunt', true, `Working (${mode === 'api' ? 'official API' : 'public feed, no key'}). Last run: ${posts.length} launches seen, ${leads.length} fit, ${inserted} new prospects.`);
  return { mode, launches: posts.length, matched: leads.length, inserted };
}

export const jobs = {
  async source_producthunt() {
    const r = await runProductHunt();
    if (r.skipped === 'off') throw new Error('Product Hunt is switched off in Settings > Connections.');
    if (r.skipped) throw new Error(`Skipped (${r.skipped}).`);
    if (r.failed !== undefined) throw new Error('Product Hunt did not answer. See the status in Settings > Connections.');
    return r;
  },
};
export const tasks = [makeTask('producthunt', 3 * 3600 * 1000, () => runProductHunt())];
