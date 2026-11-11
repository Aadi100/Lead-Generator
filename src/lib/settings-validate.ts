// Small inline validators for settings fields. Each returns an error message or null.
import { looksLikeEmail } from '@/lib/format';

export function emailError(v: string, required = false): string | null {
  const t = v.trim();
  if (!t) return required ? 'Enter an email address.' : null;
  return looksLikeEmail(t) ? null : 'That does not look like an email address.';
}

export function portError(v: number): string | null {
  if (!Number.isFinite(v) || v < 1 || v > 65535) return 'Use a port between 1 and 65535.';
  return null;
}

export function hostError(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Enter the mail server address.';
  if (/\s|:\/\//.test(t)) return 'Use only the server name, like smtp.gmail.com.';
  return null;
}

export function urlError(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'Use a link that starts with http:// or https://.';
  } catch {
    return 'Use a full link that starts with https://.';
  }
}

export function webhookError(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^https:\/\/(discord(app)?\.com)\/api\/webhooks\//.test(t) ? null : 'A Discord webhook starts with https://discord.com/api/webhooks/.';
}
