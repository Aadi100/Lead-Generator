import { sb } from './db.mjs';

const JSON_COLS = ['categories', 'tags', 'flags'];

function normalize(lead) {
  const out = { ...lead };
  for (const c of JSON_COLS) {
    if (typeof out[c] === 'string') {
      try { out[c] = JSON.parse(out[c]); } catch { out[c] = []; }
    }
  }
  return out;
}

// Inserts new leads and silently skips urls we already have. Returns how many were new.
export async function insertLeads(rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 40) {
    const batch = rows.slice(i, i + 40).map(normalize);
    const { data, error } = await sb.from('leads').upsert(batch, { onConflict: 'url', ignoreDuplicates: true }).select('id');
    if (error) throw new Error(`insert leads: ${error.message}`);
    inserted += data?.length || 0;
  }
  return inserted;
}
