import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting, setSetting } from '../lib/settings.mjs';
import { fetchAllLeads } from '../lib/fit-db.mjs';
import { labelExamples, trainModel, scoreLead, summarizeModel } from '../lib/outcome-model.mjs';

const COLS = 'id,status,source,source_detail,category,budget_amount,trust_score,trust_level,best_email,contact,tags,lead_kind,learned_score,learned_weight,learned_at';
const nowIso = () => new Date().toISOString();

async function fetchDeals() {
  const { data } = await sb.from('deals').select('lead_id,stage').not('lead_id', 'is', null).limit(5000);
  return data || [];
}

export async function recomputeLearned() {
  const [leads, deals] = await Promise.all([fetchAllLeads(COLS), fetchDeals()]);
  const model = trainModel(labelExamples(leads, deals));
  const generatedAt = nowIso();
  await setSetting('outcome_model', {
    generated_at: generatedAt, status: model.status, note: model.note, examples: model.examples, positives: model.positives, negatives: model.negatives,
    base_rate: model.base_rate, weight: model.weight, min_examples: model.min_examples, ...summarizeModel(model),
  });

  let changed = 0;
  const todo = leads.filter((l) => l.lead_kind !== 'trade');
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async (l) => {
      const r = scoreLead(model, l);
      const score = r ? r.score : null;
      const weight = r ? model.weight : null;
      const same = score === (l.learned_score ?? null) && (weight ?? null) === (l.learned_weight ?? null) && !!l.learned_at;
      if (same) return;
      const { error } = await sb.from('leads').update({ learned_score: score, learned_reasons: r ? r.reasons : [], learned_weight: weight, learned_at: generatedAt }).eq('id', l.id);
      if (!error) changed++;
    }));
  }
  return { status: model.status, examples: model.examples, positives: model.positives, negatives: model.negatives, updated: changed };
}

export const jobs = {
  recompute_learned: () => recomputeLearned(),
};

export const tasks = [
  {
    name: 'outcome-model', everyMs: 10 * 60 * 1000, initialDelayMs: 45000,
    async run() {
      const m = await getSetting('outcome_model');
      const stale = !m.generated_at || Date.now() - new Date(m.generated_at).getTime() > 3600000;
      let due = stale;
      if (!due) {
        const { count } = await sb.from('learning_events').select('id', { count: 'exact', head: true }).in('kind', ['lead_outcome', 'deal_outcome', 'outcome']).gt('created_at', m.generated_at);
        due = (count || 0) > 0;
      }
      if (!due && m.status === 'ready') {
        const { count } = await sb.from('leads').select('id', { count: 'exact', head: true }).is('learned_at', null).not('lead_kind', 'eq', 'trade');
        due = (count || 0) > 0;
      }
      if (!due) return;
      const r = await recomputeLearned();
      log('outcome', `model ${r.status} (${r.examples} labelled leads), ${r.updated} lead(s) rescored`);
    },
  },
];
