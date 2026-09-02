import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { isNextBuildPhase } from '@/lib/build-phase';
import { publishedWhere } from '@/lib/publish';
import { PUBLIC_REVALIDATE } from '@/lib/public-revalidate';

const CATALOG_TAKE = 180;

export type PublicProjectCard = {
  id: string;
  title: string;
  description: string | null;
  image: string | null;
  status: string;
  viewCount: number;
  createdAt: string;
  applicationsCount: number;
};

export type PublicClubCard = {
  id: string;
  title: string;
  description: string | null;
  image: string | null;
  status: string;
  tags: string | null;
  meetingSchedule: string | null;
  meetingPlace: string | null;
  curatorName: string | null;
  createdAt: string;
  membersCount: number;
};

export type PublicSpaceCard = {
  id: string;
  title: string;
  description: string | null;
  image: string | null;
  status: string;
  address: string | null;
  capacity: number;
  category: string | null;
  amenities: string | null;
  createdAt: string;
  bookings: Array<{
    id: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    status: string;
    space: { id: string; title: string; capacity: number };
    participantsCount: number;
  }>;
};

export type PublicNewsCard = {
  id: string;
  title: string | null;
  text: string;
  imageUrl: string | null;
  videoEmbedUrl: string | null;
  vkLink: string | null;
  createdAt: string;
  publishedAt: string | null;
};

export type PublicPlaceCard = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string;
  address: string | null;
  district: string | null;
  category: string;
  image: string | null;
  tips: string | null;
  ratingAvg: number;
  ratingCount: number;
  sortOrder: number;
};

export type PublicDocumentCard = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  mimeType: string;
  sizeBytes: number;
};

function empty<T>(): T[] {
  return [];
}

export const getCachedPublicProjects = unstable_cache(
  async (): Promise<PublicProjectCard[]> => {
    if (isNextBuildPhase()) return empty();
    const rows = await prisma.project.findMany({
      where: { isDemoData: false, status: { not: 'INACTIVE' } },
      orderBy: { title: 'asc' },
      take: CATALOG_TAKE,
      select: {
        id: true,
        title: true,
        description: true,
        image: true,
        status: true,
        viewCount: true,
        createdAt: true,
        _count: { select: { applications: true } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      image: p.image,
      status: p.status,
      viewCount: p.viewCount,
      createdAt: p.createdAt.toISOString(),
      applicationsCount: p._count.applications,
    }));
  },
  ['public-projects-catalog-v1'],
  { revalidate: PUBLIC_REVALIDATE, tags: ['yp-home-catalog'] }
);

export const getCachedPublicClubs = unstable_cache(
  async (): Promise<PublicClubCard[]> => {
    if (isNextBuildPhase()) return empty();
    const rows = await prisma.club.findMany({
      where: { isDemoData: false, status: { not: 'INACTIVE' } },
      orderBy: { title: 'asc' },
      take: CATALOG_TAKE,
      select: {
        id: true,
        title: true,
        description: true,
        image: true,
        status: true,
        tags: true,
        meetingSchedule: true,
        meetingPlace: true,
        curatorName: true,
        createdAt: true,
        _count: { select: { applications: { where: { status: 'APPROVED' } } } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      image: c.image,
      status: c.status,
      tags: c.tags,
      meetingSchedule: c.meetingSchedule,
      meetingPlace: c.meetingPlace,
      curatorName: c.curatorName,
      createdAt: c.createdAt.toISOString(),
      membersCount: c._count.applications,
    }));
  },
  ['public-clubs-catalog-v1'],
  { revalidate: PUBLIC_REVALIDATE, tags: ['yp-home-catalog'] }
);

export const getCachedPublicSpaces = unstable_cache(
  async (): Promise<PublicSpaceCard[]> => {
    if (isNextBuildPhase()) return empty();
    const now = new Date();
    const rows = await prisma.space.findMany({
      where: { isDemoData: false },
      orderBy: { createdAt: 'desc' },
      take: CATALOG_TAKE,
      select: {
        id: true,
        title: true,
        description: true,
        image: true,
        status: true,
        address: true,
        capacity: true,
        category: true,
        amenities: true,
        createdAt: true,
        bookings: {
          where: { status: 'APPROVED', startTime: { gte: now } },
          select: {
            id: true,
            title: true,
            description: true,
            startTime: true,
            endTime: true,
            status: true,
            space: { select: { id: true, title: true, capacity: true } },
            _count: { select: { participants: true } },
          },
          orderBy: { startTime: 'asc' },
          take: 4,
        },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      image: s.image,
      status: s.status,
      address: s.address,
      capacity: s.capacity,
      category: s.category,
      amenities: s.amenities,
      createdAt: s.createdAt.toISOString(),
      bookings: s.bookings.map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        startTime: b.startTime.toISOString(),
        endTime: b.endTime.toISOString(),
        status: b.status,
        space: b.space,
        participantsCount: b._count.participants,
      })),
    }));
  },
  ['public-spaces-catalog-v1'],
  { revalidate: PUBLIC_REVALIDATE, tags: ['yp-home-catalog'] }
);

export const getCachedPublicNews = unstable_cache(
  async (): Promise<PublicNewsCard[]> => {
    if (isNextBuildPhase()) return empty();
    const rows = await prisma.news.findMany({
      where: publishedWhere(),
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        title: true,
        text: true,
        imageUrl: true,
        videoEmbedUrl: true,
        vkLink: true,
        createdAt: true,
        publishedAt: true,
      },
    });
    return rows.map((n) => ({
      id: n.id,
      title: n.title,
      text: n.text,
      imageUrl: n.imageUrl,
      videoEmbedUrl: n.videoEmbedUrl,
      vkLink: n.vkLink,
      createdAt: n.createdAt.toISOString(),
      publishedAt: n.publishedAt ? n.publishedAt.toISOString() : null,
    }));
  },
  ['public-news-catalog-v1'],
  { revalidate: PUBLIC_REVALIDATE, tags: ['yp-home-catalog'] }
);

export const getCachedPublicPlaces = unstable_cache(
  async (): Promise<PublicPlaceCard[]> => {
    if (isNextBuildPhase()) return empty();
    const rows = await prisma.place.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ sortOrder: 'asc' }, { ratingAvg: 'desc' }, { title: 'asc' }],
      take: CATALOG_TAKE,
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        description: true,
        address: true,
        district: true,
        category: true,
        image: true,
        tips: true,
        ratingAvg: true,
        ratingCount: true,
        sortOrder: true,
      },
    });
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      description: p.description,
      address: p.address,
      district: p.district,
      category: p.category,
      image: p.image,
      tips: p.tips,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      sortOrder: p.sortOrder,
    }));
  },
  ['public-places-catalog-v1'],
  { revalidate: PUBLIC_REVALIDATE, tags: ['yp-home-catalog'] }
);

export const getCachedPublicDocuments = unstable_cache(
  async (): Promise<PublicDocumentCard[]> => {
    if (isNextBuildPhase()) return empty();
    const rows = await prisma.siteDocument.findMany({
      where: publishedWhere(),
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        mimeType: true,
        sizeBytes: true,
      },
    });
    return rows;
  },
  ['public-documents-catalog-v1'],
  { revalidate: PUBLIC_REVALIDATE, tags: ['yp-site-chrome'] }
);
