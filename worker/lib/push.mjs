// Web Push to every enabled device. Payloads carry only a short title/body and an in-app URL (no secrets).
import * as webpushLib from 'web-push';
import { sb } from './db.mjs';
import { getSetting } from './settings.mjs';
import { log } from './log.mjs';

export const PUSH_EVENTS = ['new_lead', 'reply', 'task_due', 'send_failed', 'test'];
const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// Strips anything long or odd. `url` must be a path inside the app.
export function buildPayload({ title, body, url = '/', tag, event } = {}) {
  const path = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url.slice(0, 200) : '/';
  return { title: cut(title || 'Lead Radar', 70), body: cut(body, 120), url: path, tag: tag ? cut(tag, 40) : event || undefined, event: event || undefined };
}

// True when a status code means the browser dropped this subscription for good.
export const isGone = (e) => e?.statusCode === 404 || e?.statusCode === 410;

let configured = false;
function configure(lib) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID keys missing (run node scripts/gen-vapid.mjs)');
  lib.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@mail.com', pub, priv);
  configured = true;
}

// deps are injectable for tests: { lib, db, configureFn }
export async function sendPush(payload, deps = {}) {
  const lib = deps.lib || webpushLib;
  const db = deps.db || sb;
  if (!deps.lib && !configured) configure(lib);
  const { data: subs, error } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('enabled', true);
  if (error) throw new Error(`push subscriptions: ${error.message}`);
  const body = JSON.stringify(buildPayload(payload));
  const res = { sent: 0, pruned: 0, failed: 0, errors: [] };
  for (const s of subs || []) {
    try {
      await lib.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: 'normal' });
      res.sent++;
      await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id);
    } catch (e) {
      if (isGone(e)) { res.pruned++; await db.from('push_subscriptions').delete().eq('id', s.id); }
      else { res.failed++; res.errors.push(`${e.statusCode || ''} ${cut(e.message, 100)}`.trim()); }
    }
  }
  return res;
}

// Event-aware helper: respects Settings (master switch + per-event toggles). Never throws.
export async function pushEvent(event, payload) {
  try {
    const cfg = await getSetting('push');
    if (cfg.enabled === false) return null;
    if (event !== 'test' && cfg.events?.[event] === false) return null;
    return await sendPush({ ...payload, event });
  } catch (e) {
    log('push', e.message);
    return null;
  }
}

export async function pushWanted(event) {
  try {
    const cfg = await getSetting('push');
    if (cfg.enabled === false || cfg.events?.[event] === false) return false;
    const { count } = await sb.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('enabled', true);
    return (count || 0) > 0;
  } catch { return false; }
}
