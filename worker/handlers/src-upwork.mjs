import { log } from '../lib/log.mjs';
import { getSetting, setSetting } from '../lib/settings.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import {
  getIntegrations, loadScorer, recordStatus, backoffActive, startBackoff, prepareLead, makeTask,
} from '../lib/src-common.mjs';
import { fetchUpworkMail, imapReady, leadsFromUpwork } from '../lib/src-upwork.mjs';

const SEEN_MAX = 300;

export async function runUpwork(deps = {}) {
  const d = { insert: insertLeads, setStatus: recordStatus, fetchMail: fetchUpworkMail, ...deps };
  const cfg = (d.integrations || (await getIntegrations())).upwork_inbox;
  if (!cfg.enabled) return { skipped: 'off' };
  const imap = d.imap || (await getSetting('imap'));
  if (!imapReady(imap)) {
    await d.setStatus('upwork_inbox', false, 'Set up the inbox first (Settings > Reply tracking: host, user and password), then turn this on.');
    return { skipped: 'no inbox' };
  }
  const fp = `${imap.host}:${imap.user}`;
  if (backoffActive('upwork_inbox', fp)) return { skipped: 'backoff' };

  const state = d.state || (await getSetting('upwork_state'));
  const since = state.last_checked ? new Date(Date.parse(state.last_checked) - 86400000) : new Date(Date.now() - 2 * 86400000);
  let mail;
  try {
    mail = await d.fetchMail(imap, since);
  } catch (e) {
    startBackoff('upwork_inbox', fp, 30 * 60 * 1000);
    const msg = `Could not read the inbox: ${String(e.message || e).slice(0, 160)}. Will try again in 30 minutes.`;
    await d.setStatus('upwork_inbox', false, msg);
    log('upwork', msg);
    return { failed: true };
  }

  const seen = new Set(state.seen || []);
  const fresh = mail.filter((m) => !m.messageId || !seen.has(m.messageId));
  const scorer = d.scorer || (await loadScorer());
  const leads = leadsFromUpwork(fresh, scorer);
  const inserted = leads.length ? await d.insert(leads.map(prepareLead)) : 0;

  const next = { last_checked: new Date().toISOString(), seen: [...seen, ...fresh.map((m) => m.messageId).filter(Boolean)].slice(-SEEN_MAX) };
  if (d.saveState) await d.saveState(next);
  else await setSetting('upwork_state', next);
  await d.setStatus('upwork_inbox', true, `Reading your inbox. Last run: ${fresh.length} new alert emails, ${inserted} new jobs.`);
  return { emails: fresh.length, matched: leads.length, inserted };
}

export const jobs = {};
export const tasks = [makeTask('upwork_inbox', 10 * 60 * 1000, () => runUpwork())];
