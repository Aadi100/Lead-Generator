import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { configuredChannels, notify, sendOnChannel } from '../lib/notify.mjs';
import { pushEvent, pushWanted } from '../lib/push.mjs';

const dashboard = () => process.env.DASHBOARD_URL || 'http://localhost:3000';
let lastNagAt = 0;

export function leadMessage(lead) {
  const where = [lead.source, lead.source_detail].filter(Boolean).join(' / ');
  const meta = [where, lead.category, lead.budget && lead.budget !== 'TBD' ? lead.budget : null].filter(Boolean).join(' · ');
  const lines = [lead.trade_match, lead.title, meta, `Trust: ${lead.trust_level || '?'} (${lead.trust_score ?? '?'})${lead.fit_score != null ? ` · Match: ${lead.fit_score}` : ''}`];
  if (/^https?:\/\//i.test(lead.url || '')) lines.push(lead.url);
  lines.push(`Dashboard: ${dashboard()}`);
  return lines.filter(Boolean).join('\n');
}

async function scan() {
  const alerts = await getSetting('alerts');
  const pushOn = await pushWanted('new_lead');
  if (!alerts.enabled && !pushOn) return;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let q = sb.from('leads').select('*').is('alerted_at', null).or('lead_kind.eq.request,and(lead_kind.eq.trade,trade_match.not.is.null)').gte('created_at', since).gte('trust_score', Number(alerts.min_trust) || 70);
  if (alerts.only_non_suspicious !== false) q = q.eq('is_suspicious', false);
  const { data: leads, error } = await q.order('created_at').limit(50);
  if (error) throw new Error(error.message);
  if (!leads?.length) return;

  if (!(alerts.enabled && configuredChannels(alerts).length) && !pushOn) {
    if (Date.now() - lastNagAt > 10 * 60 * 1000) { log('alerts', 'alerts are enabled but no channel is configured'); lastNagAt = Date.now(); }
    return;
  }
  const send = (m) => (alerts.enabled && configuredChannels(alerts).length ? notify(m) : Promise.resolve({ sent: [], errors: [] }));
  const mark = async (ids) => sb.from('leads').update({ alerted_at: new Date().toISOString() }).in('id', ids);

  if (leads.length > 5) {
    const top = leads.slice(0, 10).map((l) => `• ${l.title} (${l.source}, ${l.trust_level} ${l.trust_score})`).join('\n');
    const text = `${leads.length} new high-trust leads:\n${top}${leads.length > 10 ? `\n…and ${leads.length - 10} more` : ''}\n\nDashboard: ${dashboard()}`;
    const r = await send({ subject: `${leads.length} new leads`, text });
    const p = pushOn ? await pushEvent('new_lead', { title: `${leads.length} new strong leads`, body: leads.slice(0, 3).map((l) => l.title).join(' · '), url: '/leads', tag: 'new-leads' }) : null;
    if (p?.sent) r.sent.push('push');
    if (r.sent.length) { await mark(leads.map((l) => l.id)); log('alerts', `digest of ${leads.length} sent via ${r.sent.join(', ')}`); }
    else log('alerts', `digest failed: ${r.errors.join('; ')}`);
    return;
  }
  for (const lead of leads) {
    const r = await send({ subject: `New lead: ${lead.title}`, text: leadMessage(lead) });
    const p = pushOn ? await pushEvent('new_lead', { title: 'New lead', body: lead.title, url: `/leads?lead=${lead.id}`, tag: `lead-${lead.id}` }) : null;
    if (p?.sent) r.sent.push('push');
    if (r.sent.length) { await mark([lead.id]); log('alerts', `lead ${lead.id.slice(0, 8)} sent via ${r.sent.join(', ')}`); }
    else log('alerts', `lead ${lead.id.slice(0, 8)} failed: ${r.errors.join('; ')}`);
  }
}

// Tasks that just became due. Remembered in memory so one task pushes once per worker run.
const pushedTasks = new Set();
async function taskDueScan() {
  if (!(await pushWanted('task_due'))) return;
  const now = Date.now();
  const { data } = await sb.from('tasks').select('id,title,due_at').eq('done', false).lte('due_at', new Date(now).toISOString()).gte('due_at', new Date(now - 6 * 3600 * 1000).toISOString()).limit(10);
  for (const t of data || []) {
    if (pushedTasks.has(t.id)) continue;
    pushedTasks.add(t.id);
    await pushEvent('task_due', { title: 'Task due', body: t.title, url: '/tasks', tag: `task-${t.id}` });
  }
}

export const tasks = [
  { name: 'alerts-scan', everyMs: 30000, initialDelayMs: 8000, run: scan },
  { name: 'push-task-due', everyMs: 60000, initialDelayMs: 20000, run: taskDueScan },
];

export const jobs = {
  async push_test() {
    const r = await pushEvent('test', { title: 'Lead Radar', body: 'Test notification. Push works on this device.', url: '/settings?tab=appearance', tag: 'push-test' });
    if (!r) throw new Error('Push is switched off in Settings, or the worker could not send.');
    if (!r.sent && !r.pruned && !r.failed) throw new Error('No device is subscribed yet. Enable notifications on a device first.');
    return r;
  },
  // Queued by the n8n daily summary and failure-alert workflows.
  async send_alert(job) {
    const { subject, text } = job.payload || {};
    if (!text) throw new Error('send_alert needs some text');
    const r = await notify({ subject: subject || 'Lead Radar', text: String(text) });
    if (!r.sent.length) throw new Error(r.errors.join('; ') || 'No alert channel is set up (Settings > Alerts)');
    return r;
  },
  async test_alert(job) {
    const alerts = await getSetting('alerts');
    const want = job.payload?.channel && job.payload.channel !== 'all' ? [job.payload.channel] : ['email', 'whatsapp'];
    const configured = configuredChannels(alerts);
    const results = {};
    for (const ch of want) {
      if (!configured.includes(ch)) { results[ch] = { ok: false, error: 'not configured' }; continue; }
      try {
        await sendOnChannel(ch, alerts, { subject: 'Lead Radar test alert', text: 'This is a test alert from Lead Radar. If you can read this, alerts work.' });
        results[ch] = { ok: true };
      } catch (e) {
        results[ch] = { ok: false, error: e.message };
      }
    }
    return { results };
  },
};
