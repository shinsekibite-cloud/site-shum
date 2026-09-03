/** Client-safe public paths for CMS / catalog pages (no Prisma). */

export function publicPagePath(slug: string) {
  if (slug === 'privacy') return '/privacy';
  if (slug === 'rules') return '/rules';
  if (slug === 'grants' || slug === 'dobro' || slug === 'self-gov') return `/${slug}`;
  if (slug === 'contacts') return '/contacts';
  if (slug === 'documents') return '/documents';
  return `/p/${slug}`;
}
