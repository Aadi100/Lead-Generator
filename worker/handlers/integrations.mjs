import { getSetting } from '../lib/settings.mjs';
import { fetchJson } from '../lib/http-fetch.mjs';
import { getIntegrations, recordStatus, explainHttp, cleanBearer, LABELS } from '../lib/src-common.mjs';
import { getRedditToken } from './src-redditapi.mjs';
import { userAgent, searchUrl } from '../lib/src-redditapi.mjs';
import { xSearchUrl } from '../lib/src-x.mjs';
import { countUpworkMail, imapReady } from '../lib/src-upwork.mjs';

const fail = (name, res, host) => ({ ok: false, message: explainHttp(name, res, host).message });

async function testSerper(cfg, d) {
  if (!cfg.api_key) return { ok: false, message: 'Paste your Serper API key first.' };
  const res = await d.fetchJson('https://google.serper.dev/search', {
    method: 'POST', headers: { 'X-API-KEY': String(cfg.api_key).trim(), 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'web developer', num: 1 }),
  });
  return res.ok ? { ok: true, message: 'Connected. The key works.' } : fail('serper', res, 'google.serper.dev');
}

async function testX(cfg, d) {
  const token = cleanBearer(cfg.bearer_token);
  if (!token) return { ok: false, message: 'Paste your X bearer token first.' };
  const q = '"web developer" -is:retweet lang:en';
  const url = xSearchUrl(q).replace('max_results=50', 'max_results=10');
  const res = await d.fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? { ok: true, message: 'Connected. The token can search recent posts.' } : fail('x', res, 'api.twitter.com');
}

async function testReddit(cfg, d) {
  if (!cfg.client_id || !cfg.client_secret) return { ok: false, message: 'Fill in the Reddit client id and secret first.' };
  const tk = await getRedditToken(cfg, d.fetchJson, true);
  if (tk.error) {
    const r = tk.error;
    const msg = r.status === 401
      ? 'Reddit rejected the client id or secret (401). Check them in reddit.com/prefs/apps (app type "script").'
      : explainHttp('reddit_api', r, 'www.reddit.com').message;
    return { ok: false, message: msg };
  }
  const res = await d.fetchJson(searchUrl('web developer').replace('limit=40', 'limit=1'), { headers: { Authorization: `Bearer ${tk.token}` }, ua: userAgent(cfg) });
  if (!res.ok) return fail('reddit_api', res, 'oauth.reddit.com');
  const note = cfg.username ? '' : ' Tip: add your Reddit username so the User-Agent is complete.';
  return { ok: true, message: `Connected. Reddit accepted the app.${note}` };
}

async function testUpwork(cfg, d) {
  const imap = d.imap || (await getSetting('imap'));
  if (!imapReady(imap)) return { ok: false, message: 'Set up the inbox first (Settings > Reply tracking: host, user and password).' };
  try {
    const n = await d.countMail(imap, 14);
    return { ok: true, message: `Connected to the inbox. Found ${n} Upwork email${n === 1 ? '' : 's'} in the last 14 days.${n ? '' : ' Create Upwork saved searches with email alerts so they arrive here.'}` };
  } catch (e) {
    return { ok: false, message: `Could not read the inbox: ${String(e.message || e).slice(0, 160)}` };
  }
}

async function testProductHunt(cfg, d) {
  const token = String(cfg.token || '').trim().replace(/^bearer\s+/i, '');
  if (!token) return { ok: true, message: 'No token needed: the public launch feed is used. Add a token to also check each product website.' };
  const res = await d.fetchJson('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ viewer { user { name } } }' }),
  });
  if (res.ok && !res.json?.errors) return { ok: true, message: 'Connected. The token works.' };
  return res.status === 401 || res.json?.errors ? { ok: false, message: 'Product Hunt rejected the token. Create a developer token at producthunt.com/v2/oauth/applications and paste it again.' } : fail('producthunt', res, 'api.producthunt.com');
}

const TESTS = { producthunt: testProductHunt, serper: testSerper, x: testX, reddit_api: testReddit, upwork_inbox: testUpwork };

export async function testIntegration(name, deps = {}) {
  const fn = TESTS[name];
  if (!fn) return { ok: false, message: `Unknown connection "${name}".` };
  const d = { fetchJson, countMail: countUpworkMail, setStatus: recordStatus, ...deps };
  const cfg = (d.integrations || (await getIntegrations()))[name] || {};
  let result;
  try {
    result = await fn(cfg, d);
  } catch (e) {
    result = { ok: false, message: `${LABELS[name] || name}: test failed (${String(e.message || e).slice(0, 160)}).` };
  }
  await d.setStatus(name, result.ok, result.message);
  return result;
}

export const jobs = {
  async test_integration(job) {
    return testIntegration(String(job.payload?.name || ''));
  },
};
export const tasks = [];
