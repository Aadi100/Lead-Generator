import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting } from '../lib/settings.mjs';
import { insertLeads } from '../lib/leads-db.mjs';
import { runQuickAdd } from '../lib/quick-add-core.mjs';

async function existingUrls(urls) {
  const { data, error } = await sb.from('leads').select('url').in('url', urls);
  if (error) throw new Error(`quick add: ${error.message}`);
  return new Set((data || []).map((r) => r.url));
}

export const jobs = {
  async quick_add(job) {
    const [trading, targeting] = await Promise.all([getSetting('trading'), getSetting('targeting')]);
    const result = await runQuickAdd(job.payload, { trading, targeting, existingUrls, insert: insertLeads });
    log('quick-add', `${result.items.length} items: ${result.inserted} new, ${result.duplicates} already known, ${result.skipped} skipped`);
    return result;
  },
};

export const tasks = [];
