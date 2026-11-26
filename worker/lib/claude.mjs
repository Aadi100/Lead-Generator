import { getSetting } from './settings.mjs';
import { callApi, PROVIDERS } from './ai-http.mjs';

let chain = Promise.resolve();

// Which AI is used is chosen in Settings > AI writer. Every choice uses a key.
async function chosen() {
  const ai = await getSetting('ai');
  const provider = PROVIDERS[ai.provider] ? ai.provider : 'gemini';
  const cfg = ai[provider] || {};
  return { provider, key: String(cfg.api_key || '').trim(), model: String(cfg.model || '').trim() };
}

export async function claudeStatus() {
  try {
    const c = await chosen();
    return {
      available: !!c.key,
      version: `${PROVIDERS[c.provider].label} · ${c.model || PROVIDERS[c.provider].model}`,
      bin: c.provider,
      provider: c.provider,
      error: c.key ? undefined : 'No key saved',
    };
  } catch (e) {
    return { available: false, version: null, bin: null, provider: null, error: e.message };
  }
}

// One call at a time so a burst of jobs cannot use up the key's rate limit.
export function runClaude(prompt, { system, timeoutMs = 180000 } = {}) {
  const run = async () => {
    const c = await chosen();
    return callApi(c.provider, { key: c.key, model: c.model, system, prompt }, { timeoutMs });
  };
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

export function extractJson(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstObj = t.indexOf('{');
  const firstArr = t.indexOf('[');
  const start = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start === -1) throw new Error('No JSON found in the AI reply');
  const open = t[start];
  const end = t.lastIndexOf(open === '{' ? '}' : ']');
  if (end <= start) throw new Error('Incomplete JSON in the AI reply');
  return JSON.parse(t.slice(start, end + 1));
}
