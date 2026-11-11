// Pipeline module helpers: loading leads, grouping into columns and the status moves.
import { supabase } from './supabaseClient';
import { normalizeLead } from './format';
import type { Lead, Status } from './types';

export const PIPELINE_LIMIT = 600;
export const COLUMN_STATUSES: Status[] = ['New', 'Pitched', 'Replied', 'Won', 'Lost'];
export type ColumnStatus = Status;

export const COLUMN_HINT: Record<Status, string> = {
  New: 'Found, not contacted yet',
  Pitched: 'You sent a message',
  Replied: 'They wrote back',
  Won: 'You got the work',
  Lost: 'Did not work out',
  Ignored: 'Hidden from your list',
};

export type PipelineScope = 'all' | 'services' | 'trading';

const LEAD_COLUMNS =
  'id,title,description,budget,url,source,source_detail,status,created_at,category,author,contact,budget_amount,posted_at,trust_score,trust_level,is_suspicious,flags,notes,lead_kind,fit_score,pitched_at,replied_at,outcome_note,trade_side,game,item_type,website,company_name,best_email';

export type PipelineData = {
  leads: Lead[];
  total: number;
  outreach: Record<string, string>;
};

export async function loadPipeline(): Promise<PipelineData> {
  const [leadsRes, countRes, outRes] = await Promise.all([
    supabase.from('leads').select(LEAD_COLUMNS).order('created_at', { ascending: false }).limit(PIPELINE_LIMIT),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('outreach').select('lead_id,status,created_at').order('created_at', { ascending: false }).limit(2000),
  ]);
  if (leadsRes.error) throw new Error(leadsRes.error.message);
  const leads = ((leadsRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalizeLead);
  const outreach: Record<string, string> = {};
  if (!outRes.error) {
    for (const row of (outRes.data ?? []) as { lead_id: string | null; status: string | null }[]) {
      if (row.lead_id && row.status && !(row.lead_id in outreach)) outreach[row.lead_id] = row.status;
    }
  }
  return { leads, total: countRes.count ?? leads.length, outreach };
}

export const OUTREACH_LABEL: Record<string, string> = {
  draft: 'Draft ready',
  queued: 'Queued to send',
  sending: 'Sending',
  scheduled: 'Follow-up scheduled',
  sent: 'Message sent',
  failed: 'Send failed',
  cancelled: 'Cancelled',
  replied: 'They replied',
};

export function leadHref(lead: Pick<Lead, 'id' | 'lead_kind' | 'trade_side'>): string {
  if (lead.lead_kind === 'trade') {
    return `/trading/${lead.trade_side === 'seller' ? 'sellers' : 'buyers'}?lead=${lead.id}`;
  }
  return `/leads?lead=${lead.id}`;
}

export function sumBudget(leads: Lead[]): number {
  return leads.reduce((acc, l) => acc + (l.budget_amount && l.budget_amount > 0 ? l.budget_amount : 0), 0);
}

export function money(n: number): string {
  if (n >= 10000) return `$${Math.round(n / 1000).toLocaleString('en-US')}k`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export async function updateLeadStatus(id: string, status: Status, extra: Record<string, unknown> = {}): Promise<string | null> {
  const { error } = await supabase.from('leads').update({ status, ...extra }).eq('id', id);
  return error ? error.message : null;
}

export async function createDealFromLead(lead: Lead, value: number | null): Promise<string | null> {
  const { error } = await supabase.from('deals').insert({
    lead_id: lead.id,
    kind: lead.lead_kind === 'trade' ? 'trade' : 'service',
    direction: lead.lead_kind === 'trade' && lead.trade_side === 'seller' ? 'buy' : 'sell',
    stage: 'talking',
    title: lead.title,
    value,
    game: lead.game,
    item_type: lead.item_type,
  });
  return error ? error.message : null;
}
