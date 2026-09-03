import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

/** Sync raffle pool from ticket check-ins of linked booking */
export async function syncRaffleEntriesFromCheckIns(contestId: string) {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest || contest.kind !== 'RAFFLE' || !contest.bookingId) {
    return { synced: 0 };
  }
  const checkIns = await prisma.ticketCheckIn.findMany({
    where: { bookingId: contest.bookingId },
    select: { userId: true },
  });
  let synced = 0;
  for (const c of checkIns) {
    try {
      await prisma.contestRaffleEntry.upsert({
        where: { contestId_userId: { contestId, userId: c.userId } },
        create: { contestId, userId: c.userId, source: 'CHECK_IN' },
        update: { source: 'CHECK_IN' },
      });
      synced += 1;
    } catch {
      /* ignore */
    }
  }
  return { synced };
}

/** Deterministic shuffle with seed for auditability */
function seededShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = crypto.createHash('sha256').update(seed).digest();
  for (let i = arr.length - 1; i > 0; i--) {
    h = crypto.createHash('sha256').update(h).digest();
    const n = h.readUInt32BE(0);
    const j = n % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function drawRaffleWinners(contestId: string, drawnById: string) {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest || contest.kind !== 'RAFFLE') {
    throw new Error('Не розыгрыш');
  }
  if (contest.drawnAt) {
    throw new Error('Розыгрыш уже проведён');
  }

  await syncRaffleEntriesFromCheckIns(contestId);
  const entries = await prisma.contestRaffleEntry.findMany({
    where: { contestId },
    select: { userId: true },
  });
  if (entries.length === 0) {
    throw new Error('Нет участников в пуле');
  }

  const seed = `${contestId}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;
  const shuffled = seededShuffle(
    entries.map((e) => e.userId),
    seed
  );
  const count = Math.min(Math.max(1, contest.winnerCount || 1), shuffled.length);
  const winners = shuffled.slice(0, count);

  await prisma.$transaction([
    ...winners.map((userId, idx) =>
      prisma.contestWinner.create({
        data: {
          contestId,
          userId,
          place: idx + 1,
          drawnById,
        },
      })
    ),
    prisma.contest.update({
      where: { id: contestId },
      data: {
        drawSeed: seed,
        drawnAt: new Date(),
        status: 'CLOSED',
      },
    }),
  ]);

  return { seed, winners, count };
}
