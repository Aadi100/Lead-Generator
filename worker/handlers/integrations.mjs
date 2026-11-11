import { getSetting } from '../lib/settings.mjs';
import { fetchJson } from '../lib/http-fetch.mjs';
import { getIntegrations, recordStatus, explainHttp, cleanBearer, LABELS } from '../lib/src-common.mjs';
import { getRedditToken } from './src-redditapi.mjs';
import { userAgent, searchUrl } from '../lib/src-redditapi.mjs';
import { xSearchUrl } from '../lib/src-x.mjs';
import { countUpworkMail, imapReady } from '../lib/src-upwork.mjs';

const DISCORD_UA = 'DiscordBot (lead-radar, 1.0)';
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

function discordProblem(label, res) {
  const code = res.json?.code;
  if (res.status === 401) return `${label}: Discord rejected the token (401).`;
  if (res.status === 404 || code === 10003) return `${label}: channel id not found. Check the id.`;
  if (res.status === 403 && code === 50001) return `${label}: the bot cannot see this channel (Missing Access). Invite the bot to that server and give it View Channel.`;
  if (res.status === 403 && code === 50013) return `${label}: the bot is missing permissions here. Give it View Channel and Read Message History.`;
  if (res.status === 403) return `${label}: access denied (403). The bot needs View Channel and Read Message History.`;
  if (res.status === 429) return `${label}: Discord rate limit reached. Try again in a minute.`;
  return `${label}: Discord replied ${res.status || 'with a network error'}.`;
}

async function testDiscord(cfg, d) {
  const token = String(cfg.bot_token || '').trim().replace(/^bot\s+/i, '');
  if (!token) return { ok: false, message: 'Paste your Discord bot token first.' };
  const headers = { Authorization: `Bot ${token}` };
  const me = await d.fetchJson('https://discord.com/api/v10/users/@me', { headers, ua: DISCORD_UA });
  if (!me.ok) return { ok: false, message: me.status === 401 ? 'Discord rejected the bot token (401). Copy it again from the Developer Portal > Bot > Reset Token.' : explainHttp('discord', me, 'discord.com').message };
  const channels = (d.trading?.discord?.channels || []).filter((c) => c && c.id).slice(0, 10);
  if (!channels.length) return { ok: true, message: `Bot "${me.json?.username || 'unknown'}" is connected. Add channel ids in Settings > Trading to start reading them.` };

  const lines = [];
  let readable = 0;
  let emptyContent = false;
  for (const ch of channels) {
    const label = ch.label || ch.id;
    const res = await d.fetchJson(`https://discord.com/api/v10/channels/${encodeURIComponent(ch.id)}/messages?limit=5`, { headers, ua: DISCORD_UA });
    if (!res.ok) { lines.push(discordProblem(label, res)); continue; }
    readable++;
    const msgs = Array.isArray(res.json) ? res.json : [];
    if (msgs.some((m) => m && !m.author?.bot && !m.content && !(m.embeds || []).length && !(m.attachments || []).length)) emptyContent = true;
    lines.push(`${label}: readable.`);
  }
  if (emptyContent) lines.push('Some messages came back empty: turn on "Message Content Intent" in the Developer Portal > Bot, or the bot cannot read what people write.');
  const ok = readable > 0 && !emptyContent;
  return { ok, message: `Bot "${me.json?.username || 'unknown'}" is connected. ${lines.join(' ')}`.slice(0, 300) };
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

const TESTS = { serper: testSerper, x: testX, reddit_api: testReddit, discord: testDiscord, upwork_inbox: testUpwork };

export async function testIntegration(name, deps = {}) {
  const fn = TESTS[name];
  if (!fn) return { ok: false, message: `Unknown connection "${name}".` };
  const d = { fetchJson, countMail: countUpworkMail, setStatus: recordStatus, ...deps };
  d.trading = d.trading || (name === 'discord' ? await getSetting('trading') : {});
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
