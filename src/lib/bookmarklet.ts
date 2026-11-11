import { BOOKMARKLET_SOURCE } from './bookmarklet-source';

// The plain code (no javascript: prefix), whitespace collapsed. Exposed for tests.
export function bookmarkletCode(origin: string): string {
  const clean = origin.replace(/\/+$/, '');
  return BOOKMARKLET_SOURCE.replace('__ORIGIN__', JSON.stringify(clean)).replace(/\n\s*/g, ' ');
}

// The value for a bookmark's URL field. Percent-encoded so every browser keeps it intact.
export function buildBookmarklet(origin: string): string {
  return 'javascript:' + encodeURIComponent(bookmarkletCode(origin));
}
