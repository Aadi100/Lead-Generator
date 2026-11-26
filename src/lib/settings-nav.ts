// Settings navigation: groups and tab ids. Other modules link to /settings?tab=<id>.

export type SettingsTabId =
  | 'profile'
  | 'targeting'
  | 'writing'
  | 'ai'
  | 'email'
  | 'imap'
  | 'safety'
  | 'connections'
  | 'alerts'
  | 'prospecting'
  | 'trading'
  | 'proposals'
  | 'appearance'
  | 'data';

export type SettingsTab = { id: SettingsTabId; label: string; blurb: string };
export type SettingsGroup = { label: string; tabs: SettingsTab[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: 'About you',
    tabs: [
      { id: 'profile', label: 'Profile & links', blurb: 'Tell me what you sell and where to find your work, so every message sounds like you.' },
      { id: 'writing', label: 'Writing rules', blurb: 'Set the tone and rules the AI writer follows when it drafts messages for you.' },
      { id: 'ai', label: 'AI writer', blurb: 'Choose which AI writes your messages (Gemini, DeepSeek or Claude) and paste its key. You can switch any time.' },
      { id: 'proposals', label: 'Proposals & quotes', blurb: 'Choose how your proposals and quotes look and what they say by default.' },
    ],
  },
  {
    label: 'Finding leads',
    tabs: [
      { id: 'targeting', label: 'Targeting', blurb: 'Choose the words and topics that decide which leads are worth your time.' },
      { id: 'connections', label: 'Connections & keys', blurb: 'Connect the services that find leads for you. Each one shows if it is working.' },
      { id: 'prospecting', label: 'Local business search', blurb: 'Find local businesses that may need a website, app or design, city by city.' },
      { id: 'trading', label: 'Game trading', blurb: 'Where to set up game trading: what to watch, prices and stock.' },
    ],
  },
  {
    label: 'Sending & replies',
    tabs: [
      { id: 'email', label: 'Email account', blurb: 'Choose the email account your messages go out from. Nothing sends until you press Send.' },
      { id: 'imap', label: 'Inbox for replies', blurb: 'Let me look at your inbox so I can see when someone replies. I only read.' },
      { id: 'safety', label: 'Safety', blurb: 'Rules that protect your name and your email, and the list of people never to contact.' },
      { id: 'alerts', label: 'Alerts', blurb: 'Get a message the moment a strong lead arrives, so you can reply first.' },
    ],
  },
  {
    label: 'App & data',
    tabs: [
      { id: 'appearance', label: 'Appearance & app', blurb: 'Pick light or dark, and install Lead Radar like an app on your phone or computer.' },
      { id: 'data', label: 'Data', blurb: 'Download a copy of your leads and messages as a spreadsheet.' },
    ],
  },
];

export const SETTINGS_TABS: SettingsTab[] = SETTINGS_GROUPS.flatMap((g) => g.tabs);

// Older names that still resolve (the page used to use #replies).
const ALIASES: Record<string, SettingsTabId> = { replies: 'imap' };

export function parseSettingsTab(raw: string | null | undefined): SettingsTabId {
  if (!raw) return 'profile';
  const id = ALIASES[raw] ?? raw;
  return SETTINGS_TABS.some((t) => t.id === id) ? (id as SettingsTabId) : 'profile';
}

export function settingsHref(id: SettingsTabId): string {
  return `/settings?tab=${id}`;
}
