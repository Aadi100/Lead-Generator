"use client";

// Duplicate detection on the dashboard: load the links, group them per lead, confirm or split them.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { enqueueJob } from './jobs';
import type { Lead, OutreachRow } from './types';
import type { LeadLink, LeadLinkRelation, LeadLinkState } from './types-intel';

const RELATIONS: LeadLinkRelation[] = ['same_contact', 'cross_post', 'text_blast'];
const STATES: LeadLinkState[] = ['auto', 'suspected', 'confirmed', 'split'];

export function normalizeLink(raw: Record<string, unknown>): LeadLink | null {
  if (typeof raw.id !== 'string' || typeof raw.lead_a !== 'string' || typeof raw.lead_b !== 'string') return null;
  const reasons = Array.isArray(raw.reasons) ? raw.reasons.filter((r): r is string => typeof r === 'string') : [];
  return {
    id: raw.id,
    lead_a: raw.lead_a,
    lead_b: raw.lead_b,
    relation: RELATIONS.includes(raw.relation as LeadLinkRelation) ? (raw.relation as LeadLinkRelation) : 'same_contact',
    state: STATES.includes(raw.state as LeadLinkState) ? (raw.state as LeadLinkState) : 'auto',
    strength: typeof raw.strength === 'number' ? raw.strength : 0,
    reasons,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString(),
  };
}

export type LinkView = { link: LeadLink; otherId: string };

export type LeadGroupInfo = {
  /** Same person or the same ad, shown as one lead (auto or confirmed). */
  same: LinkView[];
  /** Possible matches waiting for Confirm or Split. */
  suspected: LinkView[];
  /** Same text but a different contact: a spam signal, never merged. */
  blast: LinkView[];
};

export type AlsoSeenChip = { count: number; sources: number; suspected: number };

export function groupLinks(links: LeadLink[]): Map<string, LeadGroupInfo> {
  const map = new Map<string, LeadGroupInfo>();
  const get = (id: string) => {
    let g = map.get(id);
    if (!g) {
      g = { same: [], suspected: [], blast: [] };
      map.set(id, g);
    }
    return g;
  };
  for (const link of links) {
    if (link.state === 'split') continue;
    for (const [id, otherId] of [[link.lead_a, link.lead_b], [link.lead_b, link.lead_a]] as const) {
      const g = get(id);
      const view = { link, otherId };
      if (link.relation === 'text_blast') g.blast.push(view);
      else if (link.state === 'suspected') g.suspected.push(view);
      else g.same.push(view);
    }
  }
  return map;
}

export function chipFor(info: LeadGroupInfo | undefined, leadsById: Map<string, Lead>, self: Lead): AlsoSeenChip | null {
  if (!info || (info.same.length === 0 && info.suspected.length === 0)) return null;
  const sources = new Set(info.same.map((v) => leadsById.get(v.otherId)?.source).filter((s): s is string => !!s && s !== self.source));
  return { count: info.same.length, sources: sources.size, suspected: info.suspected.length };
}

export function chipLabel(c: AlsoSeenChip): string {
  if (c.count > 0) return c.sources > 0 ? `+${c.sources} ${c.sources === 1 ? 'source' : 'sources'}` : `+${c.count} ${c.count === 1 ? 'repost' : 'reposts'}`;
  return c.suspected === 1 ? 'Possible match' : `${c.suspected} possible matches`;
}

export function useLeadLinks() {
  const [links, setLinks] = useState<LeadLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('lead_links').select('*').neq('state', 'split').limit(5000);
    if (err) {
      setError(err.message);
    } else {
      setError(null);
      setLinks(((data ?? []) as Record<string, unknown>[]).map(normalizeLink).filter((l): l is LeadLink => l !== null));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`links-live-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_links' }, () => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => void load(), 500);
      })
      .subscribe();
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const groups = useMemo(() => groupLinks(links), [links]);

  // Confirm or split. The worker then refreshes the trust signals of both leads (best effort).
  const decide = useCallback(
    async (link: LeadLink, state: 'confirmed' | 'split' | 'auto' | 'suspected'): Promise<string | null> => {
      const { data, error: err } = await supabase.from('lead_links').update({ state, updated_at: new Date().toISOString() }).eq('id', link.id).select('id');
      if (err || !data || data.length === 0) return err?.message ?? 'The change was not saved.';
      setLinks((cur) => (state === 'split' ? cur.filter((l) => l.id !== link.id) : cur.some((l) => l.id === link.id) ? cur.map((l) => (l.id === link.id ? { ...l, state } : l)) : [...cur, { ...link, state }]));
      void enqueueJob('dedupe_lead', { lead_id: link.lead_a, also: [link.lead_b] });
      return null;
    },
    [],
  );

  return { links, groups, loading, error, reload: load, decide };
}

export type TimelineEvent = { at: string; label: string; source: string; leadId: string; current: boolean; url: string | null };

/** One combined history across a lead and everything linked to it, newest first. */
export function buildTimeline(members: Lead[], currentId: string, outreachByLead: Map<string, OutreachRow[]>): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const add = (lead: Lead, at: string | null, label: string) => {
    if (at && !Number.isNaN(new Date(at).getTime())) out.push({ at, label, source: lead.source, leadId: lead.id, current: lead.id === currentId, url: /^https?:\/\//i.test(lead.url) ? lead.url : null });
  };
  for (const m of members) {
    add(m, m.posted_at ?? m.created_at, `Posted on ${m.source}`);
    if (m.posted_at && m.created_at !== m.posted_at) add(m, m.created_at, `Found on ${m.source}`);
    const sent = (outreachByLead.get(m.id) ?? []).filter((r) => r.sent_at);
    for (const r of sent) add(m, r.sent_at, r.reply_to_id ? 'You answered their reply' : r.step <= 1 ? 'You sent the first email' : `You sent follow-up ${r.step - 1}`);
    if (sent.length === 0) add(m, m.pitched_at, 'Marked pitched');
    add(m, m.replied_at, 'They replied');
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
