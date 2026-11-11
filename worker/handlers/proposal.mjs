import { sb } from '../lib/db.mjs';
import { getSetting } from '../lib/settings.mjs';
import { runClaude, claudeStatus } from '../lib/claude.mjs';

// Optional helper for the proposal builder: writes a short plain-language summary the user can edit.
// It only returns text; the dashboard puts it in the summary box and nothing is saved or sent.

const SYSTEM = [
  'You write the short summary paragraph at the top of a freelancer proposal.',
  'Plain words, two to four sentences, first person ("I will"), no hype, no buzzwords, no exclamation marks, no emojis, no em dashes, no markdown.',
  'Only mention things that are supported by the facts you are given. Never invent prices, dates, results or promises.',
  'Output only the paragraph.',
].join(' ');

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function summarize(payload) {
  const [profile, summary] = await Promise.all([getSetting('profile'), getSetting('profile_summary')]);
  let lead = null;
  if (payload.lead_id) ({ data: lead } = await sb.from('leads').select('title,description,category,budget,source').eq('id', payload.lead_id).maybeSingle());
  const items = Array.isArray(payload.items) ? payload.items.map((x) => clip(x, 120)).filter(Boolean).slice(0, 12) : [];
  const prompt = [
    'Write the proposal summary.',
    '',
    `Proposal title: ${clip(payload.title, 160) || '(none)'}`,
    payload.client_name ? `Client: ${clip(payload.client_name, 120)}` : '',
    lead ? `What the client asked for: ${clip(lead.title, 200)}. ${clip(lead.description, 1200)}` : '',
    lead?.budget ? `Their stated budget: ${clip(lead.budget, 60)}` : '',
    items.length ? `What is included: ${items.join('; ')}` : '',
    payload.timeline_days ? `Timeline: ${Number(payload.timeline_days)} days` : '',
    '',
    `About me: ${[profile.your_name, profile.business_name || summary.business_name, profile.headline, summary.summary].filter(Boolean).map((x) => clip(x, 300)).join('. ') || '(not set)'}`,
    (profile.services?.length || summary.services?.length) ? `My services: ${(profile.services?.length ? profile.services : summary.services).slice(0, 8).join(', ')}` : '',
  ].filter((l) => l !== '').join('\n');

  const status = await claudeStatus();
  if (!status.available) throw new Error('The AI helper is not available on this computer. Write the summary yourself, or install and sign in to the Claude CLI.');
  const text = clip(await runClaude(prompt, { system: SYSTEM, timeoutMs: 120000 }), 900);
  if (!text) throw new Error('The AI returned nothing. Try again.');
  return { summary: text };
}

export const jobs = {
  draft_proposal_summary: (job) => summarize(job.payload || {}),
};
