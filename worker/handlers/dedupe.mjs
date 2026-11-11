import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { dedupeLead, dedupePending, refreshSignals } from '../lib/dedupe-db.mjs';

// Backfill and catch-up: any lead that has not been matched yet is matched here, a batch at a time.
export const tasks = [
  {
    name: 'dedupe-scan', everyMs: 30000, initialDelayMs: 12000,
    async run() {
      const n = await dedupePending(60);
      if (n) log('dedupe', `matched ${n} lead(s)`);
    },
  },
];

export const jobs = {
  // Re-match one lead (used after the user confirms or splits a suspected match).
  async dedupe_lead(job) {
    const ids = [job.payload?.lead_id, ...(Array.isArray(job.payload?.also) ? job.payload.also : [])].filter(Boolean);
    if (!ids.length) throw new Error('lead_id is required');
    const first = await dedupeLead(ids[0]);
    for (const id of ids.slice(1)) await refreshSignals(id);
    return first;
  },
  // Backfill: forget when each lead was matched, then match them all again. Confirmed and split links are kept.
  async dedupe_backfill() {
    await sb.from('leads').update({ dedupe_at: null }).not('lead_kind', 'eq', 'trade').not('dedupe_at', 'is', null);
    let total = 0;
    const started = Date.now();
    for (let i = 0; i < 100 && Date.now() - started < 8 * 60 * 1000; i++) {
      const n = await dedupePending(60);
      total += n;
      if (!n) break;
    }
    const { count } = await sb.from('lead_links').select('id', { count: 'exact', head: true }).in('state', ['auto', 'confirmed', 'suspected']);
    log('dedupe', `backfill matched ${total} lead(s), ${count || 0} links`);
    return { matched: total, links: count || 0 };
  },
};
