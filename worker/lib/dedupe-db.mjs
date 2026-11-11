// Database side of duplicate detection. The matching itself is pure and lives in dedupe.mjs.
import { sb } from './db.mjs';
import { log } from './log.mjs';
import { chunk, nowIso } from './util.mjs';
import { keysOf, matchAgainst, orderPair, summarizeLinks, applySignals } from './dedupe.mjs';

const LEAD_COLS = 'id,title,description,source,author,contact,website,best_email,emails,phones,socials,trust_score,trust_level,flags,is_suspicious,lead_kind,dedupe_signals,created_at';
const MAX_HOLDERS = 40; // a key shared by more leads than this is too common to mean anything

async function candidateIds(leadId, keys) {
  const ids = new Set();
  for (const k of keys) {
    const { data } = await sb.from('lead_identity_keys').select('lead_id').eq('kind', k.kind).eq('value', k.value).neq('lead_id', leadId).limit(MAX_HOLDERS + 1);
    if (!data || data.length > MAX_HOLDERS) continue;
    data.forEach((r) => ids.add(r.lead_id));
  }
  return [...ids];
}

async function fetchLeads(ids) {
  const out = [];
  for (const part of chunk(ids, 50)) {
    const { data } = await sb.from('leads').select(LEAD_COLS).in('id', part);
    out.push(...(data || []));
  }
  return out;
}

async function linksOf(leadId) {
  const { data } = await sb.from('lead_links').select('*').or(`lead_a.eq.${leadId},lead_b.eq.${leadId}`);
  return data || [];
}

// Re-derive trust and flag changes for one lead from its current links.
export async function refreshSignals(leadId) {
  const { data: lead } = await sb.from('leads').select(LEAD_COLS).eq('id', leadId).maybeSingle();
  if (!lead) return;
  const links = await linksOf(leadId);
  const otherIds = links.map((l) => (l.lead_a === leadId ? l.lead_b : l.lead_a));
  const others = new Map((await fetchLeads(otherIds)).map((o) => [o.id, o]));
  const view = links.filter((l) => l.state !== 'split').map((l) => ({ relation: l.relation, state: l.state, other: others.get(l.lead_a === leadId ? l.lead_b : l.lead_a) }));
  const next = summarizeLinks(lead, view);
  const prev = lead.dedupe_signals || {};
  const unchanged = (Number(prev.trust_delta) || 0) === next.trust_delta && (prev.flag || null) === next.flag && !!prev.make_suspicious === next.make_suspicious
    && (prev.linked || 0) === next.linked && (prev.sources || 0) === next.sources && (prev.blast || 0) === next.blast;
  if (unchanged) return;
  const { patch, signals } = applySignals(lead, prev, next);
  const hasEffect = next.trust_delta !== 0 || next.flag || prev.trust_delta || prev.flag;
  const update = { dedupe_signals: signals };
  if (hasEffect) Object.assign(update, patch);
  await sb.from('leads').update(update).eq('id', leadId);
}

// Index one lead, link it to the others it matches, and refresh trust signals on everything that changed.
export async function dedupeLead(leadId) {
  const { data: lead } = await sb.from('leads').select(LEAD_COLS).eq('id', leadId).maybeSingle();
  if (!lead) return { ok: false, error: 'Lead not found' };
  if (lead.lead_kind === 'trade') {
    await sb.from('leads').update({ dedupe_at: nowIso() }).eq('id', leadId);
    return { ok: true, skipped: 'trade' };
  }
  const keys = keysOf(lead);
  await sb.from('lead_identity_keys').delete().eq('lead_id', leadId);
  if (keys.length) await sb.from('lead_identity_keys').upsert(keys.map((k) => ({ lead_id: leadId, ...k })));

  const cands = (await fetchLeads(await candidateIds(leadId, keys))).filter((c) => c.lead_kind !== 'trade');
  const matches = matchAgainst(lead, cands);
  const existing = await linksOf(leadId);
  const byPair = new Map(existing.map((l) => [`${l.lead_a}|${l.lead_b}`, l]));
  const touched = new Set([leadId]);
  const seen = new Set();

  for (const m of matches) {
    const [a, b] = orderPair(leadId, m.other_id);
    const key = `${a}|${b}`;
    seen.add(key);
    const cur = byPair.get(key);
    const row = { relation: m.relation, state: m.state, strength: m.strength, reasons: m.reasons, updated_at: nowIso() };
    if (!cur) {
      const { error } = await sb.from('lead_links').insert({ lead_a: a, lead_b: b, ...row });
      if (error && error.code !== '23505') throw new Error(error.message);
      touched.add(m.other_id);
    } else if (cur.state === 'auto' || cur.state === 'suspected') {
      if (cur.relation !== row.relation || cur.state !== row.state || JSON.stringify(cur.reasons) !== JSON.stringify(row.reasons)) {
        await sb.from('lead_links').update(row).eq('id', cur.id);
        touched.add(m.other_id);
      }
    } // confirmed and split are the user's decision: never touched
  }
  for (const cur of existing) {
    const key = `${cur.lead_a}|${cur.lead_b}`;
    if (!seen.has(key) && (cur.state === 'auto' || cur.state === 'suspected')) {
      await sb.from('lead_links').delete().eq('id', cur.id);
      touched.add(cur.lead_a === leadId ? cur.lead_b : cur.lead_a);
    }
  }
  for (const id of touched) await refreshSignals(id);
  await sb.from('leads').update({ dedupe_at: nowIso() }).eq('id', leadId);
  return { ok: true, keys: keys.length, links: matches.length };
}

export async function dedupePending(limit = 60) {
  const { data } = await sb.from('leads').select('id').is('dedupe_at', null).not('enrich_status', 'in', '(pending,running)').order('created_at', { ascending: false }).limit(limit);
  let done = 0;
  const queue = [...(data || [])];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      try {
        await dedupeLead(r.id);
        done++;
      } catch (e) {
        log('dedupe', `${r.id.slice(0, 8)} failed: ${e.message}`);
        await sb.from('leads').update({ dedupe_at: nowIso() }).eq('id', r.id);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return done;
}
