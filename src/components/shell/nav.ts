// The single source of truth for the app's modules. Add a page by adding an item here (see design-system/lead-radar/UI-KIT.md).
import {
  ActivityIcon,
  AnalyticsIcon,
  BuyersIcon,
  CaptureIcon,
  CatalogIcon,
  StockIcon,
  ContactsIcon,
  DashboardIcon,
  DealsIcon,
  HelpIcon,
  LeadsIcon,
  MarketIcon,
  PipelineIcon,
  SellersIcon,
  SendIcon,
  SettingsIcon,
  SourcesIcon,
  TasksIcon,
  TradingIcon,
} from '@/components/Icons';
import { ProposalsIcon } from '@/components/proposals/ProposalIcon';

export type IconComp = (props: { className?: string }) => JSX.Element;

/** Keys of the live counters the shell fetches (see counts.ts). Items reference one to show a badge. */
export type BadgeKey = 'leads' | 'outbox' | 'tasks' | 'deals' | 'buyers' | 'sellers';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: IconComp;
  /** One line shown in the command palette. */
  description: string;
  /** Extra words the palette matches on. */
  keywords?: string;
  badge?: BadgeKey;
  /** Match only this exact path (use for '/' and '/trading'). */
  exact?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  /** Group heading icon (shown in the collapsed rail and on the group header). */
  icon?: IconComp;
  /** Groups with an accent use the emerald accent for their active item instead of blue. */
  accent?: boolean;
  /** false = no heading, always open (single-item groups). */
  collapsible: boolean;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    collapsible: false,
    items: [{ id: 'dashboard', label: 'Dashboard', href: '/', icon: DashboardIcon, description: 'Your day at a glance', keywords: 'home overview today', exact: true }],
  },
  {
    id: 'work',
    label: 'Work',
    collapsible: true,
    items: [
      { id: 'leads', label: 'Leads', href: '/leads', icon: LeadsIcon, description: 'People asking for work, prospects and trade leads', keywords: 'people asking prospects inbox', badge: 'leads' },
      { id: 'pipeline', label: 'Pipeline', href: '/pipeline', icon: PipelineIcon, description: 'Leads and deals by stage', keywords: 'kanban board stages funnel' },
      { id: 'outbox', label: 'Outbox', href: '/outbox', icon: SendIcon, description: 'Drafts to review, sent mail and replies', keywords: 'email drafts replies send pitch', badge: 'outbox' },
      { id: 'tasks', label: 'Tasks', href: '/tasks', icon: TasksIcon, description: 'Follow-ups and to-dos', keywords: 'todo reminders due', badge: 'tasks' },
      { id: 'contacts', label: 'Contacts', href: '/contacts', icon: ContactsIcon, description: 'People and companies you deal with', keywords: 'people companies address book' },
      { id: 'deals', label: 'Deals', href: '/deals', icon: DealsIcon, description: 'Open and closed deals', keywords: 'orders sales revenue won', badge: 'deals' },
      { id: 'proposals', label: 'Proposals', href: '/proposals', icon: ProposalsIcon, description: 'Quotes and one page PDF proposals', keywords: 'quote estimate pdf pricing packages bid' },
    ],
  },
  {
    id: 'trading',
    label: 'Game Trading',
    icon: TradingIcon,
    accent: true,
    collapsible: true,
    items: [
      { id: 'trading', label: 'Overview', href: '/trading', icon: TradingIcon, description: 'Game trading at a glance', keywords: 'game accounts boosting top-up', exact: true },
      { id: 'buyers', label: 'Buyers', href: '/trading/buyers', icon: BuyersIcon, description: 'People who want to buy what you sell', keywords: 'trade buyers customers wtb', badge: 'buyers' },
      { id: 'sellers', label: 'Sellers', href: '/trading/sellers', icon: SellersIcon, description: 'People selling what you want', keywords: 'trade sellers suppliers wts', badge: 'sellers' },
      { id: 'market', label: 'Market', href: '/trading/market', icon: MarketIcon, description: 'Demand, supply and prices by game', keywords: 'prices demand supply what to sell' },
      { id: 'stock', label: 'Stock', href: '/trading/stock', icon: StockIcon, description: 'What you hold to sell, with prices and profit', keywords: 'inventory stock items quantity sold profit listings' },
      { id: 'catalog', label: 'My catalog', href: '/trading/catalog', icon: CatalogIcon, description: 'What you sell and what you want to buy', keywords: 'inventory stock items accounts' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    collapsible: true,
    items: [
      { id: 'analytics', label: 'Analytics', href: '/analytics', icon: AnalyticsIcon, description: 'Funnel, sources and what is working', keywords: 'insights stats charts conversion' },
      { id: 'activity', label: 'Activity', href: '/activity', icon: ActivityIcon, description: 'Everything that happened, newest first', keywords: 'log history feed timeline' },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    collapsible: true,
    items: [
      { id: 'sources', label: 'Sources', href: '/sources', icon: SourcesIcon, description: 'Where leads come from and whether each source works', keywords: 'scrapers reddit freelancer discord keys connections' },
      { id: 'capture', label: 'Capture', href: '/capture', icon: CaptureIcon, description: 'Save leads from any page you are viewing', keywords: 'bookmarklet paste add lead' },
      { id: 'settings', label: 'Settings', href: '/settings', icon: SettingsIcon, description: 'Profile, email, alerts, safety and more', keywords: 'preferences account smtp' },
      { id: 'help', label: 'Help', href: '/help', icon: HelpIcon, description: 'How things work and what to do first', keywords: 'docs guide support shortcuts' },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The four modules on the phone tab bar. A fifth "More" tab opens a sheet with everything else. */
export const MOBILE_PRIMARY_IDS = ['dashboard', 'leads', 'pipeline', 'outbox'] as const;

export function groupOf(itemId: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.id === itemId));
}

function matches(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/** The nav item for a path (longest matching href wins). */
export function activeItemFor(pathname: string): NavItem | undefined {
  const hits = ALL_ITEMS.filter((i) => matches(i, pathname));
  return hits.sort((a, b) => b.href.length - a.href.length)[0];
}

export const SETTINGS_TABS: { id: string; label: string }[] = [
  { id: 'profile', label: 'Profile & links' },
  { id: 'targeting', label: 'Targeting' },
  { id: 'trading', label: 'Trading' },
  { id: 'email', label: 'Email sending' },
  { id: 'connections', label: 'Connections' },
  { id: 'replies', label: 'Reply tracking' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'prospecting', label: 'Local prospecting' },
  { id: 'writing', label: 'Writing rules' },
  { id: 'safety', label: 'Safety' },
];
