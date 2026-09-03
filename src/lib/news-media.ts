/** Resolve a usable cover URL for a news item */
export function newsCoverUrl(imageUrl: string | null | undefined): string {
  const u = String(imageUrl || '').trim();
  if (!u) return '/brand/templates/section-news.svg';
  // already absolute or site-relative
  if (u.startsWith('/') || /^https?:\/\//i.test(u)) return u;
  return `/${u.replace(/^\/+/, '')}`;
}
