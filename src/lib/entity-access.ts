import { prisma } from '@/lib/prisma';
import { isStaffRole } from '@/lib/access-settings';

export type EntityKind = 'PROJECT' | 'CLUB';

export function entityPairKey(kind: EntityKind, entityId: string) {
  return `${kind.toLowerCase()}:${entityId}`;
}

export async function hasEntityAccess(
  userId: string,
  role: string | null | undefined,
  kind: EntityKind,
  entityId: string
): Promise<boolean> {
  if (isStaffRole(role)) return true;
  const app = await prisma.application.findFirst({
    where: {
      userId,
      status: 'APPROVED',
      ...(kind === 'PROJECT' ? { projectId: entityId } : { clubId: entityId }),
    },
    select: { id: true },
  });
  return Boolean(app);
}
