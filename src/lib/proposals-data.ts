// Proposal & quote builder: types, loading/saving, totals, prefill from a lead or deal, plain-text export.
import { supabase } from './supabaseClient';
import { normalizeLead } from './format';
import { createDeal, updateDeal, EMPTY_INPUT, inputFromDeal } from './deals-data';
import { normalizeDeal, type Deal } from './types-platform';
import { CATEGORIES, type Lead } from './types';

export type PackageCategory = (typeof CATEGORIES)[number];
export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
export const PROPOSAL_STATUSES: ProposalStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired'];
export const STATUS_LABEL: Record<ProposalStatus, string> = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };

export type LineItem = { label: string; price: number };

export type Package = {
  id: string;
  name: string;
  description: string;
  category: PackageCategory;
  base_price: number;
  currency: string;
  timeline_days: number | null;
  deliverables: string[];
  active: boolean;
  sort: number;
};

export type Proposal = {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  package_id: string | null;
  title: string;
  client_name: string;
  client_email: string;
  summary: string;
  scope: LineItem[];
  total: number;
  currency: string;
  timeline_days: number | null;
  valid_until: string | null;
  terms: string;
  status: ProposalStatus;
  sent_at: string | null;
  accepted_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ProposalSettings = {
  business_name: string;
  your_name: string;
  email: string;
  website: string;
  phone: string;
  payment_terms: string;
  validity_days: number;
  terms: string;
  currency: string;
};

export const DEFAULT_PROPOSAL_SETTINGS: ProposalSettings = {
  business_name: '',
  your_name: '',
  email: '',
  website: '',
  phone: '',
  payment_terms: '50% to start, 50% on delivery',
  validity_days: 14,
  terms: 'Prices exclude hosting, domains and third party fees unless listed. Changes outside the scope above are quoted separately. Work starts once this proposal is accepted and the first payment is received.',
  currency: 'USD',
};

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const strN = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown, d = 0): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : d;
};
const numN = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};

export function normalizePackage(r: Record<string, unknown>): Package {
  const cat = CATEGORIES.find((c) => c === r.category) ?? 'Other';
  return {
    id: String(r.id ?? ''),
    name: str(r.name, 'Untitled package'),
    description: str(r.description),
    category: cat,
    base_price: num(r.base_price),
    currency: str(r.currency, 'USD') || 'USD',
    timeline_days: numN(r.timeline_days),
    deliverables: Array.isArray(r.deliverables) ? r.deliverables.filter((x): x is string => typeof x === 'string') : [],
    active: r.active !== false,
    sort: num(r.sort),
  };
}

export function normalizeProposal(r: Record<string, unknown>): Proposal {
  const now = new Date().toISOString();
  const status = PROPOSAL_STATUSES.find((s) => s === r.status) ?? 'draft';
  const scope = Array.isArray(r.scope)
    ? r.scope.map((x) => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        return { label: str(o.label), price: num(o.price) };
      })
    : [];
  return {
    id: String(r.id ?? ''),
    lead_id: strN(r.lead_id),
    deal_id: strN(r.deal_id),
    package_id: strN(r.package_id),
    title: str(r.title, 'Untitled proposal'),
    client_name: str(r.client_name),
    client_email: str(r.client_email),
    summary: str(r.summary),
    scope,
    total: num(r.total),
    currency: str(r.currency, 'USD') || 'USD',
    timeline_days: numN(r.timeline_days),
    valid_until: strN(r.valid_until),
    terms: str(r.terms),
    status,
    sent_at: strN(r.sent_at),
    accepted_at: strN(r.accepted_at),
    notes: str(r.notes),
    created_at: str(r.created_at, now),
    updated_at: str(r.updated_at, now),
  };
}

// ---------- settings (app_settings key "proposal_settings", defaults come from the profile) ----------

export async function loadProposalSettings(): Promise<{ value: ProposalSettings; stored: boolean; error: string | null }> {
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', ['proposal_settings', 'profile']);
  const rows = (data ?? []) as { key: string; value: Record<string, unknown> }[];
  const own = rows.find((r) => r.key === 'proposal_settings')?.value ?? null;
  const prof = rows.find((r) => r.key === 'profile')?.value ?? {};
  const websites = Array.isArray(prof.websites) ? (prof.websites as unknown[]).filter((w): w is string => typeof w === 'string') : [];
  const fromProfile: Partial<ProposalSettings> = {
    business_name: str(prof.business_name) || str(prof.your_name),
    your_name: str(prof.your_name),
    email: str(prof.email),
    website: websites[0] ?? '',
  };
  const o = own ?? {};
  const pick = (k: keyof ProposalSettings): string => {
    const v = str(o[k]);
    return v !== '' ? v : str(fromProfile[k]) || String(DEFAULT_PROPOSAL_SETTINGS[k]);
  };
  const value: ProposalSettings = {
    business_name: str(o.business_name) || fromProfile.business_name || '',
    your_name: str(o.your_name) || fromProfile.your_name || '',
    email: str(o.email) || fromProfile.email || '',
    website: str(o.website) || fromProfile.website || '',
    phone: str(o.phone),
    payment_terms: own && 'payment_terms' in own ? str(o.payment_terms) : DEFAULT_PROPOSAL_SETTINGS.payment_terms,
    validity_days: Math.max(1, Math.round(num(o.validity_days, DEFAULT_PROPOSAL_SETTINGS.validity_days))),
    terms: own && 'terms' in own ? str(o.terms) : DEFAULT_PROPOSAL_SETTINGS.terms,
    currency: (pick('currency') || 'USD').toUpperCase().slice(0, 6),
  };
  return { value, stored: !!own, error: error?.message ?? null };
}

export async function saveProposalSettings(v: ProposalSettings): Promise<string | null> {
  const clean: ProposalSettings = {
    ...v,
    validity_days: Math.max(1, Math.round(Number(v.validity_days) || 14)),
    currency: (v.currency.trim() || 'USD').toUpperCase().slice(0, 6),
  };
  const { error } = await supabase.from('app_settings').upsert({ key: 'proposal_settings', value: clean, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}

// ---------- packages ----------

export async function fetchPackages(): Promise<Package[]> {
  const { data, error } = await supabase.from('proposal_packages').select('*').order('sort').order('created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizePackage);
}

export async function savePackage(p: Package): Promise<{ pkg: Package | null; error: string | null }> {
  const row = {
    name: p.name.trim() || 'Untitled package',
    description: p.description.trim() || null,
    category: p.category,
    base_price: Number.isFinite(p.base_price) ? p.base_price : 0,
    currency: (p.currency.trim() || 'USD').toUpperCase().slice(0, 6),
    timeline_days: p.timeline_days,
    deliverables: p.deliverables.map((d) => d.trim()).filter(Boolean),
    active: p.active,
    sort: p.sort,
    updated_at: new Date().toISOString(),
  };
  const q = p.id ? supabase.from('proposal_packages').update(row).eq('id', p.id) : supabase.from('proposal_packages').insert(row);
  const { data, error } = await q.select('*').single();
  if (error || !data) return { pkg: null, error: error?.message ?? 'Could not save' };
  return { pkg: normalizePackage(data as Record<string, unknown>), error: null };
}

export async function deletePackage(id: string): Promise<string | null> {
  const { error } = await supabase.from('proposal_packages').delete().eq('id', id);
  return error ? error.message : null;
}

// ---------- proposals ----------

export const PROPOSAL_CAP = 1000;

export async function fetchProposals(): Promise<Proposal[]> {
  const { data, error } = await supabase.from('proposals').select('*').order('created_at', { ascending: false }).limit(PROPOSAL_CAP);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeProposal);
}

export async function fetchProposal(id: string): Promise<Proposal | null> {
  const { data, error } = await supabase.from('proposals').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeProposal(data as Record<string, unknown>) : null;
}

export type ProposalDraft = Omit<Proposal, 'id' | 'created_at' | 'updated_at' | 'sent_at' | 'accepted_at' | 'status'> & { status?: ProposalStatus };

export function rowOf(p: Partial<Proposal>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    r[k] = v;
  };
  if (p.lead_id !== undefined) set('lead_id', p.lead_id);
  if (p.deal_id !== undefined) set('deal_id', p.deal_id);
  if (p.package_id !== undefined) set('package_id', p.package_id);
  if (p.title !== undefined) set('title', p.title.trim() || 'Untitled proposal');
  if (p.client_name !== undefined) set('client_name', p.client_name.trim() || null);
  if (p.client_email !== undefined) set('client_email', p.client_email.trim() || null);
  if (p.summary !== undefined) set('summary', p.summary.trim() || null);
  if (p.scope !== undefined) set('scope', p.scope.map((i) => ({ label: i.label.trim(), price: Number.isFinite(i.price) ? i.price : 0 })).filter((i) => i.label || i.price));
  if (p.scope !== undefined) set('total', totalOf(p.scope));
  if (p.currency !== undefined) set('currency', (p.currency.trim() || 'USD').toUpperCase().slice(0, 6));
  if (p.timeline_days !== undefined) set('timeline_days', p.timeline_days);
  if (p.valid_until !== undefined) set('valid_until', p.valid_until || null);
  if (p.terms !== undefined) set('terms', p.terms.trim() || null);
  if (p.status !== undefined) set('status', p.status);
  if (p.sent_at !== undefined) set('sent_at', p.sent_at);
  if (p.accepted_at !== undefined) set('accepted_at', p.accepted_at);
  if (p.notes !== undefined) set('notes', p.notes.trim() || null);
  r.updated_at = new Date().toISOString();
  return r;
}

export async function createProposal(d: ProposalDraft): Promise<{ proposal: Proposal | null; error: string | null }> {
  const { data, error } = await supabase.from('proposals').insert({ ...rowOf(d), status: d.status ?? 'draft' }).select('*').single();
  if (error || !data) return { proposal: null, error: error?.message ?? 'Could not create the proposal' };
  return { proposal: normalizeProposal(data as Record<string, unknown>), error: null };
}

export async function updateProposal(id: string, patch: Partial<Proposal>): Promise<{ proposal: Proposal | null; error: string | null }> {
  const { data, error } = await supabase.from('proposals').update(rowOf(patch)).eq('id', id).select('*').single();
  if (error || !data) return { proposal: null, error: error?.message ?? 'Could not save' };
  return { proposal: normalizeProposal(data as Record<string, unknown>), error: null };
}

export async function deleteProposal(id: string): Promise<string | null> {
  const { error } = await supabase.from('proposals').delete().eq('id', id);
  return error ? error.message : null;
}

// ---------- numbers ----------

/** Sum of all line items. A negative price is a discount. */
export function totalOf(items: LineItem[]): number {
  return Math.round(items.reduce((s, i) => s + (Number.isFinite(i.price) ? i.price : 0), 0) * 100) / 100;
}

/** Split scope into priced/included lines and one combined discount (positive number). */
export function splitScope(items: LineItem[]): { lines: LineItem[]; discount: number } {
  const lines = items.filter((i) => i.price >= 0);
  const discount = -items.filter((i) => i.price < 0).reduce((s, i) => s + i.price, 0);
  return { lines, discount };
}

export function joinScope(lines: LineItem[], discount: number): LineItem[] {
  const out = lines.slice();
  if (discount > 0) out.push({ label: 'Discount', price: -discount });
  return out;
}

export function money(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${Math.round(n * 100) / 100}`;
  }
}

/** Like money(), but safe for the PDF's built-in fonts (no symbols they cannot draw). */
export function moneyPdf(n: number, currency = 'USD'): string {
  const symbolOk = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD'].includes(currency);
  try {
    const s = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: symbolOk ? 'narrowSymbol' : 'code', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
    return s.replace(/ /g, ' ');
  } catch {
    return `${currency} ${Math.round(n * 100) / 100}`;
  }
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** What the list shows: a sent proposal whose validity date has passed reads as expired. */
export function effectiveStatus(p: Pick<Proposal, 'status' | 'valid_until'>): ProposalStatus {
  if (p.status === 'sent' && p.valid_until && p.valid_until < todayIso()) return 'expired';
  return p.status;
}

export function timelineText(days: number | null): string {
  if (!days || days <= 0) return '';
  if (days % 7 === 0 && days >= 14) return `${days / 7} weeks`;
  return `${days} day${days === 1 ? '' : 's'}`;
}

// ---------- document model shared by preview, PDF and text ----------

export type ProposalDoc = {
  business: { name: string; person: string; email: string; website: string; phone: string };
  title: string;
  clientName: string;
  clientEmail: string;
  dateLabel: string;
  summary: string;
  lines: LineItem[];
  discount: number;
  total: number;
  currency: string;
  timeline: string;
  validUntil: string;
  paymentTerms: string;
  terms: string;
};

export function buildDoc(p: Proposal | (Partial<Proposal> & Pick<Proposal, 'scope' | 'currency'>), s: ProposalSettings): ProposalDoc {
  const { lines, discount } = splitScope(p.scope);
  return {
    business: { name: s.business_name || s.your_name || 'Your business', person: s.business_name && s.your_name ? s.your_name : '', email: s.email, website: s.website, phone: s.phone },
    title: p.title || 'Proposal',
    clientName: p.client_name ?? '',
    clientEmail: p.client_email ?? '',
    dateLabel: fmtDate(todayIso()),
    summary: p.summary ?? '',
    lines,
    discount,
    total: totalOf(p.scope),
    currency: p.currency,
    timeline: timelineText(p.timeline_days ?? null),
    validUntil: fmtDate(p.valid_until ?? null),
    paymentTerms: s.payment_terms,
    terms: p.terms ?? '',
  };
}

export function docToText(d: ProposalDoc): string {
  const out: string[] = [];
  out.push(d.title);
  if (d.clientName) out.push(`For: ${d.clientName}`);
  out.push('');
  if (d.summary.trim()) out.push(d.summary.trim(), '');
  out.push('What is included');
  for (const l of d.lines) out.push(l.price > 0 ? `- ${l.label}: ${money(l.price, d.currency)}` : `- ${l.label}`);
  if (d.discount > 0) out.push(`- Discount: -${money(d.discount, d.currency)}`);
  out.push('', `Total: ${money(d.total, d.currency)}`);
  if (d.timeline) out.push(`Timeline: ${d.timeline}`);
  if (d.paymentTerms.trim()) out.push(`Payment: ${d.paymentTerms.trim()}`);
  if (d.validUntil) out.push(`Valid until: ${d.validUntil}`);
  if (d.terms.trim()) out.push('', d.terms.trim());
  const sign = [d.business.person || d.business.name, d.business.email, d.business.website].filter(Boolean).join(' | ');
  if (sign) out.push('', sign);
  return out.join('\n');
}

// ---------- prefill ----------

export function guessCategory(text: string): PackageCategory {
  const t = text.toLowerCase();
  if (/\b(automat|zapier|n8n|workflow|integrat|scrap|bot)\w*/.test(t)) return 'Automation';
  if (/\b(logo|brand|graphic|design|poster|flyer|banner|illustrat|figma|ui\b|ux\b)/.test(t) && !/\bweb(site)?\b/.test(t)) return 'Design';
  if (/\b(app|ios|android|mobile|saas|react native|flutter|mvp)\b/.test(t)) return 'App';
  if (/\b(web|site|wordpress|shopify|landing|ecommerce|e-commerce|wix|webflow)/.test(t)) return 'Website';
  return 'Other';
}

export function pickPackage(packages: Package[], category: string | null, text: string): Package | null {
  const active = packages.filter((p) => p.active);
  const cat = (CATEGORIES.find((c) => c.toLowerCase() === (category ?? '').toLowerCase()) ?? null) || guessCategory(text);
  return active.find((p) => p.category === cat) ?? null;
}

export function scopeFromPackage(p: Package): LineItem[] {
  return [{ label: p.name, price: p.base_price }, ...p.deliverables.map((d) => ({ label: d, price: 0 }))];
}

export function blankDraft(s: ProposalSettings): ProposalDraft {
  return {
    lead_id: null,
    deal_id: null,
    package_id: null,
    title: '',
    client_name: '',
    client_email: '',
    summary: '',
    scope: [],
    total: 0,
    currency: s.currency || 'USD',
    timeline_days: null,
    valid_until: addDaysIso(s.validity_days),
    terms: s.terms,
    notes: '',
  };
}

export function applyPackage(d: ProposalDraft, pkg: Package): ProposalDraft {
  const scope = scopeFromPackage(pkg);
  return {
    ...d,
    package_id: pkg.id,
    scope,
    total: totalOf(scope),
    currency: pkg.currency || d.currency,
    timeline_days: pkg.timeline_days,
    title: d.title || pkg.name,
    summary: d.summary || pkg.description,
  };
}

function emailIn(s: string | null): string {
  const m = (s ?? '').match(/[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+/);
  return m ? m[0] : '';
}

export function draftFromLead(lead: Lead, packages: Package[], s: ProposalSettings): ProposalDraft {
  const client = lead.owner_name || lead.company_name || lead.author || '';
  const base: ProposalDraft = { ...blankDraft(s), lead_id: lead.id, client_name: client, client_email: lead.best_email || emailIn(lead.contact) || '' };
  const pkg = pickPackage(packages, lead.category, `${lead.title} ${lead.description ?? ''}`);
  if (pkg) return { ...applyPackage(base, pkg), title: client ? `${pkg.name} for ${client}` : pkg.name };
  const budget = lead.budget_amount;
  const scope = budget ? [{ label: lead.title.slice(0, 80), price: budget }] : [];
  return { ...base, title: lead.title.slice(0, 90), scope, total: totalOf(scope) };
}

export async function draftFromDeal(deal: Deal, packages: Package[], s: ProposalSettings): Promise<ProposalDraft> {
  let lead: Lead | null = null;
  if (deal.lead_id) {
    const { data } = await supabase.from('leads').select('*').eq('id', deal.lead_id).maybeSingle();
    if (data) lead = normalizeLead(data as Record<string, unknown>);
  }
  const client = deal.contact || deal.company || '';
  const base: ProposalDraft = {
    ...blankDraft(s),
    lead_id: deal.lead_id,
    deal_id: deal.id,
    client_name: deal.company || deal.contact || '',
    client_email: lead?.best_email || emailIn(deal.contact) || '',
    currency: deal.currency || s.currency || 'USD',
  };
  const pkg = pickPackage(packages, lead?.category ?? null, `${deal.title} ${lead?.description ?? ''}`);
  if (pkg) {
    const d = applyPackage(base, pkg);
    // Keep the agreed deal value when there is one: the package line carries the deal price.
    if (deal.value !== null && deal.value > 0) {
      const scope = [{ label: pkg.name, price: deal.value }, ...pkg.deliverables.map((x) => ({ label: x, price: 0 }))];
      return { ...d, scope, total: totalOf(scope), currency: deal.currency, title: deal.title };
    }
    return { ...d, title: deal.title };
  }
  const scope = deal.value ? [{ label: deal.title.slice(0, 80), price: deal.value }] : [];
  void client;
  return { ...base, title: deal.title, scope, total: totalOf(scope) };
}

export async function fetchLead(id: string): Promise<Lead | null> {
  const { data } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
  return data ? normalizeLead(data as Record<string, unknown>) : null;
}

export async function fetchDeal(id: string): Promise<Deal | null> {
  const { data } = await supabase.from('deals').select('*').eq('id', id).maybeSingle();
  return data ? normalizeDeal(data as Record<string, unknown>) : null;
}

/** Offered after "accepted": creates a deal from the proposal, or updates the linked one. Never touches money elsewhere. */
export async function syncDealFromProposal(p: Proposal): Promise<{ deal: Deal | null; created: boolean; error: string | null }> {
  const total = totalOf(p.scope);
  if (p.deal_id) {
    const prev = await fetchDeal(p.deal_id);
    if (prev) {
      const input = inputFromDeal(prev);
      input.value = String(total);
      input.currency = p.currency;
      if (prev.stage === 'talking' || prev.stage === 'negotiating') input.stage = 'agreed';
      const res = await updateDeal(prev, input);
      return { deal: res.deal, created: false, error: res.error };
    }
  }
  const res = await createDeal({
    ...EMPTY_INPUT,
    title: p.title,
    company: p.client_name,
    contact: p.client_email,
    value: String(total),
    currency: p.currency,
    stage: 'agreed',
    platform: 'Proposal',
    lead_id: p.lead_id,
    notes: p.timeline_days ? `Accepted proposal. Timeline: ${timelineText(p.timeline_days)}.` : 'Accepted proposal.',
  });
  return { deal: res.deal, created: true, error: res.error };
}
