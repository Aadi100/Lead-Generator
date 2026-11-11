import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { fetchJson } from '../lib/http-fetch.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import {
  getIntegrations, loadScorer, loadTrade, recordStatus, backoffActive, startBackoff, explainHttp, prepareLead, makeTask,
} from '../lib/src-common.mjs';
import {
  SERVICE_QUERIES, tradeRedditQueries, userAgent, basicAuth, searchUrl, collectPosts, candidatesFrom, buildRedditLeads,
} from '../lib/src-redditapi.mjs';

const tokenCache = { fp: null, token: null, exp: 0 };
const MAX_PROFILES = 30;

export async function getRedditToken(cfg, fj = fetchJson, force = false) {
  const fp = `${cfg.client_id}:${cfg.client_secret}`;
  if (!force && tokenCache.fp === fp && tokenCache.token && Date.now() < tokenCache.exp) return { token: tokenCache.token };
  const res = await fj('https://www.reddit.com/api/v1/access_token', {
    method: 'POST', body: 'grant_type=client_credentials', ua: userAgent(cfg),
    headers: { Authorization: basicAuth(cfg.client_id.trim(), cfg.client_secret.trim()), 'Content-Type': 'application/x-www-form-urlencoded' }, gapMs: 1200,
  });
  if (!res.ok || !res.json?.access_token) return { error: res };
  Object.assign(tokenCache, { fp, token: res.json.access_token, exp: Date.now() + Math.max(60, (res.json.expires_in || 3600) - 120) * 1000 });
  return { token: res.json.access_token };
}

export async function runRedditApi(deps = {}) {
  const d = { fetchJson, insert: insertLeads, setStatus: recordStatus, ...deps };
  const cfg = (d.integrations || (await getIntegrations())).reddit_api;
  if (!cfg.enabled || !cfg.client_id || !cfg.client_secret) return { skipped: 'off' };
  const keyId = `${cfg.client_id}:${cfg.client_secret}`;
  if (backoffActive('reddit_api', keyId)) return { skipped: 'backoff' };

  const fail = async (res, host) => {
    const ex = explainHttp('reddit_api', res, host);
    startBackoff('reddit_api', keyId, ex.backoffMs);
    await d.setStatus('reddit_api', false, ex.message);
    log('reddit-api', ex.message);
    return { failed: res.status };
  };

  let tk = await getRedditToken(cfg, d.fetchJson);
  if (tk.error) return fail(tk.error, 'www.reddit.com');
  const ua = userAgent(cfg);
  const authed = async (url) => {
    let res = await d.fetchJson(url, { headers: { Authorization: `Bearer ${tk.token}` }, ua, gapMs: 1200 });
    if (res.status === 401) {
      tk = await getRedditToken(cfg, d.fetchJson, true);
      if (tk.error) return tk.error;
      res = await d.fetchJson(url, { headers: { Authorization: `Bearer ${tk.token}` }, ua, gapMs: 1200 });
    }
    return res;
  };

  const trading = d.trading || (await getSetting('trading'));
  const queries = [
    ...SERVICE_QUERIES.map((q) => ({ kind: 'service', q })),
    ...(trading.enabled ? tradeRedditQueries(trading).map((q) => ({ kind: 'trade', q })) : []),
  ];
  const responses = [];
  let failure = null;
  for (const qd of queries) {
    const res = await authed(searchUrl(qd.q));
    if (!res.ok) { failure = res; break; }
    responses.push({ kind: qd.kind, ...(res.json || {}) });
  }

  const scorer = d.scorer || (await loadScorer());
  const trade = 'trade' in d ? d.trade : await loadTrade();
  const { posts, authorCounts } = collectPosts(responses);
  const cands = candidatesFrom(posts, { scorer, trade });

  const profiles = {};
  for (const c of cands.slice(0, MAX_PROFILES)) {
    if (!c.author || c.author === '[deleted]' || profiles[c.author] !== undefined) continue;
    const res = await authed(`https://oauth.reddit.com/user/${encodeURIComponent(c.author)}/about`);
    profiles[c.author] = res.ok ? res.json?.data || null : null;
  }
  const leads = buildRedditLeads(cands, profiles, { scorer, authorCounts });
  const inserted = leads.length ? await d.insert(leads.map(prepareLead)) : 0;

  if (failure) {
    await fail(failure, 'oauth.reddit.com');
    return { failed: failure.status, searches: responses.length, inserted };
  }
  await d.setStatus('reddit_api', true, `Working. Last run: ${responses.length} searches, ${leads.length} matching posts, ${inserted} new.`);
  return { searches: responses.length, posts: posts.length, matched: leads.length, inserted };
}

export const jobs = {};
export const tasks = [makeTask('reddit_api', 15 * 60 * 1000, () => runRedditApi())];
