import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { nowIso } from '../lib/util.mjs';
import { enrichWithTimeout } from '../lib/enrich-lead.mjs';

export async function enrichOne(lead) {
  try {
    const patch = await enrichWithTimeout(lead);
    const { error } = await sb.from('leads').update(patch).eq('id', lead.id);
    if (error) throw new Error(error.message);
    return patch;
  } catch (e) {
    log('enrich', `${lead.id.slice(0, 8)} failed: ${e.message}`);
    await sb.from('leads').update({ enrich_status: 'failed', enrich_error: String(e.message).slice(0, 300), enriched_at: nowIso() }).eq('id', lead.id);
    return null;
  }
}

async function claimBatch(size) {
  const { data } = await sb.from('leads').select('id').eq('enrich_status', 'pending').order('created_at', { ascending: false }).limit(size);
  const claimed = [];
  for (const row of data || []) {
    const { data: lead } = await sb.from('leads').update({ enrich_status: 'running' }).eq('id', row.id).eq('enrich_status', 'pending').select('*').maybeSingle();
    if (lead) claimed.push(lead);
  }
  return claimed;
}

async function runBatch() {
  const batch = await claimBatch(3);
  if (!batch.length) return 0;
  const queue = [...batch];
  const worker = async () => {
    for (let lead = queue.shift(); lead; lead = queue.shift()) await enrichOne(lead);
  };
  await Promise.all([worker(), worker()]);
  return batch.length;
}

async function scan() {
  const started = Date.now();
  let total = 0;
  for (let i = 0; i < 5 && Date.now() - started < 20000; i++) {
    const n = await runBatch();
    total += n;
    if (!n) break;
  }
  if (total) log('enrich', `processed ${total} lead(s)`);
}

export const tasks = [{ name: 'enrich-scan', everyMs: 20000, initialDelayMs: 4000, run: scan }];

export const jobs = {
  async enrich_lead(job) {
    const id = job.payload?.lead_id;
    if (!id) throw new Error('lead_id is required');
    const { data: lead, error } = await sb.from('leads').select('*').eq('id', id).maybeSingle();
    if (error || !lead) throw new Error(error?.message || 'Lead not found');
    await sb.from('leads').update({ enrich_status: 'running' }).eq('id', id);
    const patch = await enrichOne({ ...lead, enrich_status: 'running' });
    if (!patch) {
      const { data: after } = await sb.from('leads').select('enrich_error').eq('id', id).maybeSingle();
      return { ok: false, error: after?.enrich_error || 'enrichment failed' };
    }
    return { ok: true, status: patch.enrich_status, best_email: patch.best_email, website: patch.website };
  },
};
