// Help module: all help text in one place so it can be searched client-side.

export type HelpLink = { label: string; href: string };
export type HelpEntry = { id: string; title: string; body: string; links?: HelpLink[] };
export type HelpSection = { id: string; title: string; blurb?: string; entries: HelpEntry[] };

export const GETTING_STARTED: (HelpEntry & { step: number })[] = [
  { step: 1, id: 'gs-profile', title: 'Tell Lead Radar about you', body: 'Add your name, services and website links. Pitches are written from this, so the more real detail you give, the less they sound like a template.', links: [{ label: 'Open Profile & links', href: '/settings?tab=profile' }] },
  { step: 2, id: 'gs-targeting', title: 'Say what work you want', body: 'Add keywords for the jobs you want and words to avoid. This is how leads get a fit score.', links: [{ label: 'Open Targeting', href: '/settings?tab=targeting' }] },
  { step: 3, id: 'gs-worker', title: 'Start the worker and check your sources', body: 'The worker is a small program on your computer that enriches leads, writes drafts and sends email. Run npm run worker in the project folder and keep it open. Then check that your sources are healthy.', links: [{ label: 'Check Sources', href: '/sources' }] },
  { step: 4, id: 'gs-email', title: 'Connect email sending', body: 'Choose Resend or your own SMTP login so approved messages can go out. You can also connect your inbox so replies are tracked.', links: [{ label: 'Email sending', href: '/settings?tab=email' }, { label: 'Reply tracking', href: '/settings?tab=replies' }] },
  { step: 5, id: 'gs-leads', title: 'Look through your first leads', body: 'New leads appear in Leads as the sources find them. Open one, read the post, check the trust score and ignore anything that does not fit.', links: [{ label: 'Open Leads', href: '/leads' }] },
  { step: 6, id: 'gs-approve', title: 'Review and approve a message', body: 'Draft a pitch, edit it, then approve it in the Outbox. Nothing is ever sent until you approve it.', links: [{ label: 'Open Outbox', href: '/outbox' }] },
];

export const MODULES: HelpEntry[] = [
  { id: 'm-dashboard', title: 'Dashboard', body: 'Your day at a glance: new and high-match leads, drafts to review, replies waiting, deals and revenue, plus a to-do list for today and the health of your sources.', links: [{ label: 'Open', href: '/' }] },
  { id: 'm-leads', title: 'Leads', body: 'Every service lead found by the sources. Filter by status, search, open a lead to see the post, company details, messages and notes. Create a deal or a task straight from a lead.', links: [{ label: 'Open', href: '/leads' }] },
  { id: 'm-pipeline', title: 'Pipeline', body: 'A board of your leads by stage: New, Pitched, Replied, Won and Lost. Drag a card, or use its Move to menu, to change its stage.', links: [{ label: 'Open', href: '/pipeline' }] },
  { id: 'm-outbox', title: 'Outbox', body: 'Everything about messages: drafts to review, what is sending or scheduled, what was sent, replies you received and problems such as bounces.', links: [{ label: 'Open', href: '/outbox' }] },
  { id: 'm-tasks', title: 'Tasks', body: 'Your to-do list. Type something like "Call Sam tomorrow", pick a due date and link it to a lead or deal.', links: [{ label: 'Open', href: '/tasks' }] },
  { id: 'm-contacts', title: 'Contacts', body: 'People and companies built from enriched leads, with the best email, phone and social links, and every lead tied to them.', links: [{ label: 'Open', href: '/contacts' }] },
  { id: 'm-deals', title: 'Deals', body: 'Track paid work and trades from first talk to done: value, cost, profit and stage. View as a table or a board.', links: [{ label: 'Open', href: '/deals' }] },
  { id: 'm-trading', title: 'Game Trading', body: 'Finds people who want to buy or sell game items, matches them to what you sell, and tracks demand and prices. Set up what you sell in the Catalog.', links: [{ label: 'Overview', href: '/trading' }, { label: 'Catalog', href: '/trading/catalog' }] },
  { id: 'm-analytics', title: 'Analytics', body: 'How things are going over 7, 30 or 90 days: funnel, leads over time, which sources and categories win, and what the app has learned from your choices.', links: [{ label: 'Open', href: '/analytics' }] },
  { id: 'm-activity', title: 'Activity', body: 'One feed of everything that happened: new leads, messages sent, replies, deals and finished tasks.', links: [{ label: 'Open', href: '/activity' }] },
  { id: 'm-sources', title: 'Sources', body: 'Shows whether each place leads come from is working, when it last found something, and lets you run a source now.', links: [{ label: 'Open', href: '/sources' }] },
  { id: 'm-capture', title: 'Capture', body: 'Save a lead from any web page with a bookmark button, or paste text from a chat. Review the items before they are saved.', links: [{ label: 'Open', href: '/capture' }] },
  { id: 'm-settings', title: 'Settings', body: 'Your profile, targeting, email and reply tracking, safety limits, alerts, API keys, local prospecting, writing rules and appearance.', links: [{ label: 'Open', href: '/settings' }] },
];

export const GLOSSARY: HelpEntry[] = [
  { id: 'g-trust', title: 'Trust score', body: 'A 0 to 100 score for how likely a lead is real and safe to contact. It looks at things like scam wording, missing details and where the post came from. High is 70 or more. Low scores and flagged leads ask for an extra confirmation before sending.' },
  { id: 'g-fit', title: 'Fit score', body: 'A 0 to 100 score for how well a lead matches the work you want, based on your keywords, services and what you have won or ignored before. 70 or more counts as a high match.' },
  { id: 'g-enrich', title: 'Enrichment', body: 'The worker visits the lead website to find the company name, owner, email addresses, phone numbers and social links so you have someone to write to.' },
  { id: 'g-suppress', title: 'Suppression list', body: 'Addresses and domains you must never email again, for example people who replied "no thanks" or emails that bounced. Anything on the list is skipped automatically.' },
  { id: 'g-capture', title: 'Capture bookmark', body: 'A bookmark button you drag to your browser bar. Click it on any page, such as a job post or marketplace listing, to send that page to Lead Radar.' },
  { id: 'g-worker', title: 'Worker', body: 'A small program on your computer (npm run worker). It does the slow jobs: enriching leads, writing drafts with Claude, sending email, reading replies and scanning for trades. If it is off, those jobs wait.' },
  { id: 'g-n8n', title: 'n8n', body: 'A workflow tool that runs the scrapers (Reddit, Freelancer.com, Hacker News, We Work Remotely, your website form) and the daily summary and reminders. It reports in every 5 minutes; after 15 minutes of silence the app shows it as offline.' },
  { id: 'g-claude', title: 'Claude CLI', body: 'The Claude command line tool on your computer. The worker uses it to write pitches with your own Claude plan. Without it, simple templates are used.' },
];

export const SHORTCUTS: { keys: string[]; action: string; where: string }[] = [
  { keys: ['Ctrl', 'K'], action: 'Open the command palette (jump to any page, search leads, run actions)', where: 'Anywhere (use Cmd + K on Mac)' },
  { keys: ['↑', '↓'], action: 'Move through results', where: 'Command palette' },
  { keys: ['↵'], action: 'Open the highlighted result', where: 'Command palette' },
  { keys: ['Esc'], action: 'Close the palette, a drawer, a dialog or a menu', where: 'Anywhere' },
  { keys: ['←', '→'], action: 'Switch between tabs and toggles', where: 'Any tab row' },
  { keys: ['Home', 'End'], action: 'Jump to the first or last tab', where: 'Any tab row' },
  { keys: ['Tab'], action: 'Move to the next control (Shift + Tab goes back)', where: 'Anywhere' },
  { keys: ['↵'], action: 'Apply a rewrite request', where: 'Message editor, rewrite box' },
];

export const FAQ: HelpEntry[] = [
  { id: 'f-telegram', title: 'Telegram is blocked where I live. What can I use for alerts?', body: 'Use another alert channel. Alerts can go to email, WhatsApp (through CallMeBot) or a Discord webhook instead of Telegram. Turn on the ones you want under Alerts and press its test button.', links: [{ label: 'Open Alerts', href: '/settings?tab=alerts' }] },
  { id: 'f-approval', title: 'Why is nothing sent without my approval?', body: 'On purpose. The app drafts messages but only sends what you approve in the Outbox. Even auto-drafts wait for you. You can also pause all sending at any time, and a daily limit stops runaway sending.', links: [{ label: 'Safety settings', href: '/settings?tab=safety' }] },
  { id: 'f-replies', title: 'How are replies tracked?', body: 'Connect your inbox under Reply tracking. The worker checks it for answers to messages you sent, matches each to its lead, sorts it (interested, question, not interested, out of office, bounce, other) and shows it in the Outbox. A bounce or a "no" also adds the address to the suppression list.', links: [{ label: 'Reply tracking', href: '/settings?tab=replies' }] },
  { id: 'f-keys', title: 'How do I add API keys?', body: 'Open Settings, then Connections. Paste the key for the service (Serper for Google search, Indie Hackers, LinkedIn and Google Places, X, Reddit, Discord, Resend; Product Hunt works without one) and switch it on. Use the test button to check it. Keys are stored in your own database and never shown to other people. Sources shows which ones are still missing.', links: [{ label: 'Open Connections', href: '/settings?tab=connections' }, { label: 'Missing keys', href: '/sources?status=needs_key' }] },
  { id: 'f-nothing', title: 'No new leads are coming in. What do I check?', body: 'Open Sources. If n8n or the worker is offline, start it. A source marked Problem shows the reason when you hover its status. Quiet usually just means nothing new was posted yet.', links: [{ label: 'Open Sources', href: '/sources' }] },
  { id: 'f-risk', title: 'Is trading game items risky for my game accounts?', body: 'Yes, it can be. Many games ban accounts that trade items or accounts for real money, and sellers on public boards are a common scam target. Check each game rules first, use a method the platform protects, and never share passwords. Lead Radar only finds and tracks posts. It never trades for you.' },
  { id: 'f-offline', title: 'The page says the worker is off.', body: 'Open a terminal in the project folder and run npm run worker. Leave the window open. Drafting, enrichment, sending and scans wait until it is back, and nothing is lost.' },
];

export const SAFETY: HelpEntry[] = [
  { id: 's-approve', title: 'You approve every message', body: 'Nothing leaves your outbox until you approve it. Scheduled follow-ups can be cancelled until they send.' },
  { id: 's-limit', title: 'Daily sending limit', body: 'Only as many emails go out per day as you allow. The Outbox shows how much of today limit is used.' },
  { id: 's-pause', title: 'Pause sending', body: 'One switch holds all outgoing email. A banner shows while it is on. Use it if something looks wrong.' },
  { id: 's-suspicious', title: 'Suspicious leads need confirmation', body: 'Leads with scam signs or a low trust score ask you to confirm before you send, and are never auto-drafted.' },
  { id: 's-suppress', title: 'No second chances after a no', body: 'Anyone who says no, unsubscribes or bounces is added to the suppression list and skipped from then on.' },
  { id: 's-footer', title: 'Opt-out line', body: 'Every email ends with a line that lets the person say no thanks. Keep it on.' },
  { id: 's-privacy', title: 'Plain text only', body: 'Posts and replies are shown as plain text, so a lead can never run code in your dashboard. Open unknown links with care.' },
];

export const SECTION_ORDER: { id: string; title: string; blurb?: string; entries: HelpEntry[] }[] = [
  { id: 'modules', title: 'What each page does', entries: MODULES },
  { id: 'glossary', title: 'Glossary', blurb: 'Words you will see around the app.', entries: GLOSSARY },
  { id: 'faq', title: 'Questions and answers', entries: FAQ },
  { id: 'safety', title: 'Safety rules', blurb: 'What protects you and the people you contact.', entries: SAFETY },
];

export function matches(text: string, q: string): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = text.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export const entryText = (e: HelpEntry) => `${e.title} ${e.body} ${(e.links ?? []).map((l) => l.label).join(' ')}`;
