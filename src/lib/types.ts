import type { AssistStatus, LearnedReason, ReplyAssist } from './types-intel';
export const CATEGORIES = ['Website', 'App', 'Design', 'Automation', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ['New', 'Pitched', 'Replied', 'Won', 'Lost', 'Ignored'] as const;
export type Status = (typeof STATUSES)[number];

export type TrustLevel = 'High' | 'Medium' | 'Low';
export type LeadKind = 'request' | 'prospect' | 'trade';
export const LEAD_KINDS: readonly LeadKind[] = ['request', 'prospect', 'trade'];
export type TradeSide = 'buyer' | 'seller';
export type SideFilter = 'All' | TradeSide;
export type EnrichStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type EmailStatus = 'valid' | 'role' | 'guessed' | 'no_mx' | 'disposable' | 'invalid_syntax' | 'unknown';
export type EmailKind = 'provided' | 'personal' | 'role' | 'guessed';
export type EmailEntry = { email: string; status: EmailStatus; kind: EmailKind | null; source: string | null };

export type SiteSignals = {
  reachable?: boolean;
  status_code?: number;
  final_url?: string;
  platform?: string;
  https?: boolean;
  mobile_viewport?: boolean;
  copyright_year?: number;
  has_contact_form?: boolean;
  has_blog?: boolean;
  title?: string;
  description?: string;
  load_ms?: number;
  issues?: string[];
};

export type Lead = {
  id: string;
  title: string;
  description: string | null;
  budget: string | null;
  url: string;
  source: string;
  source_detail: string | null;
  type: string;
  status: Status;
  created_at: string;
  category: string | null;
  categories: string[];
  tags: string[];
  author: string | null;
  author_info: string | null;
  contact: string | null;
  budget_amount: number | null;
  posted_at: string | null;
  trust_score: number | null;
  trust_level: TrustLevel | null;
  is_suspicious: boolean;
  flags: string[];
  notes: string | null;
  lead_kind: LeadKind;
  enrich_status: EnrichStatus | null;
  enriched_at: string | null;
  enrich_error: string | null;
  website: string | null;
  company_name: string | null;
  owner_name: string | null;
  owner_title: string | null;
  emails: EmailEntry[];
  phones: string[];
  socials: Record<string, string>;
  site_signals: SiteSignals;
  opportunity: string | null;
  best_email: string | null;
  best_email_status: EmailStatus | null;
  fit_score: number | null;
  fit_reasons: string[];
  pitched_at: string | null;
  replied_at: string | null;
  outcome_note: string | null;
  trade_side: TradeSide | null;
  game: string | null;
  item_type: string | null;
  trade_match: string | null;
  price_verdict: 'below' | 'fair' | 'above' | null;
  price_pct: number | null;
  market_median: number | null;
  market_samples: number | null;
  market_basis: 'sold' | 'asking' | null;
  stock_item_id: string | null;
  learned_score: number | null;
  learned_reasons: LearnedReason[];
  learned_weight: number | null;
};

export type StatusTab = 'All' | Status;
export type TrustFilter = 'All' | TrustLevel | 'Suspicious';
export type SortKey = 'newest' | 'fit' | 'trust' | 'budget';

export type Filters = {
  search: string;
  category: 'All' | Category;
  source: string;
  status: StatusTab;
  trust: TrustFilter;
  sort: SortKey;
  kind: LeadKind;
  side: SideFilter;
  game: string;
  item: string;
};

export const DEFAULT_FILTERS: Filters = {
  search: '',
  category: 'All',
  source: 'All',
  status: 'All',
  trust: 'All',
  sort: 'newest',
  kind: 'request',
  side: 'All',
  game: 'All',
  item: 'All',
};

export type OutreachStatus = 'draft' | 'queued' | 'sending' | 'scheduled' | 'sent' | 'failed' | 'cancelled' | 'replied';
export type OutreachChannel = 'email' | 'manual';
export type Warning = { level: 'hard' | 'hold' | 'warn'; code: string; message: string };

export type OutreachRow = {
  id: string;
  lead_id: string;
  step: number;
  channel: OutreachChannel;
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  body: string | null;
  original_subject: string | null;
  original_body: string | null;
  status: OutreachStatus;
  due_at: string | null;
  sent_at: string | null;
  message_id: string | null;
  provider: string | null;
  error: string | null;
  warnings: Warning[];
  confirmed_suspicious: boolean;
  override_warnings: boolean;
  rating: 'good' | 'bad' | null;
  feedback_note: string | null;
  /** Set when this row answers a reply (step 10 and up). It is not part of the cold sequence. */
  reply_to_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ReplyCategory = 'interested' | 'question' | 'not_interested' | 'out_of_office' | 'bounce' | 'other';

export type ReplyRow = {
  id: string;
  outreach_id: string | null;
  lead_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body: string | null;
  message_id: string | null;
  received_at: string | null;
  category: ReplyCategory;
  summary: string | null;
  handled: boolean;
  assist_status: AssistStatus | null;
  assist: ReplyAssist | null;
  created_at: string;
};

export type JobType =
  | 'learn_profile'
  | 'enrich_lead'
  | 'draft_lead'
  | 'rewrite_draft'
  | 'check_outreach'
  | 'test_email'
  | 'test_imap'
  | 'test_alert'
  | 'ai_test'
  | 'push_test'
  | 'check_replies'
  | 'prospect_local'
  | 'learn_writing'
  | 'learn_filters'
  | 'reply_assist'
  | 'recompute_learned'
  | 'dedupe_lead'
  | 'dedupe_backfill'
  | 'draft_proposal_summary'
  | 'suggest_keywords'
  | 'test_integration'
  | 'trade_scan'
  | 'suggest_trading'
  | 'quick_add'
  | 'source_indiehackers'
  | 'source_producthunt'
  | 'source_linkedin'
  | 'source_fiverr'
  | 'source_upwork'
  | 'prospect_places'
  | 'recompute_price_market';

export type Job = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'done' | 'failed';
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
};

export type ProfileSettings = {
  your_name: string;
  business_name: string;
  headline: string;
  email: string;
  websites: string[];
  links: string[];
  services: string[];
  location: string;
  notes: string;
  signature: string;
};

export type ProfileSource = { url: string; status: 'ok' | 'blocked' | 'failed'; chars: number | null };

export type ProfileSummary = {
  generated_at: string | null;
  mode: 'claude' | 'heuristic' | null;
  sources: ProfileSource[];
  business_name: string;
  summary: string;
  what_you_sell: string[];
  services: string[];
  ideal_customers: string[];
  strengths: string[];
  voice: string;
  sample_phrases: string[];
  keywords_target: string[];
  keywords_avoid: string[];
  portfolio_highlights: string[];
};

export type SendingSettings = {
  provider: 'none' | 'smtp' | 'resend';
  paused: boolean;
  daily_limit: number;
  auto_followups: boolean;
  followup_days: number[];
  from_name: string;
  from_email: string;
  reply_to: string;
  footer: string;
  require_confirm_suspicious: boolean;
  auto_draft: boolean;
  auto_draft_per_hour: number;
  min_trust_for_auto_draft: number;
  owned_domains: string[];
};

export type SmtpSettings = { host: string; port: number; secure: boolean; user: string; pass: string };
export type ResendSettings = { api_key: string };
export type ImapSettings = { enabled: boolean; host: string; port: number; secure: boolean; user: string; pass: string; folder: string };
export type ImapState = { last_checked: string | null; last_error: string | null };

export type AlertSettings = {
  enabled: boolean;
  min_trust: number;
  only_non_suspicious: boolean;
  on_reply: boolean;
  email: { to: string };
  whatsapp: { phone: string; apikey: string };
};

export type ProspectingSettings = {
  enabled: boolean;
  cities: string[];
  business_types: string[];
  per_run_limit: number;
  interval_hours: number;
  places_enabled: boolean;
  places_niches: string[];
  last_run: string | null;
  last_result: Record<string, unknown> | string | null;
};

export type WritingRules = {
  source: 'default' | 'learned' | 'manual';
  updated_at: string | null;
  last_learned_at: string | null;
  markdown: string;
  history: { at: string; source: string; markdown: string }[];
};

export type FilterBucket = {
  total: number;
  pitched: number;
  replied: number;
  won: number;
  lost: number;
  ignored: number;
  win_rate: number;
  ignore_rate: number;
  weight: number;
};

export type FilterLearning = {
  generated_at: string | null;
  total: number;
  by_source: Record<string, FilterBucket>;
  by_category: Record<string, FilterBucket>;
  by_detail: Record<string, FilterBucket>;
  by_tag: Record<string, FilterBucket>;
  insights: string[];
  suggested_hide: { kind: string; value: string; reason: string }[];
};

export type TargetingSuggestions = {
  generated_at: string;
  keywords: string[];
  topics: string[];
  exclude: string[];
  mode: 'claude' | 'heuristic';
};

export type TargetingSettings = {
  keywords: string[];
  topics: string[];
  exclude: string[];
  min_budget: number | null;
  work_description: string;
  job_description: string;
  suggested: TargetingSuggestions | null;
  updated_at: string | null;
};

export type FitState = { profile_at: string | null; filters_at: string | null };

export const ITEM_TYPES = ['account', 'boosting', 'top-up', 'currency', 'items', 'keys', 'other'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type TradeEntry = {
  id: string;
  label: string;
  game: string;
  item_type: string;
  keywords: string[];
  price: number | null;
};

export type TradingSuggestion = {
  title: string;
  why: string;
  game: string;
  item_type: string;
  basis: 'observed' | 'general knowledge';
  confidence: 'high' | 'medium' | 'low';
};

export type TradingSuggestions = {
  generated_at: string | null;
  mode: 'claude' | 'heuristic';
  notes: string;
  items: TradingSuggestion[];
};

export type TradingSettings = {
  enabled: boolean;
  i_sell: TradeEntry[];
  i_want: TradeEntry[];
  games: string[];
  extra_subreddits: string[];
  suggestions: TradingSuggestions | null;
  last_run: string | null;
  last_result: Record<string, unknown> | string | null;
  updated_at: string | null;
};

export type TradeMarketRow = {
  game: string;
  item_type: string;
  wanted: number;
  offered: number;
  median_price: number | null;
  ratio: number | null;
};

export type TradeMarket = {
  generated_at: string | null;
  days: number;
  rows: TradeMarketRow[];
  totals: { trade_leads: number };
};

export type TradeState = {
  reddit_last_run: string | null;
  subs_ok: string[];
};

export type IntegrationName = 'serper' | 'x' | 'reddit_api' | 'upwork_inbox' | 'producthunt' | 'indiehackers' | 'linkedin' | 'fiverr' | 'places';
export type IntegrationStatus = { ok: boolean; checked_at: string | null; message: string };

export type IntegrationsSettings = {
  serper: { enabled: boolean; api_key: string; services: boolean; trading: boolean; indiehackers: boolean; linkedin: boolean; fiverr: boolean };
  producthunt: { enabled: boolean; token: string };
  x: { enabled: boolean; bearer_token: string };
  reddit_api: { enabled: boolean; client_id: string; client_secret: string; username: string };
  upwork_inbox: { enabled: boolean };
  status: Partial<Record<IntegrationName, IntegrationStatus>>;
};

export type AiProvider = 'anthropic' | 'gemini' | 'deepseek';
export type AiKeyProvider = AiProvider;
export type AiSettings = {
  provider: AiProvider;
  anthropic: { api_key: string; model: string };
  gemini: { api_key: string; model: string };
  deepseek: { api_key: string; model: string };
};

export type WorkerStatus = {
  last_seen: string | null;
  started_at: string | null;
  pid: number | null;
  claude: { available: boolean; version: string | null; bin: string | null; provider?: string | null };
  handlers: string[];
  jobs: string[];
};

export type SettingsMap = {
  profile: ProfileSettings;
  profile_summary: ProfileSummary;
  sending: SendingSettings;
  smtp: SmtpSettings;
  resend: ResendSettings;
  imap: ImapSettings;
  imap_state: ImapState;
  alerts: AlertSettings;
  ai: AiSettings;
  prospecting: ProspectingSettings;
  targeting: TargetingSettings;
  trading: TradingSettings;
  trade_market: TradeMarket;
  trade_state: TradeState;
  integrations: IntegrationsSettings;
  writing_rules: WritingRules;
  filter_learning: FilterLearning;
  fit_state: FitState;
  worker_status: WorkerStatus;
};
