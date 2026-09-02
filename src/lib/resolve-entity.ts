import { prisma } from '@/lib/prisma';
import { decodeRouteParam } from '@/lib/route-id';
import { hasNonAsciiId, projectIdFromTitle, transliterateSlug } from '@/lib/slug-latin';

/** Candidate ids for a dynamic route segment (decoded + latin fallbacks). */
export function routeIdCandidates(raw: string | undefined | null): string[] {
  const decoded = decodeRouteParam(raw);
  if (!decoded) return [];
  const out: string[] = [decoded];
  if (decoded.startsWith('crm_proj_') && hasNonAsciiId(decoded)) {
    out.push(`crm_proj_${transliterateSlug(decoded.slice('crm_proj_'.length), 48)}`);
  } else if (hasNonAsciiId(decoded) && !decoded.startsWith('crm_')) {
    out.push(projectIdFromTitle(decoded));
  }
  return [...new Set(out)];
}

export async function findProjectByRouteId(raw: string | undefined | null) {
  for (const id of routeIdCandidates(raw)) {
    const project = await prisma.project.findUnique({ where: { id } });
    if (project) return project;
  }
  return null;
}

export async function findClubByRouteId(raw: string | undefined | null) {
  const id = decodeRouteParam(raw);
  if (!id) return null;
  return prisma.club.findUnique({ where: { id } });
}

export async function findSpaceByRouteId(raw: string | undefined | null) {
  const id = decodeRouteParam(raw);
  if (!id) return null;
  return prisma.space.findUnique({ where: { id } });
}

export async function findNewsByRouteId(raw: string | undefined | null) {
  const id = decodeRouteParam(raw);
  if (!id) return null;
  return prisma.news.findUnique({ where: { id } });
}

export async function findPlaceByRouteId(raw: string | undefined | null) {
  const id = decodeRouteParam(raw);
  if (!id) return null;
  const bySlug = await prisma.place.findUnique({ where: { slug: id } });
  if (bySlug) return bySlug;
  return prisma.place.findUnique({ where: { id } });
}
