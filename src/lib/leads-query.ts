// Leads module helpers: URL <-> view state, filtering and sorting. Services leads only (request + prospect).
import { CATEGORIES, STATUSES, type Lead, type SortKey, type StatusTab, type TrustFilter } from './types';
import { isFlagged } from './format';
import { rankScore } from './rank';

export type LeadsKind = 'all' | 'request' | 'prospect';
export type LeadsView = 'list' | 'cards';

export type LeadsState = {
  kind: LeadsKind;
  q: string;
  status: StatusTab;
  category: string; // 'All' or one of CATEGORIES
  source: string; // 'All' or a source name
  trust: TrustFilter;
  sort: SortKey;
  view: LeadsView;
  lead: string | null;
};

export const DEFAULT_STATE: LeadsState = {
  kind: 'all',
  q: '',
  status: 'New', // best new leads first
  category: 'All',
  source: 'All',
  trust: 'All',
  sort: 'fit',
  view: 'list',
  lead: null,
};

const TRUSTS: TrustFilter[] = ['All', 'High', 'Medium', 'Low', 'Suspicious'];
const SORTS: SortKey[] = ['newest', 'fit', 'trust', 'budget'];

export function parseState(get: (key: string) => string | null): LeadsState {
  const kind = get('kind');
  const status = get('status');
  const category = get('cat');
  const trust = get('trust');
  const sort = get('sort');
  const view = get('view');
  return {
    kind: kind === 'request' || kind === 'prospect' ? kind : 'all',
    q: get('q') ?? '',
    status: status && (STATUSES as readonly string[]).includes(status) || status === 'All' ? (status as StatusTab) : DEFAULT_STATE.status,
    category: category && (CATEGORIES as readonly string[]).includes(category) ? category : 'All',
    source: get('src') || 'All',
    trust: trust && (TRUSTS as string[]).includes(trust) ? (trust as TrustFilter) : 'All',
    sort: sort && (SORTS as string[]).includes(sort) ? (sort as SortKey) : DEFAULT_STATE.sort,
    view: view === 'cards' ? 'cards' : 'list',
    lead: get('lead') || null,
  };
}

export function stateToQuery(s: LeadsState): string {
  const p = new URLSearchParams();
  if (s.kind !== 'all') p.set('kind', s.kind);
  if (s.q.trim()) p.set('q', s.q.trim());
  if (s.status !== DEFAULT_STATE.status) p.set('status', s.status);
  if (s.category !== 'All') p.set('cat', s.category);
  if (s.source !== 'All') p.set('src', s.source);
  if (s.trust !== 'All') p.set('trust', s.trust);
  if (s.sort !== DEFAULT_STATE.sort) p.set('sort', s.sort);
  if (s.view !== 'list') p.set('view', s.view);
  if (s.lead) p.set('lead', s.lead);
  const str = p.toString();
  return str ? `?${str}` : '';
}

export function isServiceLead(l: Lead): boolean {
  return l.lead_kind !== 'trade';
}

/** Everything except the status tab, so tab counts stay meaningful. */
export function matchesFilters(lead: Lead, s: LeadsState): boolean {
  if (s.kind !== 'all' && lead.lead_kind !== s.kind) return false;
  if (s.category !== 'All' && lead.category !== s.category && !lead.categories.includes(s.category)) return false;
  if (s.source !== 'All' && lead.source !== s.source) return false;
  if (s.trust === 'Suspicious') {
    if (!isFlagged(lead)) return false;
  } else if (s.trust !== 'All' && lead.trust_level !== s.trust) {
    return false;
  }
  const q = s.q.trim().toLowerCase();
  if (q) {
    const hay = [lead.title, lead.description, lead.author, lead.source_detail, lead.company_name, lead.owner_name, lead.tags.join(' ')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function sortLeads(list: Lead[], sort: SortKey): Lead[] {
  const byNewest = (a: Lead, b: Lead) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const copy = [...list];
  // Best match: the fit score nudged by what has worked for you (see rank.ts). Falls back to fit alone.
  if (sort === 'fit') return copy.sort((a, b) => (rankScore(b) ?? -1) - (rankScore(a) ?? -1) || (b.fit_score ?? -1) - (a.fit_score ?? -1) || (b.trust_score ?? -1) - (a.trust_score ?? -1) || byNewest(a, b));
  if (sort === 'trust') return copy.sort((a, b) => (b.trust_score ?? -1) - (a.trust_score ?? -1) || byNewest(a, b));
  if (sort === 'budget') return copy.sort((a, b) => (b.budget_amount ?? -1) - (a.budget_amount ?? -1) || byNewest(a, b));
  return copy.sort(byNewest);
}

export function hasActiveFilters(s: LeadsState): boolean {
  return s.q.trim() !== '' || s.category !== 'All' || s.source !== 'All' || s.trust !== 'All' || s.status !== DEFAULT_STATE.status || s.kind !== 'all';
}
