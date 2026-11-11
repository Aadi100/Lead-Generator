import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

function imapClient(imap) {
  const c = new ImapFlow({
    host: imap.host, port: Number(imap.port) || 993, secure: imap.secure !== false,
    auth: { user: imap.user, pass: imap.pass }, logger: false,
    connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 60000,
  });
  c.on('error', () => {});
  return c;
}

export const imapReady = (imap) => !!(imap && imap.host && imap.user && imap.pass);

// Read-only: never marks mail as read and never deletes anything.
export async function fetchUpworkMail(imap, since, limit = 60) {
  const c = imapClient(imap);
  await c.connect();
  const sources = [];
  try {
    const lock = await c.getMailboxLock(imap.folder || 'INBOX', { readOnly: true });
    try {
      const uids = (await c.search({ since, from: 'upwork.com' }, { uid: true })) || [];
      const list = uids.slice(-limit);
      for (let i = 0; i < list.length; i += 20) {
        for await (const m of c.fetch(list.slice(i, i + 20).join(','), { source: true, uid: true }, { uid: true })) sources.push(m.source);
      }
    } finally {
      lock.release();
    }
  } finally {
    await c.logout().catch(() => {});
  }
  const out = [];
  for (const s of sources) {
    try {
      const p = await simpleParser(s);
      out.push({ subject: p.subject || '', html: p.html || p.textAsHtml || '', text: p.text || '', date: p.date, messageId: p.messageId || null });
    } catch { /* skip unreadable message */ }
  }
  return out;
}

export async function countUpworkMail(imap, days = 14) {
  const c = imapClient(imap);
  await c.connect();
  try {
    const lock = await c.getMailboxLock(imap.folder || 'INBOX', { readOnly: true });
    try {
      const uids = (await c.search({ since: new Date(Date.now() - days * 86400000), from: 'upwork.com' }, { uid: true })) || [];
      return uids.length;
    } finally {
      lock.release();
    }
  } finally {
    await c.logout().catch(() => {});
  }
}

export function jobsFromEmail(msg, scorer) {
  const html = msg.html || '';
  const jobs = [];
  const re = /<a [^>]*href="(https:\/\/www\.upwork\.com\/(?:jobs|nx\/proposals\/job)[^"]*~[0-9a-f]+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const matches = [...html.matchAll(re)];
  matches.forEach((m, i) => {
    const title = scorer.stripHtml(m[2]).replace(/\s+/g, ' ').trim();
    if (!title || title.length < 6) return;
    const chunk = html.slice(m.index + m[0].length, matches[i + 1] ? matches[i + 1].index : undefined);
    jobs.push({ title, url: m[1].split('?')[0], body: scorer.stripHtml(chunk).slice(0, 3000) });
  });
  if (!jobs.length) jobs.push({ title: msg.subject || 'Upwork job alert', url: 'https://www.upwork.com/nx/find-work/', body: msg.text || scorer.stripHtml(html) });
  return jobs;
}

export function leadsFromUpwork(messages, scorer) {
  const out = [];
  const seen = new Set();
  for (const msg of messages) {
    const when = msg.date ? new Date(msg.date).toISOString() : new Date().toISOString();
    for (const job of jobsFromEmail(msg, scorer)) {
      if (seen.has(job.url) && job.url.includes('~')) continue;
      seen.add(job.url);
      const lead = scorer.buildLead({
        title: job.title, body: job.body, url: job.url, source: 'Upwork', sourceDetail: 'saved-search email',
        author: null, authorInfo: 'Client details are on the Upwork job page', postedAt: when, ctx: { bonus: 8, snippetOnly: true },
      });
      if (!lead.category) continue;
      lead.contact = 'Apply on Upwork';
      out.push(lead);
    }
  }
  return out;
}
