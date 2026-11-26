import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting, setSetting } from '../lib/settings.mjs';
import { runClaude, extractJson, claudeStatus } from '../lib/claude.mjs';
import { fetchAllLeads } from '../lib/fit-db.mjs';
import { buildBuckets, buildInsights, suggestedHide, summarizeEvents, buildLearningPrompt, trimRulesToWords } from '../lib/learn-core.mjs';

const nowIso = () => new Date().toISOString();

export async function learnFilters() {
  const leads = await fetchAllLeads('id,status,source,category,source_detail,tags');
  const b = buildBuckets(leads);
  const value = { generated_at: nowIso(), ...b, insights: buildInsights(b), suggested_hide: suggestedHide(b.by_tag) };
  await setSetting('filter_learning', value);
  return { total: value.total, insights: value.insights };
}

async function eventsSince(since) {
  let q = sb.from('learning_events').select('kind,lead_id,outreach_id,data,created_at').order('created_at', { ascending: false }).limit(300);
  if (since) q = q.gt('created_at', since);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function learnWriting() {
  const current = await getSetting('writing_rules');
  const events = await eventsSince(current.last_learned_at);
  if (!events.length) return { changed: false, notes: ['Nothing new to learn from yet. Edit or rate a few drafts first.'] };
  if (!(await claudeStatus()).available) return { changed: false, notes: ['No AI key is saved (Settings > AI writer), so nothing was learned.'] };

  const summary = summarizeEvents(events);
  const prompt = buildLearningPrompt({ rules: current.markdown || '', summary });
  let out;
  for (let attempt = 1; attempt <= 2 && !out; attempt++) {
    try {
      out = extractJson(await runClaude(prompt, { system: 'You output only valid JSON, nothing else.', timeoutMs: 240000 }));
      if (!out.markdown || typeof out.markdown !== 'string' || !/\n\s*[-*]\s+/.test(out.markdown)) out = null;
    } catch (e) {
      log('learn', `attempt ${attempt} failed: ${e.message}`);
    }
  }
  if (!out) return { changed: false, notes: ['The AI answer could not be used. Try again later.'] };

  const markdown = trimRulesToWords(out.markdown, 350);
  const unchanged = markdown.trim() === String(current.markdown || '').trim();
  const history = [{ at: current.updated_at || nowIso(), source: current.source || 'default', markdown: current.markdown || '' }, ...(current.history || [])].slice(0, 10);
  await setSetting('writing_rules', unchanged
    ? { ...current, last_learned_at: nowIso() }
    : { source: 'learned', updated_at: nowIso(), last_learned_at: nowIso(), markdown, history });
  return { changed: !unchanged, notes: Array.isArray(out.notes) ? out.notes.slice(0, 8).map(String) : [] };
}

export const jobs = {
  learn_filters: () => learnFilters(),
  learn_writing: () => learnWriting(),
};

export const tasks = [
  {
    name: 'learn-filters', everyMs: 3600000, initialDelayMs: 30000,
    async run() {
      const fl = await getSetting('filter_learning');
      if (!fl.generated_at || Date.now() - new Date(fl.generated_at).getTime() > 24 * 3600000) {
        const r = await learnFilters();
        log('learn', `filters refreshed (${r.total} leads)`);
      }
    },
  },
  {
    name: 'learn-writing', everyMs: 6 * 3600000, initialDelayMs: 60000,
    async run() {
      const rules = await getSetting('writing_rules');
      const events = await eventsSince(rules.last_learned_at);
      if (events.length >= 5) {
        const r = await learnWriting();
        log('learn', `writing rules ${r.changed ? 'updated' : 'unchanged'}`);
      }
    },
  },
];
