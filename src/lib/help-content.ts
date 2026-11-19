// Help module: all help text in one place so it can be searched client-side.

export type HelpLink = { label: string; href: string };
export type HelpEntry = { id: string; title: string; body: string; links?: HelpLink[] };
export type HelpSection = { id: string; title: string; blurb?: string; entries: HelpEntry[] };

export const GETTING_STARTED: (HelpEntry & { step: number })[] = [
  { step: 1, id: 'gs-profile', title: 'Tell Lead Radar about you', body: 'Add your name, services and website links. Messages are written from this, so the more real detail you give, the less they sound like a template.', links: [{ label: 'Open Profile & links', href: '/settings?tab=profile' }] },
  { step: 2, id: 'gs-targeting', title: 'Say what work you want', body: 'Add words for the jobs you want and words to avoid. This is how each lead gets its Fit (Strong, Good or Weak).', links: [{ label: 'Open Targeting', href: '/settings?tab=targeting' }] },
  { step: 3, id: 'gs-worker', title: 'Start the background helper and check where leads come from', body: 'The background helper is a small program on your computer that finds extra details, writes drafts and sends email. Run npm run worker in the project folder and keep it open. Then check on Sources that each place is working.', links: [{ label: 'Check Sources', href: '/sources' }] },
  { step: 4, id: 'gs-email', title: 'Connect your email', body: 'Choose an email service or your own email account so approved messages can go out. You can also connect your inbox so I can see replies.', links: [{ label: 'Email sending', href: '/settings?tab=email' }, { label: 'Inbox (replies)', href: '/settings?tab=replies' }] },
  { step: 5, id: 'gs-leads', title: 'Open a lead, write a message and approve it', body: 'New leads appear in Leads as they are found. Open one, read the post, check it says Looks real and ignore anything that does not fit. Then write a message, edit it and approve it in the Outbox. Nothing is ever sent until you approve it.', links: [{ label: 'Open Leads', href: '/leads' }, { label: 'Open Outbox', href: '/outbox' }] },
];

export const MODULES: HelpEntry[] = [
  { id: 'm-dashboard', title: 'Dashboard', body: 'Your day at a glance: what needs you today, new leads, messages to review, replies waiting and how things are going.', links: [{ label: 'Open', href: '/' }] },
  { id: 'm-leads', title: 'Leads', body: 'Every lead found for you. Filter by status, search, open a lead to see the post, company details, messages and notes. Create a deal or a task straight from a lead.', links: [{ label: 'Open', href: '/leads' }] },
  { id: 'm-pipeline', title: 'Pipeline', body: 'A board of your leads by stage: New, Pitched (message sent), Replied, Won and Lost. Drag a card, or use its Move to menu, to change its stage.', links: [{ label: 'Open', href: '/pipeline' }] },
  { id: 'm-outbox', title: 'Outbox', body: 'Everything about messages: drafts to review, what is sending or scheduled, what was sent, replies you received and problems such as bounces.', links: [{ label: 'Open', href: '/outbox' }] },
  { id: 'm-tasks', title: 'Tasks', body: 'Your to-do list. Type something like "Call Sam tomorrow", pick a due date and link it to a lead or deal.', links: [{ label: 'Open', href: '/tasks' }] },
  { id: 'm-contacts', title: 'Contacts', body: 'People and companies built from enriched leads, with the best email, phone and social links, and every lead tied to them.', links: [{ label: 'Open', href: '/contacts' }] },
  { id: 'm-deals', title: 'Deals', body: 'Track paid work and trades from first talk to done: value, cost, profit and stage. View as a table or a board.', links: [{ label: 'Open', href: '/deals' }] },
  { id: 'm-trading', title: 'Game trading', body: 'Finds people who want to buy or sell game items and matches them to what you deal in. Buyers are people who want something you sell. Sellers are people selling something you want to buy. Market shows typical prices (with the price tracker). Stock is what you have to sell. My catalog is which games and items you deal in. If trading is switched off, use Set up trading.', links: [{ label: 'Overview', href: '/trading' }, { label: 'Buyers', href: '/trading/buyers' }, { label: 'Sellers', href: '/trading/sellers' }, { label: 'Market', href: '/trading/market' }, { label: 'Stock', href: '/trading/stock' }, { label: 'My catalog', href: '/trading/catalog' }] },
  { id: 'm-analytics', title: 'Analytics', body: 'How things are going over 7, 30 or 90 days: funnel, leads over time, where the best leads come from, and what the app has learned from your choices.', links: [{ label: 'Open', href: '/analytics' }] },
  { id: 'm-activity', title: 'Activity', body: 'One feed of everything that happened: new leads, messages sent, replies, deals and finished tasks.', links: [{ label: 'Open', href: '/activity' }] },
  { id: 'm-sources', title: 'Sources', body: 'Where leads come from. Shows whether each place is working, what it found last, and lets you run one now. Open Show details for schedules and errors.', links: [{ label: 'Open', href: '/sources' }] },
  { id: 'm-capture', title: 'Capture', body: 'Save a lead from any web page in three steps: install the button, open a post you like, click it. Other ways to add a lead lets you paste text from a chat. You review items before they are saved.', links: [{ label: 'Open', href: '/capture' }] },
  { id: 'm-settings', title: 'Settings', body: 'Your profile, targeting, email, inbox (so I can see replies), safety limits, alerts, keys, local business search, writing rules and appearance.', links: [{ label: 'Open', href: '/settings' }] },
];

export const GLOSSARY: HelpEntry[] = [
  { id: 'g-trust', title: 'Looks real, Check first, Be careful', body: 'A quick check of how likely a lead is real and safe to contact. It looks at things like scam wording, missing details and where the post came from. Looks real is a good sign, Check first means have a look yourself, Be careful means do not trust it yet. The 0 to 100 number is shown when you hover or open the lead. Leads marked Be careful ask for an extra confirmation before sending.' },
  { id: 'g-fit', title: 'Fit', body: 'How well a lead matches the work you want, based on your keywords, services and what you have won or ignored before. Strong means 70 or more, Good is 45 to 69, Weak is under 45. The exact number is in the lead detail.' },
  { id: 'g-enrich', title: 'Extra details found', body: 'The background helper visits the lead website to find the company name, owner, email addresses, phone numbers and social links so you have someone to write to.' },
  { id: 'g-suppress', title: 'Do-not-contact list', body: 'Addresses and domains you must never email again, for example people who replied "no thanks" or emails that bounced. Anything on the list is skipped automatically.' },
  { id: 'g-capture', title: 'Capture button', body: 'A bookmark button you drag to your browser bar. Click it on any page, such as a job post or marketplace listing, to send that page to Lead Radar.' },
  { id: 'g-worker', title: 'Background helper', body: 'A small program on your computer (npm run worker). It does the slow jobs: finding extra details, writing drafts, sending email, reading replies and searching for trades. If it is off, those jobs wait and nothing is lost.' },
  { id: 'g-n8n', title: 'Lead finders', body: 'The automatic searches that look for new leads on Reddit, Freelancer.com, Hacker News, We Work Remotely and your website form, plus the daily summary and reminders. They are built with a tool called n8n. They check in every 5 minutes; after 15 minutes of silence the app shows them as offline.' },
  { id: 'g-claude', title: 'AI writer', body: 'The Claude tool on your computer. The background helper uses it to write messages with your own Claude plan. Without it, simple templates are used.' },
  { id: 'g-sources', title: 'Where leads come from', body: 'The places leads are found, shown on the Sources page. Each is Working, Quiet (nothing new lately), Slow, Needs a key (a password for that service is missing) or Off.' },
  { id: 'g-key', title: 'Key', body: 'A long password that lets Lead Radar use another service, such as Google search. You paste it once in Settings under Connections.' },
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
  { id: 'f-alerts', title: 'How do I get alerts on my phone?', body: 'Alerts can go to email or WhatsApp (through CallMeBot). Turn on the ones you want under Alerts and press its test button.', links: [{ label: 'Open Alerts', href: '/settings?tab=alerts' }] },
  { id: 'f-approval', title: 'Why is nothing sent without my approval?', body: 'On purpose. The app drafts messages but only sends what you approve in the Outbox. Even auto-drafts wait for you. You can also pause all sending at any time, and a daily limit stops too much sending.', links: [{ label: 'Safety settings', href: '/settings?tab=safety' }] },
  { id: 'f-replies', title: 'How do I see replies?', body: 'Connect your inbox under Settings, Inbox. The background helper checks it for answers to messages you sent, matches each to its lead, sorts it (interested, question, not interested, out of office, bounce, other) and shows it in the Outbox. A bounce or a "no" also adds the address to the do-not-contact list.', links: [{ label: 'Inbox (replies)', href: '/settings?tab=replies' }] },
  { id: 'f-keys', title: 'How do I add a key?', body: 'Open Settings, then Connections. Paste the key for the service (Serper for Google search, Indie Hackers, LinkedIn and Google Places, X, Reddit, Resend; Product Hunt works without one) and switch it on. Use the test button to check it. Keys are stored in your own database and never shown to other people. Sources shows which ones still need a key.', links: [{ label: 'Open Connections', href: '/settings?tab=connections' }, { label: 'Missing keys', href: '/sources?status=needs_key' }] },
  { id: 'f-nothing', title: 'No new leads are coming in. What do I check?', body: 'Open Sources. If the lead finders (n8n) or the background helper are offline, start them. A source marked Not working shows the reason when you hover its status. Quiet usually just means nothing new was posted yet.', links: [{ label: 'Open Sources', href: '/sources' }] },
  { id: 'f-risk', title: 'Is trading game items risky for my game accounts?', body: 'Yes, it can be. Many games ban accounts that trade items or accounts for real money, and sellers on public boards are a common scam target. Check each game rules first, use a method the platform protects, and never share passwords. Lead Radar only finds and tracks posts. It never trades for you.' },
  { id: 'f-offline', title: 'The page says the background helper is off.', body: 'Open a terminal in the project folder and run npm run worker. Leave the window open. Writing, extra details, sending and searches wait until it is back, and nothing is lost.' },
];

export const SAFETY: HelpEntry[] = [
  { id: 's-approve', title: 'You approve every message', body: 'Nothing leaves your outbox until you approve it. Scheduled follow-ups can be cancelled until they send.' },
  { id: 's-limit', title: 'Daily sending limit', body: 'Only as many emails go out per day as you allow. The Outbox shows how much of today limit is used.' },
  { id: 's-pause', title: 'Pause sending', body: 'One switch holds all outgoing email. A banner shows while it is on. Use it if something looks wrong.' },
  { id: 's-suspicious', title: 'Risky leads need confirmation', body: 'Leads marked Be careful ask you to confirm before you send, and are never auto-drafted.' },
  { id: 's-suppress', title: 'No second chances after a no', body: 'Anyone who says no, unsubscribes or bounces is added to the do-not-contact list and skipped from then on.' },
  { id: 's-footer', title: 'Opt-out line', body: 'Every email ends with a line that lets the person say no thanks. Keep it on.' },
  { id: 's-privacy', title: 'Plain text only', body: 'Posts and replies are shown as plain text, so a lead can never run code in your dashboard. Open unknown links with care.' },
];

export const SECTION_ORDER: { id: string; title: string; blurb?: string; entries: HelpEntry[] }[] = [
  { id: 'faq', title: 'Common questions', entries: FAQ },
  { id: 'modules', title: 'What each page does', entries: MODULES },
  { id: 'glossary', title: 'What the words mean', blurb: 'The plain meaning of words you will see around the app.', entries: GLOSSARY },
  { id: 'safety', title: 'Safety rules', blurb: 'What protects you and the people you contact.', entries: SAFETY },
];

export function matches(text: string, q: string): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = text.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export const entryText = (e: HelpEntry) => `${e.title} ${e.body} ${(e.links ?? []).map((l) => l.label).join(' ')}`;
