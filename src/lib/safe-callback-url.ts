/**
 * Allow only same-origin relative paths for post-login redirects.
 * Blocks open redirects like `https://evil.tld` or `//evil.tld`.
 */
export function safeCallbackUrl(
  raw: string | null | undefined,
  fallback = '/dashboard'
): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  // Block scheme-relative / encoded tricks
  if (/^\/[^/].*:/.test(value)) return fallback;
  if (value.toLowerCase().includes('javascript:')) return fallback;
  return value;
}
