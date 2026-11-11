// Types for duplicate detection, learned scoring and the reply assistant (schema-v6.sql).

export type LeadLinkRelation = 'same_contact' | 'cross_post' | 'text_blast';
export type LeadLinkState = 'auto' | 'suspected' | 'confirmed' | 'split';

export type LeadLink = {
  id: string;
  lead_a: string;
  lead_b: string;
  relation: LeadLinkRelation;
  state: LeadLinkState;
  strength: number;
  reasons: string[];
  created_at: string;
};

export type LearnedReason = { text: string; effect: 'up' | 'down'; n: number; label: string };

export type OutcomeFeature = { key: string; group: string; label: string; n: number; pos: number; neg: number; share: number; contrib: number };

export type OutcomeModelInfo = {
  status: 'ready' | 'insufficient';
  generated_at: string | null;
  note: string | null;
  examples: number;
  positives: number;
  negatives: number;
  base_rate: number | null;
  weight: number;
  min_examples: number;
  top_positive: OutcomeFeature[];
  top_negative: OutcomeFeature[];
};

export type AssistCategory = 'interested' | 'asks_price' | 'asks_portfolio' | 'objection' | 'not_now' | 'unsubscribe' | 'out_of_office' | 'other';
export type AssistActionId = 'book_call' | 'send_price' | 'send_portfolio' | 'answer' | 'create_task' | 'mark_won' | 'mark_lost' | 'add_suppression' | 'mark_handled';

export type ReplyAssist = {
  classification: AssistCategory;
  summary: string;
  next_step: { id: AssistActionId; label: string; reason: string } | null;
  actions: { id: AssistActionId; label: string; primary?: boolean }[];
  task: { title: string; due_in_days: number } | null;
  draft_outreach_id: string | null;
  mode: 'claude' | 'rules' | 'template' | null;
  generated_at: string | null;
  suppress_email: string | null;
  already_suppressed: boolean;
};

export type AssistStatus = 'pending' | 'done' | 'failed' | 'skipped';
