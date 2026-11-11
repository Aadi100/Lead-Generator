// A small, explainable model of what wins for this user. Pure functions, no database.
//
// Labelled leads: positive = Replied or Won (Won counts double), negative = Ignored or Lost.
// Unlabelled (New, Pitched) leads are not used for training; they are only scored.
// Each feature (source, category, budget band, has email, trust band, channel, topic) gets a Laplace
// smoothed positive rate. Its contribution is the log-odds lift over the overall rate, damped for small
// samples. A lead's score is 50 for an average lead, higher when its features have won more often.

export const MIN_EXAMPLES = 20; // labelled leads before the model speaks at all
export const MIN_CLASS = 4; // and at least this many of each kind
export const MIN_FEATURE_N = 5; // a feature needs this many labelled leads to count
const DAMP = 8;
const LABEL_WEIGHT = { Won: 2, Replied: 1, Ignored: 1, Lost: 1 };
const POSITIVE = new Set(['Won', 'Replied']);
const DEAL_WON = new Set(['agreed', 'paid', 'delivered', 'done']);
const DEAL_LOST = new Set(['cancelled', 'disputed']);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const pct = (x) => Math.round(x * 100);

function tagsOf(lead) {
  let t = lead.tags;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = []; } }
  return Array.isArray(t) ? t.map((x) => String(x).toLowerCase().trim()).filter(Boolean) : [];
}

export function budgetBand(amount) {
  const n = Number(amount) || 0;
  if (n <= 0) return 'unknown';
  if (n < 100) return 'under100';
  if (n < 500) return '100to499';
  if (n < 2000) return '500to1999';
  return '2000plus';
}
const BAND_LABEL = { unknown: 'No budget stated', under100: 'Budget under $100', '100to499': 'Budget $100 to $499', '500to1999': 'Budget $500 to $1,999', '2000plus': 'Budget $2,000 or more' };

export function trustBand(lead) {
  const s = lead.trust_score;
  if (s === null || s === undefined) return lead.trust_level ? String(lead.trust_level).toLowerCase() : 'unknown';
  return s >= 70 ? 'high' : s >= 45 ? 'medium' : 'low';
}

export function hasEmail(lead) {
  return !!(lead.best_email || /email:\s*\S+@/i.test(String(lead.contact || '')));
}

// Every feature a lead has, as { key, group, label }. Topic features are averaged inside their group.
export function featuresOf(lead) {
  const f = [];
  if (lead.source) f.push({ key: `source:${lead.source}`, group: 'source', label: `${lead.source} leads` });
  if (lead.category) f.push({ key: `category:${lead.category}`, group: 'category', label: `${lead.category} leads` });
  if (lead.source_detail) f.push({ key: `detail:${lead.source_detail}`, group: 'detail', label: `Posts from ${lead.source_detail}` });
  const band = budgetBand(lead.budget_amount);
  f.push({ key: `budget:${band}`, group: 'budget', label: BAND_LABEL[band] });
  f.push({ key: `email:${hasEmail(lead) ? 'yes' : 'no'}`, group: 'email', label: hasEmail(lead) ? 'Has a contact email' : 'No contact email' });
  const tb = trustBand(lead);
  if (tb !== 'unknown') f.push({ key: `trust:${tb}`, group: 'trust', label: `${tb[0].toUpperCase()}${tb.slice(1)} trust leads` });
  for (const t of [...new Set(tagsOf(lead))].slice(0, 8)) f.push({ key: `topic:${t}`, group: 'topic', label: `Mentions "${t}"` });
  return f;
}

// Turns lead rows (+ optional deals) into labelled examples. Deals win over the lead status.
export function labelExamples(leads, deals = []) {
  const byLead = new Map();
  for (const d of deals) {
    if (!d.lead_id) continue;
    const cur = byLead.get(d.lead_id);
    if (DEAL_WON.has(d.stage)) byLead.set(d.lead_id, 'Won');
    else if (DEAL_LOST.has(d.stage) && cur !== 'Won') byLead.set(d.lead_id, 'Lost');
  }
  const out = [];
  for (const lead of leads) {
    if (lead.lead_kind === 'trade') continue;
    const status = byLead.get(lead.id) || (lead.status === 'Closed' ? 'Won' : lead.status);
    if (!LABEL_WEIGHT[status]) continue;
    out.push({ lead, status, positive: POSITIVE.has(status), weight: LABEL_WEIGHT[status] });
  }
  return out;
}

export function trainModel(examples) {
  const pos = examples.filter((e) => e.positive).length;
  const neg = examples.length - pos;
  const base = { examples: examples.length, positives: pos, negatives: neg, min_examples: MIN_EXAMPLES };
  if (examples.length < MIN_EXAMPLES || pos < MIN_CLASS || neg < MIN_CLASS) {
    const need = examples.length < MIN_EXAMPLES
      ? `${MIN_EXAMPLES - examples.length} more leads with a clear outcome (replied, won, ignored or lost)`
      : `at least ${MIN_CLASS} leads of each kind (some that got replies or wins, some you ignored or lost)`;
    return { ...base, status: 'insufficient', note: `Not enough data yet. It needs ${need}.`, features: {}, base_rate: null, weight: 0 };
  }
  const wPos = examples.filter((e) => e.positive).reduce((s, e) => s + e.weight, 0);
  const wAll = examples.reduce((s, e) => s + e.weight, 0);
  const baseRate = (wPos + 1) / (wAll + 2);
  const acc = new Map();
  for (const e of examples) {
    for (const f of featuresOf(e.lead)) {
      const a = acc.get(f.key) || { ...f, n: 0, pos: 0, neg: 0, wPos: 0, wAll: 0 };
      a.n += 1;
      if (e.positive) a.pos += 1; else a.neg += 1;
      if (e.positive) a.wPos += e.weight;
      a.wAll += e.weight;
      acc.set(f.key, a);
    }
  }
  const features = {};
  for (const a of acc.values()) {
    if (a.n < MIN_FEATURE_N) continue;
    const rate = (a.wPos + 1) / (a.wAll + 2); // Laplace smoothing
    const contrib = (logit(rate) - logit(baseRate)) * (a.n / (a.n + DAMP));
    features[a.key] = { key: a.key, group: a.group, label: a.label, n: a.n, pos: a.pos, neg: a.neg, rate: +rate.toFixed(3), contrib: +contrib.toFixed(3) };
  }
  const weight = +clamp(0.15 + (examples.length - MIN_EXAMPLES) / 300, 0.15, 0.5).toFixed(2);
  return { ...base, status: 'ready', note: null, base_rate: +baseRate.toFixed(3), weight, features };
}

function reasonText(f, baseRate) {
  const share = f.pos / f.n;
  if (f.contrib >= 0) return `${f.label}: ${f.pos} of ${f.n} got a reply or win (${pct(share)}%, you average ${pct(baseRate)}%)`;
  return `${f.label}: ${f.neg} of ${f.n} were ignored or lost (${pct(1 - share)}%)`;
}

export function scoreLead(model, lead) {
  if (!model || model.status !== 'ready') return null;
  const byGroup = new Map();
  for (const f of featuresOf(lead)) {
    const m = model.features[f.key];
    if (!m) continue;
    const g = byGroup.get(m.group) || [];
    g.push(m);
    byGroup.set(m.group, g);
  }
  let total = 0;
  const used = [];
  for (const list of byGroup.values()) {
    const contrib = list.reduce((s, m) => s + m.contrib, 0) / list.length; // topics are averaged, not stacked
    total += contrib;
    const strongest = [...list].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))[0];
    used.push({ ...strongest, contrib });
  }
  // Features overlap (a source usually brings its own category and budget), so signals are damped by the square
  // root of how many were used instead of simply added. This keeps scores from reaching extremes on thin data.
  const damped = used.length ? total / Math.sqrt(used.length) : 0;
  const score = clamp(Math.round(100 * sigmoid(damped)), 1, 99);
  const reasons = used
    .filter((u) => Math.abs(u.contrib) >= 0.12)
    .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
    .slice(0, 4)
    .map((u) => ({ text: reasonText(u, model.base_rate), effect: u.contrib >= 0 ? 'up' : 'down', n: u.n, label: u.label }));
  return { score, reasons };
}

// Blend that never hides the original: with a thin model the fit score dominates.
export function blendScore(fit, learned, weight) {
  if (learned === null || learned === undefined) return fit ?? null;
  if (fit === null || fit === undefined) return learned;
  const w = clamp(Number(weight) || 0, 0, 0.5);
  return Math.round(fit * (1 - w) + learned * w);
}

export function summarizeModel(model, limit = 6) {
  if (model.status !== 'ready') return { top_positive: [], top_negative: [] };
  const list = Object.values(model.features);
  const row = (f) => ({ key: f.key, group: f.group, label: f.label, n: f.n, pos: f.pos, neg: f.neg, share: +(f.pos / f.n).toFixed(3), contrib: f.contrib });
  return {
    top_positive: list.filter((f) => f.contrib >= 0.15).sort((a, b) => b.contrib - a.contrib).slice(0, limit).map(row),
    top_negative: list.filter((f) => f.contrib <= -0.15).sort((a, b) => a.contrib - b.contrib).slice(0, limit).map(row),
  };
}
