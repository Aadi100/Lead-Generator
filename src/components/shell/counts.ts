import { supabase } from '@/lib/supabaseClient';
import type { BadgeKey } from './nav';

/** null = unknown (the query failed, for example a table that does not exist yet): the badge is simply hidden. */
export type BadgeCounts = Record<BadgeKey, number | null>;

export const EMPTY_COUNTS: BadgeCounts = { leads: null, outbox: null, tasks: null, deals: null, buyers: null, sellers: null };

/** Window event: dispatch it after you change tasks, deals or leads so the sidebar badges refresh at once. */
export const REFRESH_COUNTS_EVENT = 'lr:refresh-counts';

const head = { count: 'exact' as const, head: true };

export async function fetchBadgeCounts(): Promise<BadgeCounts> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [leadsToday, drafts, replies, tasks, deals, buyers, sellers] = await Promise.all([
    supabase.from('leads').select('id', head).gte('created_at', startOfToday.toISOString()),
    supabase.from('outreach').select('lead_id').eq('status', 'draft').eq('step', 1),
    supabase.from('replies').select('id', head).eq('handled', false),
    supabase.from('tasks').select('id', head).eq('done', false).lte('due_at', endOfToday.toISOString()),
    supabase.from('deals').select('id', head).not('stage', 'in', '(done,cancelled)'),
    supabase.from('leads').select('id', head).eq('lead_kind', 'trade').eq('trade_side', 'buyer').eq('status', 'New').not('trade_match', 'is', null),
    supabase.from('leads').select('id', head).eq('lead_kind', 'trade').eq('trade_side', 'seller').eq('status', 'New').not('trade_match', 'is', null),
  ]);

  const draftLeads = new Set(((drafts.data ?? []) as { lead_id: string }[]).map((d) => d.lead_id));
  return {
    leads: leadsToday.error ? null : (leadsToday.count ?? 0),
    outbox: drafts.error && replies.error ? null : (drafts.error ? 0 : draftLeads.size) + (replies.error ? 0 : (replies.count ?? 0)),
    tasks: tasks.error ? null : (tasks.count ?? 0),
    deals: deals.error ? null : (deals.count ?? 0),
    buyers: buyers.error ? null : (buyers.count ?? 0),
    sellers: sellers.error ? null : (sellers.count ?? 0),
  };
}
