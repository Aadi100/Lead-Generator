import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { configuredChannels, notify, sendOnChannel } from '../lib/notify.mjs';

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
  if (!alerts.enabled) return;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let q = sb.from('leads').select('*').is('alerted_at', null).or('lead_kind.eq.request,and(lead_kind.eq.trade,trade_match.not.is.null)').gte('created_at', since).gte('trust_score', Number(alerts.min_trust) || 70);
  if (alerts.only_non_suspicious !== false) q = q.eq('is_suspicious', false);
  const { data: leads, error } = await q.order('created_at').limit(50);
  if (error) throw new Error(error.message);
  if (!leads?.length) return;

  if (!configuredChannels(alerts).length) {
    if (Date.now() - lastNagAt > 10 * 60 * 1000) { log('alerts', 'alerts are enabled but no channel is configured'); lastNagAt = Date.now(); }
    return;
  }
  const mark = async (ids) => sb.from('leads').update({ alerted_at: new Date().toISOString() }).in('id', ids);

  if (leads.length > 5) {
    const top = leads.slice(0, 10).map((l) => `• ${l.title} (${l.source}, ${l.trust_level} ${l.trust_score})`).join('\n');
    const text = `${leads.length} new high-trust leads:\n${top}${leads.length > 10 ? `\n…and ${leads.length - 10} more` : ''}\n\nDashboard: ${dashboard()}`;
    const r = await notify({ subject: `${leads.length} new leads`, text });
    if (r.sent.length) { await mark(leads.map((l) => l.id)); log('alerts', `digest of ${leads.length} sent via ${r.sent.join(', ')}`); }
    else log('alerts', `digest failed: ${r.errors.join('; ')}`);
    return;
  }
  for (const lead of leads) {
    const r = await notify({ subject: `New lead: ${lead.title}`, text: leadMessage(lead) });
    if (r.sent.length) { await mark([lead.id]); log('alerts', `lead ${lead.id.slice(0, 8)} sent via ${r.sent.join(', ')}`); }
    else log('alerts', `lead ${lead.id.slice(0, 8)} failed: ${r.errors.join('; ')}`);
  }
}

export const tasks = [{ name: 'alerts-scan', everyMs: 30000, initialDelayMs: 8000, run: scan }];

export const jobs = {
  async test_alert(job) {
    const alerts = await getSetting('alerts');
    const want = job.payload?.channel && job.payload.channel !== 'all' ? [job.payload.channel] : ['discord', 'telegram', 'email', 'whatsapp'];
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
