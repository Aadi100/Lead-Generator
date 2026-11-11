const list = (a) => (Array.isArray(a) && a.length ? a.join('; ') : '');
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export const DRAFT_SYSTEM = [
  'You write short, honest outreach messages for a freelancer who builds websites, apps and designs.',
  'You output only valid JSON, nothing before or after it.',
  'Write like a thoughtful person, not a marketer: plain words, no hype, no buzzwords, no exclamation marks, no emojis, no em dashes.',
].join(' ');

export function buildDraftPrompt({ lead, profile = {}, summary = {}, targeting = {}, rules, channel, steps, current, instruction, allowedLinks = [] }) {
  const sender = [
    targeting.work_description ? `The sender describes their work: ${clip(targeting.work_description, 600)}` : '',
    targeting.job_description ? `The jobs the sender wants to win: ${clip(targeting.job_description, 500)}` : '',
    `Name: ${profile.your_name || '(not set)'}`,
    profile.business_name || summary.business_name ? `Business: ${profile.business_name || summary.business_name}` : '',
    profile.headline ? `One-liner: ${profile.headline}` : '',
    list(profile.services) || list(summary.services) ? `Services: ${list(profile.services) || list(summary.services)}` : '',
    list(summary.strengths) ? `Strengths: ${list(summary.strengths)}` : '',
    list(summary.portfolio_highlights) ? `Real work you may mention: ${list(summary.portfolio_highlights)}` : '',
    summary.voice ? `Voice: ${summary.voice}` : '',
    list(summary.sample_phrases) ? `Phrases they use: ${list(summary.sample_phrases)}` : '',
    profile.notes ? `Notes from the sender: ${clip(profile.notes, 400)}` : '',
    profile.signature ? `Sign-off (use exactly): ${profile.signature}` : profile.your_name ? `Sign off with the name: ${profile.your_name}` : 'No name is known: end without a signature.',
    allowedLinks.length ? `Links you may use (only these): ${allowedLinks.join(', ')}` : 'Do not include any links.',
  ].filter(Boolean).join('\n');

  const target = [
    `Lead title: ${clip(lead.title, 200)}`,
    `Where it was found: ${lead.source}${lead.source_detail ? ' / ' + lead.source_detail : ''}`,
    lead.category ? `Category: ${lead.category}` : '',
    lead.budget && lead.budget !== 'TBD' ? `Budget: ${lead.budget}` : '',
    lead.owner_name ? `Contact name: ${lead.owner_name}${lead.owner_title ? ' (' + lead.owner_title + ')' : ''}` : '',
    lead.company_name ? `Company: ${lead.company_name}` : '',
    lead.website ? `Their website: ${lead.website}` : '',
    lead.opportunity ? `Observed about their site: ${clip(lead.opportunity, 300)}` : '',
    `What they wrote or what is known:\n${clip(lead.description, 1400)}`,
  ].filter(Boolean).join('\n');

  const followups = steps.filter((s) => s > 1);
  const channelRules = channel === 'manual'
    ? 'Channel: a direct message or a bid on a platform. No subject line. Step 1 under 90 words.'
    : 'Channel: email. Step 1 under 120 words. Provide one subject line under 8 words that is specific to them and not clickbait.';

  return [
    'Write the outreach below.',
    '',
    '# Sender',
    sender,
    '',
    '# Lead',
    target,
    '',
    '# Writing rules (follow strictly)',
    rules,
    '',
    '# Hard requirements',
    channelRules,
    followups.length ? `Follow-ups (steps ${followups.join(' and ')}): under 70 words each, add something new or a lighter question, never guilt the reader.` : 'No follow-ups.',
    'Open with something specific from their post or website. Make one concrete offer and ask for one easy next step.',
    lead.owner_name ? `Greet them by first name (${lead.owner_name.split(' ')[0]}).` : 'You do not know their name: use "Hi," or "Hello," and never "Dear Sir".',
    'Never invent clients, prices, results, deadlines or facts about the sender or the lead. If a detail is not above, leave it out.',
    'No placeholders in brackets, no "Subject:" line inside a body, no markdown, no mention of being an AI.',
    current?.length ? `\n# Current draft to rewrite\n${current.map((c) => `Step ${c.step}${c.subject ? ' (subject: ' + c.subject + ')' : ''}:\n${c.body}`).join('\n\n')}` : '',
    instruction ? `\n# Instruction from the sender (obey it)\n${clip(instruction, 600)}` : '',
    '',
    `Return JSON exactly like: {"subject": "${channel === 'manual' ? '' : '...'}", "messages": [${steps.map((s) => `{"step": ${s}, "body": "..."}`).join(', ')}]}`,
  ].filter((l) => l !== '').join('\n');
}
