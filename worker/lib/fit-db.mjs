import { sb } from './db.mjs';

export async function fetchAllLeads(columns, { pageSize = 500 } = {}) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from('leads').select(columns).order('created_at', { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
