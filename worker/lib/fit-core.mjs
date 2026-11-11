import { clamp } from './util.mjs';
import { matchTrade } from './trade-match.mjs';

const CATEGORY_WORDS = {
  Website: ['website', 'web ', 'shopify', 'wordpress', 'frontend', 'front-end', 'landing', 'e-commerce', 'ecommerce', 'next.js', 'react'],
  App: ['app', 'mobile', 'ios', 'android', 'flutter', 'react native'],
  Design: ['design', 'logo', 'brand', 'ui', 'ux', 'figma', 'graphic'],
  Automation: ['automation', 'automate', 'n8n', 'zapier', 'workflow', 'bot', 'integration', 'ai '],
};

const lower = (v) => String(v || '').toLowerCase();
const arr = (v) => (Array.isArray(v) ? v : []);

function tagsOf(lead) {
  let t = lead.tags;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = []; } }
  return arr(t).map(lower);
}

function computeTradeFit(lead, trading, stock) {
  const reasons = [];
  let score = (lead.trust_score ?? 50) * 0.5;
  const match = matchTrade(lead, trading, undefined, stock);
  if (match) {
    score += 25;
    reasons.push(match.label);
    if (lead.trust_level === 'High' || (lead.trust_score ?? 0) >= 70) { score += 5; reasons.push('High trust'); }
  } else {
    score = Math.min(score, 60);
    reasons.push('Does not match anything you listed in Settings > Trading');
  }
  if (lead.is_suspicious) { score -= 30; reasons.push('Flagged as suspicious'); }
  return { score: clamp(Math.round(score), 1, 99), reasons: reasons.slice(0, 6), trade_match: match ? match.label : null };
}

export function computeFit(lead, { profile = {}, summary = {}, filterLearning = {}, targeting = {}, trading = {}, stock } = {}) {
  if (lead.lead_kind === 'trade') return computeTradeFit(lead, trading, stock);
  const reasons = [];
  const isProspect = lead.lead_kind === 'prospect';
  let score = isProspect ? 40 : (lead.trust_score ?? 50) * 0.5;

  const offerText = lower([...arr(profile.services), ...arr(summary.services), ...arr(summary.what_you_sell)].join(' ') + ' ' + (profile.headline || ''));
  if (offerText.trim() && lead.category) {
    const words = CATEGORY_WORDS[lead.category] || [];
    if (words.some((w) => offerText.includes(w))) { score += 15; reasons.push(`Matches what you offer (${lead.category})`); }
  }

  const text = lower(`${lead.title} ${lead.description}`) + ' ' + tagsOf(lead).join(' ');
  const hits = [...new Set(arr(summary.keywords_target).map(lower).filter((k) => k && text.includes(k)))];
  if (hits.length) { score += Math.min(15, hits.length * 3); reasons.push(`Mentions ${hits.slice(0, 4).join(', ')}`); }
  const avoid = arr(summary.keywords_avoid).map(lower).find((k) => k && text.includes(k));
  if (avoid) { score -= 20; reasons.push(`Mentions "${avoid}", which you want to avoid`); }

  const mine = [...new Set([...arr(targeting.keywords), ...arr(targeting.topics)].map(lower).filter((k) => k && text.includes(k)))];
  if (mine.length) { score += Math.min(20, mine.length * 5); reasons.push(`Matches your keywords: ${mine.slice(0, 4).join(', ')}`); }
  const skip = arr(targeting.exclude).map(lower).find((k) => k && text.includes(k));
  if (skip) { score -= 25; reasons.push(`Mentions "${skip}", which you asked to skip`); }

  const amount = Number(lead.budget_amount) || 0;
  const minBudget = Number(targeting.min_budget) || 0;
  if (minBudget && amount > 0 && amount < minBudget) { score -= 8; reasons.push(`Budget is below your minimum of $${minBudget}`); }
  if (amount >= 1000) { score += 8; reasons.push('Budget of $1,000 or more'); }
  else if (amount >= 300) { score += 5; reasons.push('Budget of $300 or more'); }
  if (lead.best_email) { score += 5; reasons.push('A contact email was found'); }

  const weights = [
    [filterLearning.by_source, lead.source, 'source'],
    [filterLearning.by_category, lead.category, 'category'],
    [filterLearning.by_detail, lead.source_detail, 'channel'],
  ].map(([obj, key, label]) => (obj && key && obj[key] ? { w: obj[key].weight || 0, label, key } : null)).filter(Boolean);
  if (weights.length) {
    const avg = clamp(weights.reduce((s, x) => s + x.w, 0) / weights.length, -15, 15);
    score += avg;
    if (Math.abs(avg) >= 1) reasons.push(`${avg > 0 ? 'Good' : 'Poor'} history with ${weights.map((x) => x.key).join(' / ')} (${avg > 0 ? '+' : ''}${Math.round(avg)})`);
  }

  if (lead.is_suspicious) { score -= 30; reasons.push('Flagged as suspicious'); }
  return { score: clamp(Math.round(score), 1, 99), reasons: reasons.slice(0, 6) };
}
