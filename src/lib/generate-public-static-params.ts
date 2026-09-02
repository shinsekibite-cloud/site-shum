import { prisma } from '@/lib/prisma';
import { isNextBuildPhase } from '@/lib/build-phase';
import { publishedWhere } from '@/lib/publish';

async function safeIds(
  loader: () => Promise<Array<{ id: string }>>
): Promise<Array<{ id: string }>> {
  if (isNextBuildPhase()) return [];
  try {
    const rows = await loader();
    return rows.map((r) => ({ id: r.id }));
  } catch {
    return [];
  }
}

export async function staticProjectParams() {
  return safeIds(() =>
    prisma.project.findMany({
      where: { isDemoData: false, status: { not: 'INACTIVE' } },
      select: { id: true },
      take: 120,
    })
  );
}

export async function staticClubParams() {
  return safeIds(() =>
    prisma.club.findMany({
      where: { isDemoData: false, status: { not: 'INACTIVE' } },
      select: { id: true },
      take: 120,
    })
  );
}

export async function staticSpaceParams() {
  return safeIds(() =>
    prisma.space.findMany({
      where: { isDemoData: false, status: { not: 'INACTIVE' } },
      select: { id: true },
      take: 80,
    })
  );
}

export async function staticNewsParams() {
  return safeIds(() =>
    prisma.news.findMany({
      where: publishedWhere(),
      select: { id: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 80,
    })
  );
}

export async function staticPlaceParams() {
  if (isNextBuildPhase()) return [];
  try {
    const rows = await prisma.place.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, slug: true },
      take: 120,
    });
    return rows.map((r) => ({ id: r.slug || r.id }));
  } catch {
    return [];
  }
}

export async function staticCmsPageParams() {
  if (isNextBuildPhase()) return [];
  try {
    const rows = await prisma.pageContent.findMany({
      where: publishedWhere(),
      select: { slug: true },
      take: 80,
    });
    return rows.map((r) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

export async function staticDocumentParams() {
  return safeIds(() =>
    prisma.siteDocument.findMany({
      where: publishedWhere(),
      select: { id: true },
      take: 80,
    })
  );
}

export async function staticProgramParams(kind: 'GRANT' | 'DOBRO' | 'SELF_GOV') {
  return safeIds(() =>
    prisma.portalProgram.findMany({
      where: { kind, status: { not: 'DRAFT' } },
      select: { id: true },
      take: 80,
    })
  );
}
