import type { Lead } from './types';

/** Share of the "Best match" order that comes from what you have won before (0 to 0.5). Zero when the model has nothing to say. */
export function learnedShare(lead: Pick<Lead, 'learned_score' | 'learned_weight'>): number {
  if (lead.learned_score === null || lead.learned_score === undefined) return 0;
  const w = lead.learned_weight ?? 0;
  return Math.max(0, Math.min(0.5, w));
}

/** Best match score: your fit score, nudged by what has worked for you. The fit score itself is never replaced. */
export function rankScore(lead: Pick<Lead, 'fit_score' | 'learned_score' | 'learned_weight'>): number | null {
  const w = learnedShare(lead);
  if (lead.learned_score === null || w === 0) return lead.fit_score;
  if (lead.fit_score === null) return lead.learned_score;
  return Math.round(lead.fit_score * (1 - w) + lead.learned_score * w);
}
