/**
 * Allow only http(s) URLs or same-origin /uploads/ paths.
 * Blocks javascript:, data:, vbscript:, and path traversal.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (value.startsWith('/uploads/')) {
    if (value.includes('..') || value.includes('\\') || value.includes('\0')) return null;
    return value;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** True when a string is a safe http(s) or /uploads/ URL (empty allowed). */
export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  const value = String(raw || '').trim();
  if (!value) return true;
  return safeHttpUrl(value) !== null;
}
