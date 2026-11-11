import nodemailer from 'nodemailer';
import { getSetting } from './settings.mjs';
import { domainOfEmail } from './util.mjs';

export async function sendMail({ to, subject, text, fromName, fromEmail, replyTo, headers, messageId }) {
  const sending = await getSetting('sending');
  const provider = sending.provider;
  const email = fromEmail || sending.from_email;
  const name = fromName ?? sending.from_name ?? '';
  if (!email) throw new Error('No "from" email set (Settings > Email sending)');
  const from = name ? `"${String(name).replace(/"/g, '')}" <${email}>` : email;
  const reply = replyTo || sending.reply_to || undefined;

  if (provider === 'smtp') {
    const smtp = await getSetting('smtp');
    if (!smtp.host) throw new Error('SMTP host is empty (Settings > Email sending)');
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port) || 587,
      secure: !!smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
    const info = await transporter.sendMail({
      from, to, subject, text, replyTo: reply, headers,
      messageId: messageId || `<lr.${Date.now()}.${Math.random().toString(36).slice(2)}@${domainOfEmail(email) || 'localhost'}>`,
    });
    transporter.close();
    return { provider: 'smtp', messageId: info.messageId };
  }

  if (provider === 'resend') {
    const resend = await getSetting('resend');
    if (!resend.api_key) throw new Error('Resend API key is empty (Settings > Email sending)');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resend.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, reply_to: reply, headers }),
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend: ${json.message || json.error || res.status}`);
    return { provider: 'resend', messageId: json.id };
  }

  throw new Error('No email provider configured (Settings > Email sending)');
}
