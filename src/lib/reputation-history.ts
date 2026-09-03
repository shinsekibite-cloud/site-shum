/** Append-only ledger for authority / social / eco changes. */
import { prisma } from '@/lib/prisma';

export type ReputationKind = 'AUTHORITY' | 'SOCIAL' | 'ECO' | 'M_BALL' | 'ECO_BALL';

export async function logReputationEvent(opts: {
  userId: string;
  kind: ReputationKind;
  delta: number;
  balanceAfter: number;
  reason: string;
  meta?: Record<string, unknown>;
  actorId?: string | null;
}) {
  try {
    await prisma.reputationEvent.create({
      data: {
        userId: opts.userId,
        kind: opts.kind,
        delta: opts.delta,
        balanceAfter: opts.balanceAfter,
        reason: opts.reason.slice(0, 240),
        metaJson: opts.meta ? JSON.stringify(opts.meta).slice(0, 2000) : null,
        ...(opts.actorId || opts.meta?.actorId
          ? { actorId: String(opts.actorId || opts.meta?.actorId) }
          : {}),
      },
    });
  } catch (e) {
    console.warn('[reputation-history]', (e as Error)?.message || e);
  }
}

export async function listReputationHistory(userId: string, opts?: { kind?: ReputationKind; take?: number }) {
  return prisma.reputationEvent.findMany({
    where: {
      userId,
      ...(opts?.kind ? { kind: opts.kind } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(100, opts?.take ?? 40),
    select: {
      id: true,
      kind: true,
      delta: true,
      balanceAfter: true,
      reason: true,
      createdAt: true,
    },
  });
}
