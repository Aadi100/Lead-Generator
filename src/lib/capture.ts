// Pure helpers for the Capture page: payload decoding, validation and splitting pasted text.

export const MAX_ITEMS = 80;
export const MAX_TEXT = 1500;
const MAX_HASH_CHARS = 400_000;

export type CaptureItem = {
  text: string;
  url?: string;
  title?: string;
  author?: string;
  price_text?: string;
  channel_label?: string;
};

export type CapturePayload = {
  v: 1;
  site: string;
  page_title: string;
  page_url: string;
  items: CaptureItem[];
};

export type QuickAddItem = CaptureItem & { site?: string; page_title?: string };

export type ForceKind = 'trade' | 'service';

export type QuickAddOutcome = {
  index: number;
  outcome: 'inserted' | 'duplicate' | 'skipped';
  reason?: string;
  title?: string;
  kind?: string;
  game?: string;
  item_type?: string;
  side?: string;
  trade_match?: string;
  trust?: number | string;
};

export function safeUrl(u: unknown): string | undefined {
  if (typeof u !== 'string') return undefined;
  const s = u.trim().slice(0, 1000);
  if (!/^https?:\/\//i.test(s)) return undefined;
  try {
    return new URL(s).toString();
  } catch {
    return undefined;
  }
}

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max);
  return s ? s : undefined;
};

export function base64UrlDecodeUtf8(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

export function base64UrlEncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type DecodeResult = { ok: true; payload: CapturePayload } | { ok: false; error: string };

// Reads "#d=<base64url JSON>" defensively. Never trusts the shape of what the bookmark sent.
export function decodeCapture(hash: string): DecodeResult {
  const m = /^#?d=([A-Za-z0-9_-]+)$/.exec(hash || '');
  if (!m) return { ok: false, error: 'This link has no captured data.' };
  if (m[1].length > MAX_HASH_CHARS) return { ok: false, error: 'The captured data is too large. Capture fewer items and try again.' };
  let raw: unknown;
  try {
    raw = JSON.parse(base64UrlDecodeUtf8(m[1]));
  } catch {
    return { ok: false, error: 'The captured data could not be read. Click the bookmark again.' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'The captured data looks wrong. Click the bookmark again.' };
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !Array.isArray(o.items)) return { ok: false, error: 'The captured data is from a different version. Reinstall the bookmark from this page.' };
  const items: CaptureItem[] = [];
  for (const entry of o.items.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const text = str(e.text, MAX_TEXT);
    if (!text || text.length < 5) continue;
    const item: CaptureItem = { text };
    const url = safeUrl(e.url);
    if (url) item.url = url;
    const title = str(e.title, 200);
    if (title) item.title = title;
    const author = str(e.author, 80);
    if (author) item.author = author;
    const price = str(e.price_text, 60);
    if (price) item.price_text = price;
    const channel = str(e.channel_label, 120);
    if (channel) item.channel_label = channel;
    items.push(item);
  }
  if (!items.length) return { ok: false, error: 'Nothing readable was captured. Select some text or open a page with offers and try again.' };
  return {
    ok: true,
    payload: {
      v: 1,
      site: str(o.site, 120) ?? '',
      page_title: str(o.page_title, 200) ?? '',
      page_url: safeUrl(o.page_url) ?? '',
      items,
    },
  };
}

// Splits pasted text into posts. "---" lines always separate posts; blank lines do too when asked.
export function splitPosts(text: string, byBlankLines: boolean): string[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  let chunks = normalized.split(/^[ \t]*-{3,}[ \t]*$/m);
  if (byBlankLines) chunks = chunks.flatMap((c) => c.split(/\n[ \t]*\n+/));
  return chunks
    .map((c) => c.trim())
    .filter((c) => c.length >= 5)
    .slice(0, MAX_ITEMS)
    .map((c) => c.slice(0, MAX_TEXT));
}

export function previewTitle(item: CaptureItem): string {
  const base = (item.title || item.text).replace(/\s+/g, ' ').trim();
  return base.length > 160 ? base.slice(0, 159) + '…' : base;
}

export function siteLabel(site: string): string {
  return site.replace(/^www\./i, '');
}

export function toQuickAddItems(items: CaptureItem[], site: string, pageTitle: string): QuickAddItem[] {
  return items.map((i) => {
    const out: QuickAddItem = { text: i.text.slice(0, MAX_TEXT) };
    if (i.url) out.url = i.url;
    if (i.title) out.title = i.title;
    if (i.author) out.author = i.author;
    if (i.price_text) out.price_text = i.price_text;
    if (i.channel_label) out.channel_label = i.channel_label;
    if (site) out.site = site;
    if (pageTitle) out.page_title = pageTitle;
    return out;
  });
}

export function readOutcomes(result: Record<string, unknown> | null): {
  inserted: number;
  duplicates: number;
  skipped: number;
  items: QuickAddOutcome[];
} {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const items: QuickAddOutcome[] = [];
  const raw = result && Array.isArray(result.items) ? (result.items as unknown[]) : [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const outcome = o.outcome === 'inserted' || o.outcome === 'duplicate' ? o.outcome : 'skipped';
    const s = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    items.push({
      index: num(o.index),
      outcome,
      reason: s(o.reason),
      title: s(o.title),
      kind: s(o.kind),
      game: s(o.game),
      item_type: s(o.item_type),
      side: s(o.side),
      trade_match: s(o.trade_match),
      trust: typeof o.trust === 'number' || typeof o.trust === 'string' ? o.trust : undefined,
    });
  }
  return {
    inserted: num(result?.inserted) || items.filter((i) => i.outcome === 'inserted').length,
    duplicates: num(result?.duplicates) || items.filter((i) => i.outcome === 'duplicate').length,
    skipped: num(result?.skipped) || items.filter((i) => i.outcome === 'skipped').length,
    items,
  };
}
