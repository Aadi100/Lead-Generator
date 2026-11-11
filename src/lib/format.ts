import {
  STATUSES,
  type EmailEntry,
  type EmailKind,
  type EmailStatus,
  type EnrichStatus,
  type Lead,
  type SiteSignals,
  type Status,
  type TrustLevel,
} from './types';

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t || (t[0] !== '[' && t[0] !== '{')) return v;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return v;
  }
}

export function strArray(v: unknown): string[] {
  const parsed = parseJson(v);
  if (Array.isArray(parsed)) {
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  }
  if (typeof parsed === 'string' && parsed.trim() !== '') return [parsed];
  return [];
}

const EMAIL_STATUSES: EmailStatus[] = ['valid', 'role', 'guessed', 'no_mx', 'disposable', 'invalid_syntax', 'unknown'];
const EMAIL_KINDS: EmailKind[] = ['provided', 'personal', 'role', 'guessed'];
const ENRICH_STATUSES: EnrichStatus[] = ['pending', 'running', 'done', 'failed', 'skipped'];

function emailEntries(v: unknown): EmailEntry[] {
  const parsed = parseJson(v);
  if (!Array.isArray(parsed)) return [];
  const out: EmailEntry[] = [];
  for (const item of parsed) {
    if (typeof item === 'string' && item.includes('@')) {
      out.push({ email: item, status: 'unknown', kind: null, source: null });
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const email = str(o.email);
      if (!email) continue;
      out.push({
        email,
        status: EMAIL_STATUSES.includes(o.status as EmailStatus) ? (o.status as EmailStatus) : 'unknown',
        kind: EMAIL_KINDS.includes(o.kind as EmailKind) ? (o.kind as EmailKind) : null,
        source: str(o.source),
      });
    }
  }
  return out;
}

function socialMap(v: unknown): Record<string, string> {
  const parsed = parseJson(v);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof val === 'string' && /^https?:\/\//i.test(val)) out[k] = val;
  }
  return out;
}

function signals(v: unknown): SiteSignals {
  const parsed = parseJson(v);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const o = parsed as Record<string, unknown>;
  const out: SiteSignals = {};
  if (typeof o.reachable === 'boolean') out.reachable = o.reachable;
  if (num(o.status_code) !== null) out.status_code = num(o.status_code) as number;
  if (str(o.final_url)) out.final_url = o.final_url as string;
  if (str(o.platform)) out.platform = o.platform as string;
  if (typeof o.https === 'boolean') out.https = o.https;
  if (typeof o.mobile_viewport === 'boolean') out.mobile_viewport = o.mobile_viewport;
  if (num(o.copyright_year) !== null) out.copyright_year = num(o.copyright_year) as number;
  if (typeof o.has_contact_form === 'boolean') out.has_contact_form = o.has_contact_form;
  if (typeof o.has_blog === 'boolean') out.has_blog = o.has_blog;
  if (str(o.title)) out.title = o.title as string;
  if (str(o.description)) out.description = o.description as string;
  if (num(o.load_ms) !== null) out.load_ms = num(o.load_ms) as number;
  if (Array.isArray(o.issues)) out.issues = strArray(o.issues);
  return out;
}

export function normalizeLead(raw: Record<string, unknown>): Lead {
  const rawStatus = raw.status === 'Closed' ? 'Won' : raw.status;
  const status = STATUSES.includes(rawStatus as Status) ? (rawStatus as Status) : 'New';
  const level: TrustLevel | null =
    raw.trust_level === 'High' || raw.trust_level === 'Medium' || raw.trust_level === 'Low'
      ? raw.trust_level
      : null;
  const score = num(raw.trust_score);
  const fit = num(raw.fit_score);
  const bestStatus = EMAIL_STATUSES.includes(raw.best_email_status as EmailStatus)
    ? (raw.best_email_status as EmailStatus)
    : null;

  return {
    id: String(raw.id ?? ''),
    title: str(raw.title) ?? 'Untitled lead',
    description: str(raw.description),
    budget: str(raw.budget),
    url: typeof raw.url === 'string' ? raw.url : '',
    source: str(raw.source) ?? 'Unknown',
    source_detail: str(raw.source_detail),
    type: str(raw.type) ?? 'Outbound',
    status,
    created_at: str(raw.created_at) ?? new Date().toISOString(),
    category: str(raw.category),
    categories: strArray(raw.categories),
    tags: strArray(raw.tags),
    author: str(raw.author),
    author_info: str(raw.author_info),
    contact: str(raw.contact),
    budget_amount: num(raw.budget_amount),
    posted_at: str(raw.posted_at),
    trust_score: score === null ? null : Math.max(0, Math.min(100, score)),
    trust_level: level,
    is_suspicious: raw.is_suspicious === true,
    flags: strArray(raw.flags),
    notes: str(raw.notes),
    lead_kind: raw.lead_kind === 'prospect' ? 'prospect' : raw.lead_kind === 'trade' ? 'trade' : 'request',
    enrich_status: ENRICH_STATUSES.includes(raw.enrich_status as EnrichStatus) ? (raw.enrich_status as EnrichStatus) : null,
    enriched_at: str(raw.enriched_at),
    enrich_error: str(raw.enrich_error),
    website: str(raw.website),
    company_name: str(raw.company_name),
    owner_name: str(raw.owner_name),
    owner_title: str(raw.owner_title),
    emails: emailEntries(raw.emails),
    phones: strArray(raw.phones),
    socials: socialMap(raw.socials),
    site_signals: signals(raw.site_signals),
    opportunity: str(raw.opportunity),
    best_email: str(raw.best_email),
    best_email_status: bestStatus,
    fit_score: fit === null ? null : Math.max(1, Math.min(99, Math.round(fit))),
    fit_reasons: strArray(raw.fit_reasons),
    pitched_at: str(raw.pitched_at),
    replied_at: str(raw.replied_at),
    outcome_note: str(raw.outcome_note),
    trade_side: raw.trade_side === 'buyer' || raw.trade_side === 'seller' ? raw.trade_side : null,
    game: str(raw.game),
    item_type: str(raw.item_type),
    trade_match: str(raw.trade_match),
  };
}

export const ITEM_TYPE_LABEL: Record<string, string> = {
  account: 'Accounts',
  boosting: 'Boosting',
  'top-up': 'Top-ups',
  currency: 'In-game currency',
  items: 'Items and skins',
  keys: 'Keys and gift cards',
  other: 'Other',
};

export function itemLabel(t: string | null): string {
  if (!t) return '';
  return ITEM_TYPE_LABEL[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function isFlagged(lead: Lead): boolean {
  return lead.is_suspicious || lead.trust_level === 'Low';
}

export function displayDate(lead: Lead): string {
  return lead.posted_at ?? lead.created_at;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

export function timeUntil(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.round((then - now) / 1000);
  if (secs <= 30) return 'any moment now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

const NOT_STATED = new Set(['', 'tbd', 'check description', 'n/a', 'na', 'none', 'unknown', '-', 'not stated']);

export function budgetLabel(lead: Lead): string | null {
  const text = (lead.budget ?? '').trim();
  if (text && !NOT_STATED.has(text.toLowerCase())) return text;
  if (lead.budget_amount !== null && lead.budget_amount > 0) {
    return `$${Math.round(lead.budget_amount).toLocaleString('en-US')}`;
  }
  return null;
}

export type ContactItem = { label: string | null; value: string };

export function splitContact(contact: string | null): ContactItem[] {
  if (!contact) return [];
  return contact
    .split(/\s·\s|\s\|\s|;\s*|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^([A-Za-z][A-Za-z ]{1,18}):\s+(\S.*)$/);
      return m ? { label: m[1], value: m[2] } : { label: null, value: part };
    });
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export const EMAIL_STATUS_INFO: Record<EmailStatus, { label: string; tone: string; usable: boolean }> = {
  valid: { label: 'Verified domain', tone: 'bg-success-soft text-success ring-success-border', usable: true },
  role: { label: 'Shared inbox', tone: 'bg-warning-soft text-warning ring-warning-border', usable: true },
  guessed: { label: 'Guessed, not checked', tone: 'bg-warning-soft text-warning ring-warning-border', usable: true },
  no_mx: { label: 'No mail server', tone: 'bg-danger-soft text-danger ring-danger-border', usable: false },
  disposable: { label: 'Throwaway address', tone: 'bg-danger-soft text-danger ring-danger-border', usable: false },
  invalid_syntax: { label: 'Not a valid address', tone: 'bg-danger-soft text-danger ring-danger-border', usable: false },
  unknown: { label: 'Not checked', tone: 'bg-surface-2 text-fg-muted ring-border', usable: true },
};

export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}
