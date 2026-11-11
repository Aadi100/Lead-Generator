// Types for the platform tables created after v3: deals and tasks. Normalisers coerce raw rows safely.

export type DealKind = 'service' | 'trade';
export type DealDirection = 'sell' | 'buy';
export type DealStage = 'talking' | 'negotiating' | 'agreed' | 'paid' | 'delivered' | 'done' | 'cancelled' | 'disputed';
export type TaskPriority = 'low' | 'normal' | 'high';

export const DEAL_STAGES: DealStage[] = ['talking', 'negotiating', 'agreed', 'paid', 'delivered', 'done', 'cancelled', 'disputed'];
/** Stages that count as an open deal (badge counts, pipeline columns). */
export const OPEN_DEAL_STAGES: DealStage[] = ['talking', 'negotiating', 'agreed', 'paid', 'delivered', 'disputed'];
export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  talking: 'Talking',
  negotiating: 'Negotiating',
  agreed: 'Agreed',
  paid: 'Paid',
  delivered: 'Delivered',
  done: 'Done',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high'];

export type Deal = {
  id: string;
  lead_id: string | null;
  kind: DealKind;
  direction: DealDirection;
  stage: DealStage;
  title: string;
  company: string | null;
  contact: string | null;
  game: string | null;
  item_type: string | null;
  platform: string | null;
  value: number | null;
  cost: number | null;
  currency: string;
  notes: string | null;
  expected_close: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  title: string;
  notes: string | null;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  priority: TaskPriority;
  created_at: string;
};

const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const n = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback);

export function normalizeDeal(raw: Record<string, unknown>): Deal {
  const now = new Date().toISOString();
  return {
    id: String(raw.id ?? ''),
    lead_id: s(raw.lead_id),
    kind: oneOf(raw.kind, ['service', 'trade'] as const, 'service'),
    direction: oneOf(raw.direction, ['sell', 'buy'] as const, 'sell'),
    stage: oneOf(raw.stage, DEAL_STAGES, 'talking'),
    title: s(raw.title) ?? 'Untitled deal',
    company: s(raw.company),
    contact: s(raw.contact),
    game: s(raw.game),
    item_type: s(raw.item_type),
    platform: s(raw.platform),
    value: n(raw.value),
    cost: n(raw.cost),
    currency: s(raw.currency) ?? 'USD',
    notes: s(raw.notes),
    expected_close: s(raw.expected_close),
    opened_at: s(raw.opened_at),
    closed_at: s(raw.closed_at),
    created_at: s(raw.created_at) ?? now,
    updated_at: s(raw.updated_at) ?? now,
  };
}

export function normalizeTask(raw: Record<string, unknown>): Task {
  return {
    id: String(raw.id ?? ''),
    lead_id: s(raw.lead_id),
    deal_id: s(raw.deal_id),
    title: s(raw.title) ?? 'Untitled task',
    notes: s(raw.notes),
    due_at: s(raw.due_at),
    done: raw.done === true,
    done_at: s(raw.done_at),
    priority: oneOf(raw.priority, TASK_PRIORITIES, 'normal'),
    created_at: s(raw.created_at) ?? new Date().toISOString(),
  };
}
