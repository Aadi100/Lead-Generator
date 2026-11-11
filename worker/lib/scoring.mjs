import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'scoring-src.js'), 'utf8');

// Same classifier, buyer-intent, budget, contact and trust logic the n8n workflows use.
// targeting = the app_settings 'targeting' value (custom keywords, topics, exclude words).
export function createScorer(targeting = {}) {
  const $ = () => ({ first: () => ({ json: { value: targeting || {} } }) });
  return new Function('$', `${SOURCE}
return { buildLead, classify, isSeller, hasBuyerIntent, extractBudget, extractContacts, stripHtml, assess, ROLE_RE, NOISE_RE, has, mk };`)($);
}
