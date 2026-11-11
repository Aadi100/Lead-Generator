import { clamp } from './util.mjs';

const emptyBucket = () => ({ total: 0, pitched: 0, replied: 0, won: 0, lost: 0, ignored: 0 });
const FIELD = { Pitched: 'pitched', Replied: 'replied', Won: 'won', Lost: 'lost', Ignored: 'ignored' };

export function weightOf(b) {
  const pos = b.pitched + 2 * b.replied + 3 * b.won;
  const neg = b.ignored + b.lost;
  return clamp(Math.round((20 * (pos - neg)) / (b.total + 5)), -15, 15);
}

function finish(b) {
  const t = b.total || 1;
  return { ...b, win_rate: +(b.won / t).toFixed(3), reply_rate: +((b.replied + b.won) / t).toFixed(3), ignore_rate: +(b.ignored / t).toFixed(3), weight: weightOf(b) };
}

function tagsOf(lead) {
  let t = lead.tags;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = []; } }
  return Array.isArray(t) ? t.map((x) => String(x).toLowerCase()) : [];
}

export function buildBuckets(leads) {
  const by = { source: {}, category: {}, detail: {}, tag: {} };
  const add = (group, name, status) => {
    if (!name) return;
    const b = (by[group][name] ||= emptyBucket());
    b.total++;
    if (FIELD[status]) b[FIELD[status]]++;
  };
  for (const l of leads) {
    add('source', l.source, l.status);
    add('category', l.category, l.status);
    add('detail', l.source_detail, l.status);
    for (const t of new Set(tagsOf(l))) add('tag', t, l.status);
  }
  const fin = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, finish(v)]));
  const topTags = Object.entries(by.tag).sort((a, b) => b[1].total - a[1].total).slice(0, 30);
  return {
    total: leads.length,
    by_source: fin(by.source), by_category: fin(by.category), by_detail: fin(by.detail), by_tag: fin(Object.fromEntries(topTags)),
  };
}

const pct = (x) => Math.round(x * 100);

export function buildInsights(b) {
  const out = [];
  const groups = [['source', b.by_source], ['category', b.by_category], ['source detail', b.by_detail], ['tag', b.by_tag]];
  for (const [label, obj] of groups) {
    for (const [name, v] of Object.entries(obj)) {
      if (v.total < 8) continue;
      if (v.ignore_rate >= 0.7) out.push(`You ignored ${pct(v.ignore_rate)}% of leads from ${label} "${name}" (${v.ignored} of ${v.total}).`);
      else if (v.reply_rate >= 0.25) out.push(`Leads from ${label} "${name}" often get replies or wins (${pct(v.reply_rate)}% of ${v.total}).`);
    }
  }
  return out.slice(0, 12);
}

export function suggestedHide(byTag) {
  return Object.entries(byTag)
    .filter(([, v]) => v.total >= 8 && v.ignore_rate >= 0.85)
    .map(([value, v]) => ({ kind: 'tag', value, reason: `You ignored ${v.ignored} of ${v.total} leads with this tag.` }));
}

const trim = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export function summarizeEvents(events) {
  const edits = []; const ratings = []; const instructions = []; const replies = [];
  for (const e of events) {
    const d = e.data || {};
    if (e.kind === 'draft_edit' && edits.length < 30) edits.push({ original: trim(d.original_body, 700), final: trim(d.final_body, 700), subject_before: d.original_subject, subject_after: d.final_subject });
    else if (e.kind === 'rating' && ratings.length < 20) ratings.push({ rating: d.rating, note: trim(d.note || d.feedback_note, 300), body: trim(d.body, 400) });
    else if (e.kind === 'rewrite_instruction' && instructions.length < 15) instructions.push(trim(d.instruction, 300));
    else if (e.kind === 'reply' && replies.length < 30) replies.push({ category: d.category, step: d.step });
  }
  return { edits, ratings, instructions, replies };
}

export function buildLearningPrompt({ rules, summary }) {
  const { edits, ratings, instructions, replies } = summary;
  const replyCounts = replies.reduce((m, r) => ((m[r.category] = (m[r.category] || 0) + 1), m), {});
  return [
    'Update the writing rules a freelancer uses for outreach messages, based on how they edited and rated the AI drafts.',
    '',
    '# Current rules',
    rules,
    '',
    '# Edits the user made before sending (AI draft -> what they actually sent)',
    edits.length ? edits.map((e, i) => `${i + 1}. AI: ${e.original}\n   SENT: ${e.final}`).join('\n') : '(none)',
    '',
    '# Thumbs up/down',
    ratings.length ? ratings.map((r) => `- ${r.rating}${r.note ? ': ' + r.note : ''}${r.body ? ' | draft: ' + r.body : ''}`).join('\n') : '(none)',
    '',
    '# Instructions the user gave when asking for a rewrite',
    instructions.length ? instructions.map((i) => `- ${i}`).join('\n') : '(none)',
    '',
    '# Replies received',
    Object.keys(replyCounts).length ? JSON.stringify(replyCounts) : '(none)',
    '',
    'Rules for your answer:',
    '- Keep every existing rule that the evidence does not contradict, especially rules the user wrote by hand.',
    '- Add or change a rule only when the evidence shows a pattern (for example the user always shortens the opening, removes a phrase, or asks for a warmer tone).',
    '- Write short, specific, checkable rules as a markdown list under the heading "# Writing rules". Under 350 words in total.',
    '- Never include names, personal data or the text of specific leads.',
    'Return ONLY JSON: {"markdown": "# Writing rules\\n- ...", "notes": ["what you changed and why, one short line each"]}',
  ].join('\n');
}

export function trimRulesToWords(md, max = 350) {
  const lines = String(md || '').split('\n');
  const out = [];
  let words = 0;
  for (const l of lines) {
    const w = (l.match(/\S+/g) || []).length;
    if (words + w > max) break;
    out.push(l);
    words += w;
  }
  return out.join('\n').trim();
}
