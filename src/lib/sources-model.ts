// Sources module: which lead sources exist, how leads are matched to them and how their health is judged.
// Pure functions only (no React, no Supabase) so the rules stay in one readable place.
import type { IntegrationsSettings, JobType, TradingSettings, WorkerStatus } from './types';

export const WORKER_OFFLINE_MS = 40_000;
export const N8N_OFFLINE_MS = 15 * 60_000;
const HOUR = 3_600_000;

export type SourceKind = 'n8n' | 'worker' | 'manual';
export type SourceStatus = 'healthy' | 'quiet' | 'needs_key' | 'off' | 'problem';

export type N8nStatus = {
  last_seen: string | null;
  errors_total: number;
  last_error: { workflow: string; node: string; message: string; at: string | null } | null;
};

export type LeadRow = {
  source: string | null;
  source_detail: string | null;
  lead_kind: string | null;
  trust_score: number | null;
  created_at: string;
};

export type SourceContext = {
  now: number;
  n8n: N8nStatus;
  n8nOnline: boolean;
  workerOnline: boolean;
  integrations: IntegrationsSettings;
  trading: TradingSettings;
  prospecting: { enabled: boolean; last_run: string | null; last_result: string | Record<string, unknown> | null };
  imapReady: boolean;
  tradeState: { discord: Record<string, string>; reddit_last_run: string | null; subs_ok: string[] };
};

export type SourceDef = {
  id: string;
  name: string;
  kind: SourceKind;
  schedule: string;
  hint: string;
  /** Matches a lead to this source. First definition that matches wins, so order matters. */
  match?: (l: LeadRow) => boolean;
  /** Name of the n8n workflow behind this source (matched against n8n_status.last_error.workflow). */
  workflow?: string;
  /** Leads older than this many hours make the source "Quiet". Omit for sources that only fire when someone acts. */
  quietAfterH?: number;
  job?: { type: JobType; label: string };
  configure: { href: string; label: string };
  /** Reason a key or setup step is missing, or null when everything needed is present. */
  needsKey?: (c: SourceContext) => string | null;
  /** Reason the source is switched off, or null. */
  off?: (c: SourceContext) => string | null;
  /** Reason the source is broken (beyond n8n and worker being offline), or null. */
  problem?: (c: SourceContext) => string | null;
  /** Rows that are not lead sources (for example reply tracking) show no lead numbers. */
  leadless?: boolean;
};

const HIRING_SUBS = ['forhire', 'slavelabour', 'donedirtcheap', 'designjobs', 'hiring', 'hungryartists'];
const subOf = (l: LeadRow) => (l.source_detail ?? '').replace(/^r\//i, '').toLowerCase();
const src = (l: LeadRow) => (l.source ?? '').trim().toLowerCase();
const isTrade = (l: LeadRow) => l.lead_kind === 'trade';

function integrationProblem(c: SourceContext, name: keyof IntegrationsSettings['status']): string | null {
  const st = c.integrations.status[name];
  if (st && st.ok === false) return st.message || 'The last connection test failed.';
  return null;
}

export const SOURCES: SourceDef[] = [
  {
    id: 'reddit-trading',
    name: 'Reddit trading',
    kind: 'worker',
    schedule: 'Every scan (about 10 min)',
    hint: 'Game buy and sell posts from the subreddits in your catalog.',
    match: (l) => src(l) === 'reddit' && isTrade(l),
    quietAfterH: 48,
    job: { type: 'trade_scan', label: 'Scan now' },
    configure: { href: '/trading/catalog', label: 'Catalog' },
    off: (c) => (c.trading.enabled ? null : 'Game trading is switched off.'),
    problem: (c) => {
      const r = c.trading.last_result;
      const e = r && typeof r === 'object' ? (r as Record<string, unknown>).error : null;
      return c.trading.enabled && typeof e === 'string' && e ? e : null;
    },
  },
  {
    id: 'discord',
    name: 'Discord',
    kind: 'worker',
    schedule: 'Every trade scan',
    hint: 'Trade messages from the channels you added.',
    match: (l) => src(l) === 'discord',
    quietAfterH: 72,
    job: { type: 'trade_scan', label: 'Scan now' },
    configure: { href: '/trading/catalog', label: 'Catalog' },
    needsKey: (c) => (c.integrations.discord.bot_token ? null : 'Add a Discord bot token in Settings > Connections.'),
    off: (c) => (c.trading.enabled && c.trading.discord.enabled && c.trading.discord.channels.length ? null : 'Discord channels are not switched on.'),
    problem: (c) => integrationProblem(c, 'discord') ?? (Object.values(c.tradeState.discord).some((v) => /^error|fail/i.test(v)) ? 'A channel could not be read.' : null),
  },
  {
    id: 'reddit-hiring',
    name: 'Reddit hiring boards',
    kind: 'n8n',
    schedule: 'Every 10 min',
    hint: 'People asking to hire on r/forhire, r/slavelabour, r/DoneDirtCheap and similar.',
    match: (l) => src(l) === 'reddit' && !isTrade(l) && HIRING_SUBS.includes(subOf(l)),
    workflow: 'Reddit - Hiring boards',
    quietAfterH: 24,
    configure: { href: '/settings?tab=targeting', label: 'Targeting' },
  },
  {
    id: 'reddit-business',
    name: 'Reddit business',
    kind: 'n8n',
    schedule: 'At :05, :25 and :45',
    hint: 'Business and maker communities where owners ask for websites, apps or design.',
    match: (l) => src(l) === 'reddit' && !isTrade(l),
    workflow: 'Reddit - Business communities',
    quietAfterH: 48,
    configure: { href: '/settings?tab=targeting', label: 'Targeting' },
  },
  {
    id: 'freelancer',
    name: 'Freelancer.com',
    kind: 'n8n',
    schedule: 'Every 30 min',
    hint: 'New client projects from the Freelancer.com feed.',
    match: (l) => src(l).startsWith('freelancer'),
    workflow: 'Freelancer.com - Client projects',
    quietAfterH: 48,
    configure: { href: '/settings?tab=targeting', label: 'Targeting' },
  },
  {
    id: 'hn',
    name: 'Hacker News',
    kind: 'n8n',
    schedule: 'Every 6 h',
    hint: 'The monthly "Who is hiring" thread.',
    match: (l) => src(l) === 'hacker news',
    workflow: 'Hacker News - Who is hiring',
    quietAfterH: 24 * 14,
    configure: { href: '/settings?tab=targeting', label: 'Targeting' },
  },
  {
    id: 'wwr',
    name: 'We Work Remotely',
    kind: 'n8n',
    schedule: 'Every 3 h',
    hint: 'Contract and remote work listings.',
    match: (l) => src(l) === 'we work remotely',
    workflow: 'We Work Remotely - Contract work',
    quietAfterH: 24 * 4,
    configure: { href: '/settings?tab=targeting', label: 'Targeting' },
  },
  {
    id: 'web-form',
    name: 'Website form',
    kind: 'n8n',
    schedule: 'When someone submits (webhook)',
    hint: 'Messages sent through the contact form on your own website.',
    match: (l) => src(l) === 'web form' || src(l) === 'website form',
    workflow: 'Inbound - Website contact form',
    configure: { href: '/capture', label: 'Capture' },
  },
  {
    id: 'osm',
    name: 'OpenStreetMap prospects',
    kind: 'worker',
    schedule: 'Every 24 h (set in Settings)',
    hint: 'Local businesses found by city and type that might need your services.',
    match: (l) => src(l) === 'openstreetmap',
    quietAfterH: 24 * 3,
    job: { type: 'prospect_local', label: 'Find now' },
    configure: { href: '/settings?tab=prospecting', label: 'Prospecting' },
    off: (c) => (c.prospecting.enabled ? null : 'Local prospecting is switched off.'),
  },
  {
    id: 'serper',
    name: 'Google (Serper)',
    kind: 'worker',
    schedule: 'About every hour',
    hint: 'Web search results found through the Serper search key.',
    match: (l) => (l.source_detail ?? '').toLowerCase() === 'found via google',
    quietAfterH: 48,
    configure: { href: '/settings?tab=connections', label: 'Connections' },
    needsKey: (c) => (c.integrations.serper.api_key ? null : 'Add your Serper API key.'),
    off: (c) => (c.integrations.serper.enabled ? null : 'Switched off in Connections.'),
    problem: (c) => integrationProblem(c, 'serper'),
  },
  {
    id: 'x',
    name: 'X',
    kind: 'worker',
    schedule: 'About every hour',
    hint: 'Posts on X where people ask for help.',
    match: (l) => src(l) === 'x',
    quietAfterH: 72,
    configure: { href: '/settings?tab=connections', label: 'Connections' },
    needsKey: (c) => (c.integrations.x.bearer_token ? null : 'Add your X bearer token.'),
    off: (c) => (c.integrations.x.enabled ? null : 'Switched off in Connections.'),
    problem: (c) => integrationProblem(c, 'x'),
  },
  {
    id: 'reddit-api',
    name: 'Reddit API',
    kind: 'worker',
    schedule: 'About every 15 min',
    hint: 'Richer Reddit results when you add your own Reddit app (no lead numbers of its own: leads count under the Reddit rows).',
    quietAfterH: 72,
    configure: { href: '/settings?tab=connections', label: 'Connections' },
    needsKey: (c) => (c.integrations.reddit_api.client_id && c.integrations.reddit_api.client_secret ? null : 'Add your Reddit client ID and secret.'),
    off: (c) => (c.integrations.reddit_api.enabled ? null : 'Switched off in Connections.'),
    problem: (c) => integrationProblem(c, 'reddit_api'),
    leadless: true,
  },
  {
    id: 'upwork',
    name: 'Upwork inbox',
    kind: 'worker',
    schedule: 'With each inbox check',
    hint: 'Upwork saved-search emails read from your inbox.',
    match: (l) => src(l) === 'upwork',
    quietAfterH: 72,
    job: { type: 'check_replies', label: 'Check inbox' },
    configure: { href: '/settings?tab=connections', label: 'Connections' },
    needsKey: (c) => (c.imapReady ? null : 'Connect your inbox under Reply tracking first.'),
    off: (c) => (c.integrations.upwork_inbox.enabled ? null : 'Switched off in Connections.'),
    problem: (c) => integrationProblem(c, 'upwork_inbox'),
  },
  {
    id: 'capture',
    name: 'Capture (manual)',
    kind: 'manual',
    schedule: 'When you add something',
    hint: 'Anything you save with the Capture bookmark, Quick add or by hand.',
    match: () => true,
    configure: { href: '/capture', label: 'Capture' },
  },
];

export const SOURCE_RULES = [
  'Problem: n8n has not checked in for 15 minutes (n8n sources), the worker is off (worker sources), its workflow reported a failure in the last 24 hours, or its last connection test failed.',
  'Needs key: an API key or login the source requires is missing.',
  'Off: you switched it off in Settings or the Trading catalog.',
  'Quiet: it is running but found no new lead within its normal window. This is often fine for slow sources.',
  'Healthy: it is running and delivered a lead inside its normal window (or, for manual and webhook sources, has delivered leads before).',
];

export type SourceStats = {
  last: string | null;
  d1: number;
  d7: number;
  total: number;
  trustAvg: number | null;
};

export type SourceRow = {
  def: SourceDef;
  stats: SourceStats;
  status: SourceStatus;
  reason: string;
};

export function classify(l: LeadRow): string {
  for (const d of SOURCES) if (d.match && d.match(l)) return d.id;
  return 'capture';
}

export function computeStats(leads: LeadRow[], now: number): Record<string, SourceStats> {
  const out: Record<string, { last: number; d1: number; d7: number; total: number; ts: number; tn: number }> = {};
  for (const l of leads) {
    const id = classify(l);
    const o = (out[id] ??= { last: 0, d1: 0, d7: 0, total: 0, ts: 0, tn: 0 });
    const t = Date.parse(l.created_at);
    if (!Number.isFinite(t)) continue;
    o.total += 1;
    if (t > o.last) o.last = t;
    if (now - t <= 24 * HOUR) o.d1 += 1;
    if (now - t <= 7 * 24 * HOUR) o.d7 += 1;
    if (typeof l.trust_score === 'number') {
      o.ts += l.trust_score;
      o.tn += 1;
    }
  }
  const res: Record<string, SourceStats> = {};
  for (const [id, o] of Object.entries(out)) {
    res[id] = { last: o.last ? new Date(o.last).toISOString() : null, d1: o.d1, d7: o.d7, total: o.total, trustAvg: o.tn ? Math.round(o.ts / o.tn) : null };
  }
  return res;
}

const EMPTY_STATS: SourceStats = { last: null, d1: 0, d7: 0, total: 0, trustAvg: null };

function sameWorkflow(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return !!a && !!b && (n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a)));
}

export function failingWorkflow(c: SourceContext, def: SourceDef): boolean {
  const e = c.n8n.last_error;
  if (!e || !def.workflow || !sameWorkflow(e.workflow, def.workflow)) return false;
  const at = e.at ? Date.parse(e.at) : NaN;
  return Number.isFinite(at) && c.now - at <= 24 * HOUR;
}

export function judge(def: SourceDef, stats: SourceStats, c: SourceContext): { status: SourceStatus; reason: string } {
  const nk = def.needsKey?.(c);
  if (nk) return { status: 'needs_key', reason: nk };
  const off = def.off?.(c);
  if (off) return { status: 'off', reason: off };
  if (def.kind === 'n8n' && !c.n8nOnline) return { status: 'problem', reason: 'n8n has not checked in for over 15 minutes, so this scraper is not running.' };
  if (def.kind === 'worker' && !c.workerOnline && def.id !== 'capture') return { status: 'problem', reason: 'The worker is off, so this source cannot run. Start it with npm run worker.' };
  if (failingWorkflow(c, def)) return { status: 'problem', reason: `Its workflow failed${c.n8n.last_error?.node ? ` at "${c.n8n.last_error.node}"` : ''}: ${c.n8n.last_error?.message ?? 'unknown error'}` };
  const pr = def.problem?.(c);
  if (pr) return { status: 'problem', reason: pr };
  if (def.leadless) return { status: 'healthy', reason: 'Connected.' };
  const last = stats.last ? Date.parse(stats.last) : NaN;
  if (def.quietAfterH == null) {
    return Number.isFinite(last) ? { status: 'healthy', reason: 'Has delivered leads before.' } : { status: 'quiet', reason: 'No leads from here yet.' };
  }
  if (!Number.isFinite(last)) return { status: 'quiet', reason: 'Running, but no leads found yet.' };
  const ageH = (c.now - last) / HOUR;
  if (ageH <= def.quietAfterH) return { status: 'healthy', reason: 'Delivered a lead recently.' };
  return { status: 'quiet', reason: `No new lead for ${Math.floor(ageH / 24) >= 2 ? `${Math.floor(ageH / 24)} days` : `${Math.floor(ageH)} hours`}.` };
}

export function buildRows(leads: LeadRow[], c: SourceContext): SourceRow[] {
  const stats = computeStats(leads, c.now);
  return SOURCES.map((def) => {
    const s = stats[def.id] ?? EMPTY_STATS;
    return { def, stats: s, ...judge(def, s, c) };
  });
}

// Platform workflows that run in n8n besides the scrapers.
export const PLATFORM_WORKFLOWS: { id: string; name: string; workflow: string; schedule: string; purpose: string }[] = [
  { id: 'heartbeat', name: 'Heartbeat', workflow: 'System - Heartbeat', schedule: 'Every 5 min', purpose: 'Tells the dashboard n8n is alive.' },
  { id: 'failures', name: 'Failure alerts', workflow: 'System - Failure alerts', schedule: 'When any workflow fails', purpose: 'Records the error here and sends you an alert.' },
  { id: 'digest', name: 'Daily summary', workflow: 'Daily summary', schedule: 'Daily at 08:00', purpose: 'Sends a morning summary of new leads and replies.' },
  { id: 'reminders', name: 'Reminders', workflow: 'Reminders - Follow up and keep moving', schedule: 'Hourly at :15', purpose: 'Nudges you about follow-ups and due tasks.' },
  { id: 'capture-hook', name: 'Capture webhook', workflow: 'Capture - Send anything to Lead Radar', schedule: 'When the bookmark sends something', purpose: 'Receives items saved with the Capture bookmark.' },
];

export function parseN8n(raw: unknown): N8nStatus {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const e = o.last_error && typeof o.last_error === 'object' ? (o.last_error as Record<string, unknown>) : null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    last_seen: typeof o.last_seen === 'string' && o.last_seen ? o.last_seen : null,
    errors_total: typeof o.errors_total === 'number' ? o.errors_total : 0,
    last_error: e && (str(e.message) || str(e.workflow)) ? { workflow: str(e.workflow), node: str(e.node), message: str(e.message), at: str(e.at) || null } : null,
  };
}

export function workerOnline(w: WorkerStatus, now: number): boolean {
  const t = w.last_seen ? Date.parse(w.last_seen) : NaN;
  return Number.isFinite(t) && now - t <= WORKER_OFFLINE_MS;
}

export function n8nOnline(n: N8nStatus, now: number): boolean {
  const t = n.last_seen ? Date.parse(n.last_seen) : NaN;
  return Number.isFinite(t) && now - t <= N8N_OFFLINE_MS;
}

/** Short plain-words summary of a finished job result (sums any "inserted"/"found" counters). */
export function summarizeJob(type: JobType, result: Record<string, unknown> | null): string {
  if (!result) return 'Finished.';
  let inserted = 0;
  let seen = false;
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'inserted' && typeof x === 'number') {
        inserted += x;
        seen = true;
      } else if (typeof x === 'object') walk(x);
    }
  };
  walk(result);
  const err = typeof result.error === 'string' ? result.error : null;
  if (err) return err;
  if (seen) return inserted === 0 ? 'Finished. No new leads this time.' : `Finished. ${inserted} new lead${inserted === 1 ? '' : 's'} added.`;
  if (type === 'check_replies') return 'Inbox checked.';
  return 'Finished.';
}
