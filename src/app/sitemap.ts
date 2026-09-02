import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { publishedWhere } from '@/lib/publish';
import { getSiteIdentity } from '@/lib/site-identity';
import { encodeRouteParam } from '@/lib/route-id';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { publicOrigin: BASE } = await getSiteIdentity();
  const staticPaths = [
    '',
    '/spaces',
    '/places',
    '/projects',
    '/clubs',
    '/news',
    '/events',
    '/contacts',
    '/p/about',
    '/grants',
    '/documents',
    '/dobro',
    '/self-gov',
    '/privacy',
    '/rules',
  ];

  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: path === '' || path === '/news' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  try {
    const [spaces, projects, clubs, pages, news, places] = await Promise.all([
      prisma.space.findMany({
        where: { status: { not: 'INACTIVE' } },
        select: { id: true, updatedAt: true },
      }),
      prisma.project.findMany({
        where: { status: { not: 'INACTIVE' } },
        select: { id: true, updatedAt: true },
      }),
      prisma.club.findMany({
        where: { status: { not: 'INACTIVE' } },
        select: { id: true, updatedAt: true },
      }),
      prisma.pageContent.findMany({
        where: publishedWhere(),
        select: { slug: true, updatedAt: true },
      }),
      prisma.news.findMany({
        where: publishedWhere(),
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, createdAt: true, publishedAt: true },
      }),
      prisma.place.findMany({
        where: { status: 'PUBLISHED' },
        select: { id: true, slug: true, updatedAt: true },
      }),
    ]);

    for (const s of spaces) {
      entries.push({ url: `${BASE}/spaces/${encodeRouteParam(s.id)}`, lastModified: s.updatedAt, changeFrequency: 'weekly', priority: 0.8 });
    }
    for (const p of projects) {
      entries.push({ url: `${BASE}/projects/${encodeRouteParam(p.id)}`, lastModified: p.updatedAt, changeFrequency: 'weekly', priority: 0.7 });
    }
    for (const c of clubs) {
      entries.push({ url: `${BASE}/clubs/${encodeRouteParam(c.id)}`, lastModified: c.updatedAt, changeFrequency: 'weekly', priority: 0.7 });
    }
    for (const pl of places) {
      entries.push({
        url: `${BASE}/places/${encodeRouteParam(pl.slug || pl.id)}`,
        lastModified: pl.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.75,
      });
    }
    for (const p of pages) {
      entries.push({ url: `${BASE}/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly', priority: 0.6 });
    }
    for (const n of news) {
      entries.push({
        url: `${BASE}/news/${encodeRouteParam(n.id)}`,
        lastModified: n.publishedAt || n.createdAt,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  } catch {
    /* keep static entries */
  }

  return entries;
}
