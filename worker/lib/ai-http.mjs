// Talks to AI services that use a key (Claude API, Gemini, DeepSeek). Pure builders + parsers are exported for tests.
// The key is sent in a header, never in the web address, so it cannot end up in logs.

export const PROVIDERS = {
  anthropic: { label: 'Claude (API key)', model: 'claude-sonnet-5-5' },
  gemini: { label: 'Google Gemini', model: 'gemini-2.5-flash' },
  deepseek: { label: 'DeepSeek', model: 'deepseek-chat' },
};

export function buildRequest(provider, { key, model, system, prompt, maxTokens = 4096 }) {
  const m = (model || '').trim() || PROVIDERS[provider]?.model;
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: { model: m, max_tokens: maxTokens, ...(system ? { system } : {}), messages: [{ role: 'user', content: prompt }] },
    };
  }
  if (provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      },
    };
  }
  if (provider === 'deepseek') {
    return {
      url: 'https://api.deepseek.com/chat/completions',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: { model: m, max_tokens: maxTokens, stream: false, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] },
    };
  }
  throw new Error(`Unknown AI provider: ${provider}`);
}

export function parseResponse(provider, json) {
  let text = '';
  if (provider === 'anthropic') text = (json?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  else if (provider === 'gemini') text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  else if (provider === 'deepseek') text = json?.choices?.[0]?.message?.content || '';
  text = String(text).trim();
  if (!text) throw new Error('The AI sent back an empty answer');
  return text;
}

/** A short, plain message for a failed call. Never includes the key. */
export function explainError(provider, status, bodyText) {
  const name = PROVIDERS[provider]?.label || provider;
  let detail = '';
  try {
    const j = JSON.parse(bodyText);
    detail = j?.error?.message || j?.error || j?.message || '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch {
    detail = String(bodyText || '').slice(0, 200);
  }
  detail = detail.slice(0, 220);
  if (status === 401 || status === 403) return `${name} rejected the key (${status}). Check that the key is right and has access.${detail ? ` ${detail}` : ''}`;
  if (status === 402) return `${name} says the account has no balance left. Add credit, then try again.`;
  if (status === 429) return `${name} says too many requests or the limit is used up (429). Try again later.`;
  return `${name} error ${status}${detail ? `: ${detail}` : ''}`;
}

export async function callApi(provider, opts, { timeoutMs = 180000, fetchImpl = fetch } = {}) {
  if (!opts.key) throw new Error(`No key saved for ${PROVIDERS[provider]?.label || provider} (Settings > AI writer)`);
  const req = buildRequest(provider, opts);
  let res;
  try {
    res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error(`${PROVIDERS[provider].label} did not answer in ${Math.round(timeoutMs / 1000)}s`);
    throw new Error(`Could not reach ${PROVIDERS[provider].label}: ${e.message}`);
  }
  const raw = await res.text();
  if (!res.ok) throw new Error(explainError(provider, res.status, raw));
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`${PROVIDERS[provider].label} sent something that is not JSON`);
  }
  return parseResponse(provider, json);
}
