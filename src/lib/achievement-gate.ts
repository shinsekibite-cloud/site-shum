import { prisma } from '@/lib/prisma';
import { achievementProgress } from '@/lib/achievements';

/** True when the user unlocked all countable achievements (legend path). */
export async function userHasFullAchievements(userId: string): Promise<boolean> {
  const rows = await prisma.userAchievement.findMany({
    where: { userId },
    select: { code: true },
  });
  const codes = rows.map((r) => r.code);
  if (codes.includes('LEGEND')) return true;
  return achievementProgress(codes).complete;
}
