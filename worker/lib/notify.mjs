import { getSetting } from './settings.mjs';
import { sendMail } from './mailer.mjs';
import { truncate } from './util.mjs';

const TIMEOUT = 15000;

export async function sendTelegram(tg, text) {
  const res = await fetch(`https://api.telegram.org/bot${tg.bot_token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: tg.chat_id, text: truncate(text, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(`Telegram: ${json.description || res.status}`);
}

export async function sendWhatsapp(wa, text) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(wa.phone)}&text=${encodeURIComponent(truncate(text, 900))}&apikey=${encodeURIComponent(wa.apikey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  const body = await res.text();
  if (!res.ok || /error|invalid|not (found|authori)/i.test(body.slice(0, 300))) throw new Error(`WhatsApp (CallMeBot): ${body.replace(/<[^>]+>/g, ' ').trim().slice(0, 140) || res.status}`);
}

export async function sendEmailAlert(to, subject, text) {
  await sendMail({ to, subject, text });
}

export async function sendDiscord(dc, text) {
  const res = await fetch(dc.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: truncate(text, 1900), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord: ${body.slice(0, 120) || res.status}`);
  }
}

export function configuredChannels(alerts) {
  const out = [];
  if (/^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/webhooks\//i.test(alerts.discord?.webhook_url || '')) out.push('discord');
  if (alerts.telegram?.bot_token && alerts.telegram?.chat_id) out.push('telegram');
  if (alerts.email?.to) out.push('email');
  if (alerts.whatsapp?.phone && alerts.whatsapp?.apikey) out.push('whatsapp');
  return out;
}

function chatText(subject, text) {
  const [first, ...rest] = String(text || '').split('\n');
  if (subject && first.trim() && subject.includes(first.trim())) return [subject, ...rest].join('\n');
  return subject ? `${subject}\n\n${text}` : String(text || '');
}

export async function sendOnChannel(channel, alerts, { subject, text }) {
  if (channel === 'telegram') return sendTelegram(alerts.telegram, chatText(subject, text));
  if (channel === 'whatsapp') return sendWhatsapp(alerts.whatsapp, chatText(subject, text));
  if (channel === 'discord') return sendDiscord(alerts.discord, chatText(subject, text));
  if (channel === 'email') return sendEmailAlert(alerts.email.to, subject, text);
  throw new Error(`Unknown channel ${channel}`);
}

export async function notify({ subject, text }) {
  const sent = [];
  const errors = [];
  let alerts;
  try {
    alerts = await getSetting('alerts');
  } catch (e) {
    return { sent, errors: [`Could not read alert settings: ${e.message}`] };
  }
  const channels = configuredChannels(alerts);
  if (!channels.length) return { sent, errors: ['No alert channel is configured (Settings > Alerts)'] };
  for (const ch of channels) {
    try {
      await sendOnChannel(ch, alerts, { subject: subject || 'Lead Radar', text: text || '' });
      sent.push(ch);
    } catch (e) {
      errors.push(`${ch}: ${e.message}`);
    }
  }
  return { sent, errors };
}
