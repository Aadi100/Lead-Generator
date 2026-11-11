export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nowIso = () => new Date().toISOString();
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

export function hostOf(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'zoho.com',
]);

export function domainOfEmail(email) {
  const m = /@([^@\s]+)$/.exec(String(email || '').trim().toLowerCase());
  return m ? m[1] : null;
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
