/** First client IP from proxy headers (for rate limits). */
export function requestClientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for') || '';
  const first = xf.split(',')[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = (req.headers.get('x-real-ip') || '').trim();
  if (real) return real.slice(0, 64);
  return '127.0.0.1';
}
