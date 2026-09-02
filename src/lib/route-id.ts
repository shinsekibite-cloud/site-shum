/**
 * Next.js may pass dynamic route segments still percent-encoded
 * (common with Cyrillic / non-ASCII ids). Always normalize before DB lookup.
 */
export function decodeRouteParam(raw: string | undefined | null): string {
  let value = String(raw || '').trim();
  if (!value) return '';
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(value)) break;
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
}

/** Safe path segment for Link hrefs. */
export function encodeRouteParam(raw: string): string {
  return encodeURIComponent(decodeRouteParam(raw));
}
