import type { MetadataRoute } from 'next';
import { getSiteIdentity } from '@/lib/site-identity';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { publicOrigin: BASE } = await getSiteIdentity();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/dashboard', '/scanner', '/login', '/register'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
