import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ProgramDetailView from '@/components/programs/ProgramDetailView';
import {
  ensurePrograms,
  PROGRAM_KIND_META,
  programPublicPath,
  type ProgramKind,
} from '@/lib/programs';
import type { Metadata } from 'next';
import { isNextBuildPhase } from '@/lib/build-phase';

export async function makeProgramDetailMetadata(
  kind: ProgramKind,
  id: string
): Promise<Metadata> {
  const program = await prisma.portalProgram.findFirst({
    where: { id, kind },
    select: { title: true, summary: true, description: true, image: true },
  });
  if (!program) return { title: 'Не найдено' };
  const { withSiteBrand, getSiteIdentity } = await import('@/lib/site-identity');
  const { siteName } = await getSiteIdentity();
  const description = (program.summary || program.description.replace(/<[^>]+>/g, '')).slice(0, 160);
  return {
    title: withSiteBrand(program.title, siteName),
    description,
    openGraph: {
      title: program.title,
      description,
      images: program.image ? [program.image] : [],
    },
  };
}

export default async function ProgramDetailPage({
  kind,
  params,
}: {
  kind: ProgramKind;
  params: Promise<{ id: string }>;
}) {
  if (!isNextBuildPhase()) {
    await ensurePrograms();
  }
  const { id } = await params;

  const program = await prisma.portalProgram.findFirst({
    where: { id, kind, status: { not: 'DRAFT' } },
  });
  if (!program) notFound();

  const approvedCount = await prisma.application.count({
    where: { programId: program.id, status: 'APPROVED' },
  });

  // Soft redirect protection if somehow kind mismatches URL — already filtered by kind
  void PROGRAM_KIND_META[kind];
  void programPublicPath;

  return (
    <ProgramDetailView
      program={program}
      applicationStatus="NONE"
      approvedCount={approvedCount}
    />
  );
}
