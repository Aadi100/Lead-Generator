// Settings navigation: groups and tab ids. Other modules link to /settings?tab=<id>.

export type SettingsTabId =
  | 'profile'
  | 'targeting'
  | 'writing'
  | 'email'
  | 'imap'
  | 'safety'
  | 'connections'
  | 'alerts'
  | 'prospecting'
  | 'trading'
  | 'appearance'
  | 'data';

export type SettingsGroup = { label: string; tabs: { id: SettingsTabId; label: string }[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: 'Profile & targeting',
    tabs: [
      { id: 'profile', label: 'Profile & links' },
      { id: 'targeting', label: 'Targeting' },
      { id: 'writing', label: 'Writing rules' },
    ],
  },
  {
    label: 'Outreach',
    tabs: [
      { id: 'email', label: 'Email sending' },
      { id: 'imap', label: 'Reply tracking' },
      { id: 'safety', label: 'Safety' },
    ],
  },
  {
    label: 'Sources',
    tabs: [
      { id: 'connections', label: 'Connections' },
      { id: 'alerts', label: 'Alerts' },
      { id: 'prospecting', label: 'Local prospecting' },
      { id: 'trading', label: 'Trading' },
    ],
  },
  {
    label: 'Appearance & data',
    tabs: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'data', label: 'Data' },
    ],
  },
];

export const SETTINGS_TABS = SETTINGS_GROUPS.flatMap((g) => g.tabs);

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
