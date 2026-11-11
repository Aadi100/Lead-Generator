// Contacts directory: built client-side from enriched lead columns (no separate table).
import { supabase } from './supabaseClient';
import { hostOf, normalizeLead } from './format';
import type { EmailEntry, EmailStatus, Lead, OutreachStatus } from './types';

export const CONTACT_LEAD_CAP = 2000;

const LEAD_COLUMNS = [
  'id', 'title', 'url', 'source', 'source_detail', 'status', 'created_at', 'posted_at', 'pitched_at', 'replied_at', 'lead_kind',
  'category', 'author', 'contact', 'website', 'company_name', 'owner_name', 'owner_title', 'emails', 'phones', 'socials',
  'best_email', 'best_email_status', 'budget_amount', 'budget', 'fit_score', 'trust_score', 'trust_level', 'game', 'item_type', 'trade_side',
].join(',');

export type OutreachState = 'replied' | 'sent' | 'scheduled' | 'draft' | 'failed' | 'none';
export const OUTREACH_STATE_LABEL: Record<OutreachState, string> = {
  replied: 'Replied',
  sent: 'Sent',
  scheduled: 'Sending soon',
  draft: 'Draft ready',
  failed: 'Send failed',
  none: 'Not contacted',
};
const STATE_RANK: Record<OutreachState, number> = { replied: 5, sent: 4, scheduled: 3, draft: 2, failed: 1, none: 0 };

export function outreachStateOf(status: OutreachStatus | string): OutreachState {
  switch (status) {
    case 'replied':
      return 'replied';
    case 'sent':
      return 'sent';
    case 'queued':
    case 'sending':
    case 'scheduled':
      return 'scheduled';
    case 'draft':
      return 'draft';
    case 'failed':
      return 'failed';
    default:
      return 'none';
  }
}

export type Contact = {
  key: string;
  name: string;
  groupedBy: 'website' | 'company' | 'person';
  host: string | null;
  website: string | null;
  company: string | null;
  owner: string | null;
  ownerTitle: string | null;
  person: string | null;
  emails: EmailEntry[];
  bestEmail: string | null;
  bestEmailStatus: EmailStatus | null;
  phones: string[];
  socials: Record<string, string>;
  leads: Lead[];
  sources: string[];
  statuses: Record<string, number>;
  lastActivity: string;
  outreach: OutreachState;
};

const STATUS_RANK: Record<string, number> = { valid: 6, role: 5, unknown: 4, guessed: 3, no_mx: 2, disposable: 1, invalid_syntax: 0 };

export function isVerified(status: EmailStatus | null): boolean {
  return status === 'valid';
}

function keyFor(l: Lead): { key: string; by: Contact['groupedBy']; host: string | null } | null {
  if (l.website && l.website.trim()) {
    const host = hostOf(l.website.trim()).toLowerCase();
    if (host) return { key: `h:${host}`, by: 'website', host };
  }
  if (l.company_name && l.company_name.trim()) return { key: `c:${l.company_name.trim().toLowerCase()}`, by: 'company', host: null };
  if (l.author && l.author.trim()) return { key: `a:${l.author.trim().toLowerCase()}`, by: 'person', host: null };
  return null;
}

function lastTouch(l: Lead): string {
  const times = [l.replied_at, l.pitched_at, l.created_at].filter((t): t is string => !!t);
  return times.reduce((a, b) => (new Date(b).getTime() > new Date(a).getTime() ? b : a), times[0] ?? l.created_at);
}

export function buildContacts(leads: Lead[], outreachByLead: Map<string, OutreachState>): Contact[] {
  const map = new Map<string, Contact>();
  for (const l of leads) {
    const k = keyFor(l);
    if (!k) continue;
    let c = map.get(k.key);
    if (!c) {
      c = {
        key: k.key,
        name: '',
        groupedBy: k.by,
        host: k.host,
        website: null,
        company: null,
        owner: null,
        ownerTitle: null,
        person: null,
        emails: [],
        bestEmail: null,
        bestEmailStatus: null,
        phones: [],
        socials: {},
        leads: [],
        sources: [],
        statuses: {},
        lastActivity: l.created_at,
        outreach: 'none',
      };
      map.set(k.key, c);
    }
    c.leads.push(l);
    c.website ??= l.website;
    c.company ??= l.company_name;
    c.owner ??= l.owner_name;
    c.ownerTitle ??= l.owner_title;
    c.person ??= l.author;
    for (const e of l.emails) if (!c.emails.some((x) => x.email.toLowerCase() === e.email.toLowerCase())) c.emails.push(e);
    if (l.best_email) {
      const rank = STATUS_RANK[l.best_email_status ?? 'unknown'] ?? 0;
      const cur = c.bestEmailStatus ? STATUS_RANK[c.bestEmailStatus] ?? 0 : -1;
      if (!c.bestEmail || rank > cur) {
        c.bestEmail = l.best_email;
        c.bestEmailStatus = l.best_email_status;
      }
      if (!c.emails.some((x) => x.email.toLowerCase() === l.best_email!.toLowerCase())) c.emails.push({ email: l.best_email, status: l.best_email_status ?? 'unknown', kind: null, source: null });
    }
    for (const p of l.phones) if (!c.phones.includes(p)) c.phones.push(p);
    for (const [name, url] of Object.entries(l.socials)) if (url && !c.socials[name]) c.socials[name] = url;
    if (l.source && !c.sources.includes(l.source)) c.sources.push(l.source);
    c.statuses[l.status] = (c.statuses[l.status] ?? 0) + 1;
    const t = lastTouch(l);
    if (new Date(t).getTime() > new Date(c.lastActivity).getTime()) c.lastActivity = t;
    const st = outreachByLead.get(l.id) ?? 'none';
    if (STATE_RANK[st] > STATE_RANK[c.outreach]) c.outreach = st;
  }
  const out = Array.from(map.values());
  for (const c of out) {
    c.name = c.company || c.host || c.person || 'Unknown';
    if (!c.bestEmail && c.emails[0]) {
      c.bestEmail = c.emails[0].email;
      c.bestEmailStatus = c.emails[0].status;
    }
    c.leads.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return out;
}

export async function fetchContactSources(): Promise<{ leads: Lead[]; outreach: Map<string, OutreachState> }> {
  const [l, o] = await Promise.all([
    supabase.from('leads').select(LEAD_COLUMNS).order('created_at', { ascending: false }).limit(CONTACT_LEAD_CAP),
    supabase.from('outreach').select('lead_id,status').order('created_at', { ascending: false }).limit(CONTACT_LEAD_CAP),
  ]);
  if (l.error) throw new Error(l.error.message);
  const leads = ((l.data ?? []) as unknown as Record<string, unknown>[]).map(normalizeLead);
  const outreach = new Map<string, OutreachState>();
  if (!o.error) {
    for (const r of (o.data ?? []) as { lead_id: string; status: string }[]) {
      const st = outreachStateOf(r.status);
      const prev = outreach.get(r.lead_id) ?? 'none';
      if (STATE_RANK[st] > STATE_RANK[prev]) outreach.set(r.lead_id, st);
    }
  }
  return { leads, outreach };
}

export type ContactSort = 'recent' | 'leads' | 'name';

export type ContactFilters = { q: string; hasEmail: boolean; verified: boolean; source: string; status: string; sort: ContactSort };

export function filterContacts(list: Contact[], f: ContactFilters): Contact[] {
  const q = f.q.trim().toLowerCase();
  const out = list.filter((c) => {
    if (f.hasEmail && !c.bestEmail) return false;
    if (f.verified && !(c.bestEmailStatus === 'valid' || c.emails.some((e) => e.status === 'valid'))) return false;
    if (f.source && !c.sources.includes(f.source)) return false;
    if (f.status && !(c.statuses[f.status] > 0)) return false;
    if (q) {
      const hay = [c.name, c.host, c.company, c.owner, c.person, c.bestEmail, ...c.phones, ...c.emails.map((e) => e.email)].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (f.sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  else if (f.sort === 'leads') out.sort((a, b) => b.leads.length - a.leads.length || new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  else out.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  return out;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function contactsToCsv(list: Contact[]): string {
  const head = ['Name', 'Website', 'Company', 'Owner', 'Owner title', 'Best email', 'Email status', 'All emails', 'Phones', 'Socials', 'Leads', 'Statuses', 'Sources', 'Outreach', 'Last activity'];
  const rows = list.map((c) => [
    c.name,
    c.website ?? '',
    c.company ?? '',
    c.owner ?? '',
    c.ownerTitle ?? '',
    c.bestEmail ?? '',
    c.bestEmailStatus ?? '',
    c.emails.map((e) => e.email).join('; '),
    c.phones.join('; '),
    Object.entries(c.socials).map(([k, v]) => `${k}: ${v}`).join('; '),
    c.leads.length,
    Object.entries(c.statuses).map(([k, v]) => `${k} ${v}`).join('; '),
    c.sources.join('; '),
    OUTREACH_STATE_LABEL[c.outreach],
    c.lastActivity,
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Call from a click handler. Creates a Blob and clicks a temporary anchor. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
