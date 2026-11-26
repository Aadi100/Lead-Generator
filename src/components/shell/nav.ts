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
  /** Shorter wording for the tab bar inside an area (defaults to label). */
  tabLabel?: string;
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
  /** Start closed until the person opens it (or visits a page inside it). */
  defaultCollapsed?: boolean;
  /** Rendered small and quiet at the bottom of the sidebar. */
  quiet?: boolean;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    label: 'Main',
    collapsible: false,
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/', icon: DashboardIcon, description: 'Today: what needs you', keywords: 'home overview today', exact: true },
      { id: 'leads', label: 'Leads', tabLabel: 'All leads', href: '/leads', icon: LeadsIcon, description: 'People asking for work, prospects and trade leads', keywords: 'people asking prospects inbox' },
      { id: 'outbox', label: 'Outbox', href: '/outbox', icon: SendIcon, description: 'Drafts to review, sent mail and replies', keywords: 'email drafts replies send pitch', badge: 'outbox' },
      { id: 'pipeline', label: 'Pipeline', href: '/pipeline', icon: PipelineIcon, description: 'Leads and deals by stage', keywords: 'kanban board stages funnel' },
      { id: 'tasks', label: 'Tasks', href: '/tasks', icon: TasksIcon, description: 'Follow-ups and to-dos', keywords: 'todo reminders due', badge: 'tasks' },
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    collapsible: true,
    items: [
      { id: 'contacts', label: 'Contacts', href: '/contacts', icon: ContactsIcon, description: 'People and companies you deal with', keywords: 'people companies address book' },
      { id: 'deals', label: 'Deals', href: '/deals', icon: DealsIcon, description: 'Open and closed deals', keywords: 'orders sales revenue won' },
      { id: 'proposals', label: 'Proposals', href: '/proposals', icon: ProposalsIcon, description: 'Quotes and one page PDF proposals', keywords: 'quote estimate pdf pricing packages bid' },
    ],
  },
  {
    id: 'trading',
    label: 'Game trading',
    icon: TradingIcon,
    accent: true,
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { id: 'trading', label: 'Overview', href: '/trading', icon: TradingIcon, description: 'Game trading at a glance', keywords: 'game accounts boosting top-up', exact: true },
      { id: 'buyers', label: 'Buyers', href: '/trading/buyers', icon: BuyersIcon, description: 'People who want to buy what you sell', keywords: 'trade buyers customers wtb' },
      { id: 'sellers', label: 'Sellers', href: '/trading/sellers', icon: SellersIcon, description: 'People selling what you want', keywords: 'trade sellers suppliers wts' },
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
      { id: 'analytics', label: 'Analytics', tabLabel: 'What is working', href: '/analytics', icon: AnalyticsIcon, description: 'Funnel, sources and what is working', keywords: 'insights stats charts conversion' },
      { id: 'activity', label: 'Activity', tabLabel: 'What happened', href: '/activity', icon: ActivityIcon, description: 'Everything that happened, newest first', keywords: 'log history feed timeline' },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    collapsible: false,
    quiet: true,
    items: [
      { id: 'sources', label: 'Sources', tabLabel: 'Where leads come from', href: '/sources', icon: SourcesIcon, description: 'Where leads come from and whether each finder works', keywords: 'lead finders scrapers reddit freelancer keys connections' },
      { id: 'capture', label: 'Capture', tabLabel: 'Add from a page', href: '/capture', icon: CaptureIcon, description: 'Save leads from any page you are viewing', keywords: 'bookmarklet paste add lead' },
      { id: 'help', label: 'Help', href: '/help', icon: HelpIcon, description: 'How things work and what to do first', keywords: 'docs guide support shortcuts' },
      { id: 'settings', label: 'Settings', href: '/settings', icon: SettingsIcon, description: 'Profile, email, alerts, safety and more', keywords: 'preferences account smtp' },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * What the person sees in the menu: a few clear areas. Each area holds one or more pages (shown as tabs inside the area).
 * Nothing is hidden, the 17 pages are just grouped so the menu stays small.
 */
export type NavArea = {
  id: string;
  label: string;
  /** One short line, used on phone and in tooltips. */
  hint: string;
  href: string;
  icon: IconComp;
  accent?: boolean;
  /** Item ids (from NAV_GROUPS) that live in this area, in tab order. */
  itemIds: string[];
  /** Counters added together for the badge. */
  badges?: BadgeKey[];
  /** Pinned to the bottom of the sidebar. */
  bottom?: boolean;
};

export const NAV_AREAS: NavArea[] = [
  { id: 'home', label: 'Home', hint: 'What needs you today', href: '/', icon: DashboardIcon, itemIds: ['dashboard'] },
  { id: 'leads', label: 'Leads', hint: 'People who may want your work', href: '/leads', icon: LeadsIcon, itemIds: ['leads', 'capture', 'sources'] },
  { id: 'messages', label: 'Messages', hint: 'Drafts, sent mail and replies', href: '/outbox', icon: SendIcon, itemIds: ['outbox'], badges: ['outbox'] },
  { id: 'work', label: 'My work', hint: 'Deals, tasks, clients and quotes', href: '/pipeline', icon: PipelineIcon, itemIds: ['pipeline', 'deals', 'tasks', 'contacts', 'proposals'], badges: ['tasks'] },
  { id: 'trading', label: 'Game trading', hint: 'Buyers, sellers, prices and stock', href: '/trading', icon: TradingIcon, accent: true, itemIds: ['trading', 'buyers', 'sellers', 'market', 'stock', 'catalog'], badges: ['buyers', 'sellers'] },
  { id: 'reports', label: 'Reports', hint: 'What is working, and what happened', href: '/analytics', icon: AnalyticsIcon, itemIds: ['analytics', 'activity'] },
  { id: 'help', label: 'Help', hint: 'How things work', href: '/help', icon: HelpIcon, itemIds: ['help'], bottom: true },
  { id: 'settings', label: 'Settings', hint: 'Profile, email, alerts and safety', href: '/settings', icon: SettingsIcon, itemIds: ['settings'], bottom: true },
];

/** The four areas on the phone tab bar. A fifth "More" tab opens a sheet with the rest. */
export const MOBILE_PRIMARY_IDS = ['home', 'leads', 'messages', 'work'] as const;

export function areaOfItem(itemId: string): NavArea | undefined {
  return NAV_AREAS.find((a) => a.itemIds.includes(itemId));
}

export function areaFor(pathname: string): NavArea | undefined {
  const item = activeItemFor(pathname);
  return item ? areaOfItem(item.id) : undefined;
}

/** Pages shown as tabs for the area of this path (empty when the area has only one page). */
export function tabsFor(pathname: string): NavItem[] {
  const area = areaFor(pathname);
  if (!area || area.itemIds.length < 2) return [];
  return area.itemIds.map((id) => ALL_ITEMS.find((i) => i.id === id)).filter((i): i is NavItem => !!i);
}

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
  { id: 'replies', label: 'Inbox (replies)' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'prospecting', label: 'Local business search' },
  { id: 'writing', label: 'Writing rules' },
  { id: 'safety', label: 'Safety' },
];
