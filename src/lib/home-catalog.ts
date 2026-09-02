import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { publishedWhere } from '@/lib/publish';
import { isNextBuildPhase } from '@/lib/build-phase';

/** Cached homepage catalog + hero settings (ISR, same window as public pages). */
export const getHomeCatalog = unstable_cache(
  async () => {
    if (isNextBuildPhase()) {
      return {
        latestProjects: [] as Array<{
          id: string;
          title: string;
          description: string;
          image: string | null;
          _count: { applications: number };
        }>,
        latestClubs: [] as Array<{
          id: string;
          title: string;
          description: string;
          image: string | null;
          _count: { applications: number };
        }>,
        latestSpaces: [] as Array<{
          id: string;
          title: string;
          description: string | null;
          image: string | null;
          address: string | null;
          capacity: number;
        }>,
        latestNews: [] as Array<{
          id: string;
          title: string | null;
          text: string;
          imageUrl: string | null;
          videoEmbedUrl: string | null;
          publishedAt: string | null;
          createdAt: string;
        }>,
        siteSettings: null as {
          heroImageUrl: string | null;
          heroVideoUrl: string | null;
          heroMediaKind: string | null;
          heroAnimationMode: string | null;
          govWidgetsEnabled: boolean | null;
          govWidgetsTitle: string | null;
          govWidgetsJson: string | null;
          galleryHomepageEnabled: boolean | null;
          galleryPublicEnabled: boolean | null;
          orgGalleryJson: string | null;
          siteName: string | null;
          publicEventsVisibility: boolean | null;
        } | null,
      };
    }
    const [latestProjects, latestClubs, latestSpaces, latestNews, siteSettings] = await Promise.all([
      prisma.project.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          title: true,
          description: true,
          image: true,
          _count: { select: { applications: true } },
        },
      }),
      prisma.club.findMany({
        where: { status: { not: 'INACTIVE' } },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          title: true,
          description: true,
          image: true,
          _count: { select: { applications: true } },
        },
      }),
      prisma.space.findMany({
        where: { status: { notIn: ['INACTIVE', 'COMPLETED'] } },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          title: true,
          description: true,
          image: true,
          address: true,
          capacity: true,
        },
      }),
      prisma.news.findMany({
        where: publishedWhere(),
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 3,
        select: {
          id: true,
          title: true,
          text: true,
          imageUrl: true,
          videoEmbedUrl: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      prisma.siteSettings.findUnique({
        where: { id: '1' },
        select: {
          heroImageUrl: true,
          heroVideoUrl: true,
          heroMediaKind: true,
          heroAnimationMode: true,
          govWidgetsEnabled: true,
          govWidgetsTitle: true,
          govWidgetsJson: true,
          galleryHomepageEnabled: true,
          galleryPublicEnabled: true,
          publicEventsVisibility: true,
          orgGalleryJson: true,
          siteName: true,
        },
      }),
    ]);
    // Serialize dates: unstable_cache JSON-encodes Date → string; callers must not assume Date.
    const news = latestNews.map((n) => ({
      ...n,
      publishedAt: n.publishedAt ? n.publishedAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { latestProjects, latestClubs, latestSpaces, latestNews: news, siteSettings };
  },
  ['home-catalog-v3'],
  { revalidate: 60, tags: ['yp-home-catalog', 'home-catalog'] }
);
