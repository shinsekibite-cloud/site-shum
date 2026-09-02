import { prisma } from '@/lib/prisma';
import { generatePublicCode } from '@/lib/public-id';

/** Ensure user has a short publicCode; returns the code. */
export async function ensureUserPublicCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicCode: true },
  });
  if (existing?.publicCode) return existing.publicCode;

  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generatePublicCode();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { publicCode: code },
      });
      return code;
    } catch {
      // unique collision — retry
    }
  }
  // Extremely unlikely fallback
  const fallback = `YM-${userId.slice(-6).toUpperCase()}`;
  await prisma.user.update({
    where: { id: userId },
    data: { publicCode: fallback },
  });
  return fallback;
}
