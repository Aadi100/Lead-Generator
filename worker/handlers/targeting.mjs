import { sb } from '../lib/db.mjs';
import { getSetting, setSetting } from '../lib/settings.mjs';
import { claudeStatus, runClaude, extractJson } from '../lib/claude.mjs';
import { log } from '../lib/log.mjs';

const STOP = new Set('a an and the for of to in on with from that this you your our we i my is are be as at by or it its can will not no if but about into who what which have has had them they their there more most very just than then also any all some such own like want need needs looking build built make made using use used work works working help job jobs project projects client clients'.split(' '));
const arr = (v) => (Array.isArray(v) ? v : []);
const clean = (list, max) => [...new Set(arr(list).map((s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 2 && s.length <= 60))].slice(0, max);

function heuristic(text) {
  const counts = new Map();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9.+#-]{2,}/g) || []) if (!STOP.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
  const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);
  return { keywords, topics: [], exclude: [] };
}

export async function suggestKeywords() {
  const [targeting, profile, summary] = await Promise.all([getSetting('targeting'), getSetting('profile'), getSetting('profile_summary')]);
  const text = [
    targeting.work_description && `Work I do: ${targeting.work_description}`,
    targeting.job_description && `Jobs I want: ${targeting.job_description}`,
    arr(profile.services).length && `Services: ${profile.services.join(', ')}`,
    summary.summary && `About me: ${summary.summary}`,
    arr(targeting.keywords).length && `Keywords already chosen: ${targeting.keywords.join(', ')}`,
  ].filter(Boolean).join('\n');
  if (text.trim().length < 20) throw new Error('Write a few sentences in "Describe the work you do" or "Describe the jobs you want" first.');

  let out;
  let mode = 'heuristic';
  if ((await claudeStatus()).available) {
    try {
      const prompt = [
        'A freelancer describes the work they do and the jobs they want. Suggest search terms for finding people who post requests for that work (on Reddit, freelance sites and job boards).',
        '', text, '',
        'Return ONLY JSON: {"keywords": [...], "topics": [...], "exclude": [...]}',
        'keywords: 12 to 20 short phrases (1 to 3 words) a client would literally write, lowercase, e.g. "shopify store", "landing page", "next.js".',
        'topics: 6 to 10 kinds of project or industry, e.g. "restaurant websites", "saas dashboard".',
        'exclude: 5 to 10 words that signal work this person does NOT want (unpaid, spec work, things outside their skills).',
        'Only use what the text supports. No duplicates of the chosen keywords.',
      ].join('\n');
      out = extractJson(await runClaude(prompt, { system: 'You output only valid JSON.' }));
      mode = 'claude';
    } catch (e) {
      log('targeting', `AI suggestion failed, using the simple method: ${e.message}`);
    }
  }
  if (!out) out = heuristic(text);

  const have = new Set([...arr(targeting.keywords), ...arr(targeting.topics), ...arr(targeting.exclude)].map((s) => String(s).toLowerCase()));
  const suggested = {
    generated_at: new Date().toISOString(), mode,
    keywords: clean(out.keywords, 20).filter((k) => !have.has(k)),
    topics: clean(out.topics, 12).filter((k) => !have.has(k)),
    exclude: clean(out.exclude, 12).filter((k) => !have.has(k)),
  };
  const { data } = await sb.from('app_settings').select('value').eq('key', 'targeting').maybeSingle();
  await setSetting('targeting', { ...(data?.value || {}), suggested });
  return { mode, keywords: suggested.keywords.length, topics: suggested.topics.length, exclude: suggested.exclude.length };
}

export const jobs = { suggest_keywords: suggestKeywords };
export const tasks = [];
