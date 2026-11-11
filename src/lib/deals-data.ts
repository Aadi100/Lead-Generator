// Deals module logic: loading, saving, stage changes (with lead status side effects), KPIs, monthly series, CSV.
import { supabase } from './supabaseClient';
import { hostOf, normalizeLead } from './format';
import { normalizeDeal, type Deal, type DealKind, type DealStage } from './types-platform';
import type { Lead } from './types';

export const DEAL_CAP = 2000;
export const CLOSED_STAGES: DealStage[] = ['done', 'cancelled'];

export async function fetchDeals(): Promise<Deal[]> {
  const { data, error } = await supabase.from('deals').select('*').order('created_at', { ascending: false }).limit(DEAL_CAP);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeDeal);
}

export type DealInput = {
  kind: DealKind;
  direction: 'sell' | 'buy';
  title: string;
  company: string;
  contact: string;
  game: string;
  item_type: string;
  platform: string;
  value: string;
  cost: string;
  currency: string;
  stage: DealStage;
  expected_close: string;
  notes: string;
  lead_id: string | null;
};

export const EMPTY_INPUT: DealInput = {
  kind: 'service',
  direction: 'sell',
  title: '',
  company: '',
  contact: '',
  game: '',
  item_type: '',
  platform: '',
  value: '',
  cost: '',
  currency: 'USD',
  stage: 'talking',
  expected_close: '',
  notes: '',
  lead_id: null,
};

export function inputFromDeal(d: Deal): DealInput {
  return {
    kind: d.kind,
    direction: d.direction,
    title: d.title,
    company: d.company ?? '',
    contact: d.contact ?? '',
    game: d.game ?? '',
    item_type: d.item_type ?? '',
    platform: d.platform ?? '',
    value: d.value === null ? '' : String(d.value),
    cost: d.cost === null ? '' : String(d.cost),
    currency: d.currency,
    stage: d.stage,
    expected_close: d.expected_close ?? '',
    notes: d.notes ?? '',
    lead_id: d.lead_id,
  };
}

/** Prefill a new deal from a lead's enrichment columns. */
export function inputFromLead(l: Lead): DealInput {
  const isTrade = l.lead_kind === 'trade';
  const company = l.company_name || (l.website ? hostOf(l.website) : '') || '';
  const contact = l.owner_name || l.best_email || l.author || '';
  return {
    ...EMPTY_INPUT,
    kind: isTrade ? 'trade' : 'service',
    // A seller supplies goods (I buy); a buyer wants goods (I sell). Services are always sell.
    direction: isTrade && l.trade_side === 'seller' ? 'buy' : 'sell',
    title: l.title,
    company,
    contact,
    game: isTrade ? l.game ?? '' : '',
    item_type: isTrade ? l.item_type ?? '' : '',
    platform: l.source || '',
    value: l.budget_amount !== null && l.budget_amount !== undefined ? String(l.budget_amount) : '',
    lead_id: l.id,
  };
}

export async function fetchLeadById(id: string): Promise<Lead | null> {
  const { data, error } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return normalizeLead(data as Record<string, unknown>);
}

export async function searchLeads(term: string): Promise<{ id: string; title: string; status: string; source: string }[]> {
  let q = supabase.from('leads').select('id,title,status,source').order('created_at', { ascending: false }).limit(8);
  const t = term.trim().replace(/[%,()]/g, ' ');
  if (t) q = q.or(`title.ilike.%${t}%,company_name.ilike.%${t}%,author.ilike.%${t}%`);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as { id: string; title: string; status: string; source: string }[];
}

function numOrNull(s: string): number | null {
  const t = s.trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function validateInput(i: DealInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!i.title.trim()) e.title = 'Give the deal a short title.';
  for (const k of ['value', 'cost'] as const) {
    const t = i[k].trim().replace(/,/g, '');
    if (t && (!Number.isFinite(Number(t)) || Number(t) < 0)) e[k] = 'Enter a number, for example 450.';
  }
  return e;
}

function row(i: DealInput, prev: Deal | null) {
  const closing = i.stage === 'done' || i.stage === 'cancelled';
  const closed_at = closing ? prev?.closed_at ?? new Date().toISOString() : null;
  const isTrade = i.kind === 'trade';
  return {
    lead_id: i.lead_id,
    kind: i.kind,
    direction: isTrade ? i.direction : 'sell',
    stage: i.stage,
    title: i.title.trim(),
    company: i.company.trim() || null,
    contact: i.contact.trim() || null,
    game: isTrade ? i.game.trim() || null : null,
    item_type: isTrade ? i.item_type.trim() || null : null,
    platform: i.platform.trim() || null,
    value: numOrNull(i.value),
    cost: numOrNull(i.cost),
    currency: (i.currency.trim() || 'USD').toUpperCase().slice(0, 6),
    notes: i.notes.trim() || null,
    expected_close: i.expected_close || null,
    closed_at,
    updated_at: new Date().toISOString(),
  };
}

/** Updates leads.status when a deal reaches done (Won) or cancelled (Lost). replied_at is never touched. */
export async function syncLeadStatus(leadId: string | null, stage: DealStage): Promise<string | null> {
  if (!leadId) return null;
  const status = stage === 'done' ? 'Won' : stage === 'cancelled' ? 'Lost' : null;
  if (!status) return null;
  const { error } = await supabase.from('leads').update({ status }).eq('id', leadId);
  return error ? error.message : null;
}

export async function createDeal(i: DealInput): Promise<{ deal: Deal | null; error: string | null; leadError: string | null }> {
  const { data, error } = await supabase.from('deals').insert(row(i, null)).select('*').single();
  if (error || !data) return { deal: null, error: error?.message ?? 'Could not save', leadError: null };
  const deal = normalizeDeal(data as Record<string, unknown>);
  const leadError = await syncLeadStatus(deal.lead_id, deal.stage);
  return { deal, error: null, leadError };
}

export async function updateDeal(prev: Deal, i: DealInput): Promise<{ deal: Deal | null; error: string | null; leadError: string | null }> {
  const { data, error } = await supabase.from('deals').update(row(i, prev)).eq('id', prev.id).select('*').single();
  if (error || !data) return { deal: null, error: error?.message ?? 'Could not save', leadError: null };
  const deal = normalizeDeal(data as Record<string, unknown>);
  const leadError = prev.stage !== deal.stage || prev.lead_id !== deal.lead_id ? await syncLeadStatus(deal.lead_id, deal.stage) : null;
  return { deal, error: null, leadError };
}

export async function moveDeal(deal: Deal, stage: DealStage): Promise<{ deal: Deal | null; error: string | null; leadError: string | null }> {
  const closing = stage === 'done' || stage === 'cancelled';
  const patch = { stage, closed_at: closing ? deal.closed_at ?? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('deals').update(patch).eq('id', deal.id);
  if (error) return { deal: null, error: error.message, leadError: null };
  const leadError = await syncLeadStatus(deal.lead_id, stage);
  return { deal: { ...deal, ...patch }, error: null, leadError };
}

export async function deleteDeal(id: string): Promise<string | null> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  return error ? error.message : null;
}

// ---------- numbers ----------

export function money(n: number, currency = 'USD', compact = false): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: compact && Math.abs(n) >= 10000 ? 0 : 2, minimumFractionDigits: 0, notation: compact && Math.abs(n) >= 100000 ? 'compact' : 'standard' }).format(n);
  } catch {
    return `${currency} ${Math.round(n)}`;
  }
}

export const profitOf = (d: Deal): number => (d.value ?? 0) - (d.cost ?? 0);
const closeTime = (d: Deal): number => new Date(d.closed_at ?? d.updated_at).getTime();
const isOpen = (d: Deal) => !CLOSED_STAGES.includes(d.stage);

export type DealKpis = { openValue: number; openCount: number; wonThisMonth: number; wonThisMonthValue: number; revenue: number; profit: number; winRate: number | null; doneCount: number; average: number };

export function computeKpis(deals: Deal[], now = new Date()): DealKpis {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const open = deals.filter(isOpen);
  const done = deals.filter((d) => d.stage === 'done');
  const cancelled = deals.filter((d) => d.stage === 'cancelled');
  const won = done.filter((d) => closeTime(d) >= start);
  const revenue = done.reduce((s, d) => s + (d.value ?? 0), 0);
  const profit = done.reduce((s, d) => s + profitOf(d), 0);
  const decided = done.length + cancelled.length;
  return {
    openValue: open.reduce((s, d) => s + (d.value ?? 0), 0),
    openCount: open.length,
    wonThisMonth: won.length,
    wonThisMonthValue: won.reduce((s, d) => s + (d.value ?? 0), 0),
    revenue,
    profit,
    winRate: decided ? Math.round((done.length / decided) * 100) : null,
    doneCount: done.length,
    average: done.length ? revenue / done.length : 0,
  };
}

export type MonthPoint = { key: string; label: string; revenue: number; profit: number };

export function monthlySeries(deals: Deal[], months = 6, now = new Date()): MonthPoint[] {
  const pts: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    pts.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'short' }), revenue: 0, profit: 0 });
  }
  for (const d of deals) {
    if (d.stage !== 'done') continue;
    const t = new Date(closeTime(d));
    const p = pts.find((x) => x.key === `${t.getFullYear()}-${t.getMonth()}`);
    if (p) {
      p.revenue += d.value ?? 0;
      p.profit += profitOf(d);
    }
  }
  return pts;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function dealsToCsv(list: Deal[]): string {
  const head = ['Title', 'Kind', 'Direction', 'Stage', 'Company', 'Contact', 'Game', 'Item type', 'Platform', 'Value', 'Cost', 'Profit', 'Currency', 'Expected close', 'Opened', 'Closed', 'Notes', 'Lead id'];
  const rows = list.map((d) => [d.title, d.kind, d.direction, d.stage, d.company, d.contact, d.game, d.item_type, d.platform, d.value, d.cost, d.value !== null || d.cost !== null ? profitOf(d) : '', d.currency, d.expected_close, d.opened_at, d.closed_at, d.notes, d.lead_id]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Call from a click handler. */
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
