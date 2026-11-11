import { sb } from './db.mjs';

const TTL_MS = 5000;
const cache = new Map();

function readOverride() {
  try {
    return JSON.parse(process.env.SETTINGS_OVERRIDE || '{}');
  } catch {
    return {};
  }
}

export async function getSetting(key, fallback = {}) {
  const override = readOverride();
  if (override[key] !== undefined) return { ...fallback, ...override[key] };
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const { data, error } = await sb.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(`settings ${key}: ${error.message}`);
  const value = { ...fallback, ...(data?.value || {}) };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function setSetting(key, value) {
  const { error } = await sb.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`settings ${key}: ${error.message}`);
  cache.delete(key);
}

export async function patchSetting(key, patch) {
  const { data } = await sb.from('app_settings').select('value').eq('key', key).maybeSingle();
  await setSetting(key, { ...(data?.value || {}), ...patch });
}
