import { prisma } from '@/lib/prisma';
import ProgramCatalog from '@/components/programs/ProgramCatalog';
import { ensurePrograms, type ProgramKind } from '@/lib/programs';
import { brandedMetadata } from '@/lib/branded-metadata';
import { PROGRAM_KIND_META } from '@/lib/programs';
import type { Metadata } from 'next';
import { isNextBuildPhase } from '@/lib/build-phase';

export async function makeProgramListMetadata(kind: ProgramKind): Promise<Metadata> {
  const meta = PROGRAM_KIND_META[kind];
  const path = kind === 'GRANT' ? '/grants' : kind === 'DOBRO' ? '/dobro' : '/self-gov';
  return brandedMetadata(meta.title, { description: meta.listDescription, canonicalPath: path });
}

export default async function ProgramListPage({ kind }: { kind: ProgramKind }) {
  if (!isNextBuildPhase()) {
    await ensurePrograms();
  }

  let items: Awaited<ReturnType<typeof prisma.portalProgram.findMany>> = [];
  try {
    if (!isNextBuildPhase()) {
      items = await prisma.portalProgram.findMany({
        where: {
          kind,
          status: { in: ['OPEN', 'CLOSED', 'ARCHIVED'] },
        },
        orderBy: [{ sortOrder: 'asc' }, { endsAt: 'asc' }, { createdAt: 'desc' }],
        include: { _count: { select: { applications: true } } },
      });
    }
  } catch (e) {
    console.error('Program list load', kind, e);
  }

  const serialized = items.map((item) => ({
    ...item,
    startsAt: item.startsAt ? item.startsAt.toISOString() : null,
    endsAt: item.endsAt ? item.endsAt.toISOString() : null,
  }));

  return <ProgramCatalog kind={kind} items={serialized} />;
}
