import { supabase } from './supabaseClient';
import type { Tone } from '@/components/ui';
import type { AssistCategory } from './types-intel';

export const ASSIST_CATEGORY: Record<AssistCategory, { label: string; tone: Tone }> = {
  interested: { label: 'Interested', tone: 'success' },
  asks_price: { label: 'Asks about price', tone: 'info' },
  asks_portfolio: { label: 'Asks for examples', tone: 'info' },
  objection: { label: 'Has a concern', tone: 'warning' },
  not_now: { label: 'Not right now', tone: 'neutral' },
  unsubscribe: { label: 'Wants to stop', tone: 'danger' },
  out_of_office: { label: 'Out of office', tone: 'neutral' },
  other: { label: 'Needs an answer', tone: 'neutral' },
};

export async function addToSuppressions(email: string, reason = 'asked not to be contacted'): Promise<string | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return 'There is no email address on this reply.';
  const { error } = await supabase.from('suppressions').upsert({ email: clean, reason });
  return error ? error.message : null;
}

export async function isSuppressed(email: string): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  if (!clean) return false;
  const { data } = await supabase.from('suppressions').select('email').eq('email', clean).maybeSingle();
  return !!data;
}

export async function createFollowupTask(leadId: string | null, title: string, inDays: number): Promise<string | null> {
  const due = new Date(Date.now() + Math.max(0, inDays) * 86400000);
  due.setHours(9, 0, 0, 0);
  const { error } = await supabase.from('tasks').insert({ title, lead_id: leadId, due_at: due.toISOString(), priority: 'normal' });
  return error ? error.message : null;
}
