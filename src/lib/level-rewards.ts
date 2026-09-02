/**
 * One-time eco rewards when a profile level / prestige star is first reached.
 * Marker: ReputationEvent reason `level_reward_<n>` / `prestige_reward_<n>` (kind ECO).
 *
 * Prestige eco rewards are capped to PRESTIGE_SEASONS (no feedback loop with eco balance).
 */
import { prisma } from '@/lib/prisma';
import { bumpEcoPoints } from '@/lib/eco-points';
import { PROFILE_LEVELS, levelByNumber, prestigeProgress, PRESTIGE_SEASONS } from '@/lib/profile-level';

const reasonFor = (level: number) => `level_reward_${level}`;
const prestigeReason = (star: number) => `prestige_reward_${star}`;

/** Hard cap: only defined seasons grant eco (prevents eco→prestige→eco storm). */
export const MAX_PRESTIGE_REWARD_STAR = PRESTIGE_SEASONS.length;

async function loadRewardMarkers(userId: string): Promise<Set<string>> {
  const markers = await prisma.reputationEvent.findMany({
    where: {
      userId,
      kind: 'ECO',
      OR: [{ reason: { startsWith: 'level_reward_' } }, { reason: { startsWith: 'prestige_reward_' } }],
    },
    select: { reason: true },
    distinct: ['reason'],
  });
  return new Set(markers.map((m: { reason: string | null }) => m.reason).filter(Boolean) as string[]);
}

export async function ensureLevelRewards(userId: string, currentLevel: number) {
  if (!userId || currentLevel < 2) return { granted: [] as number[] };

  const granted: number[] = [];
  const have = await loadRewardMarkers(userId);

  for (const row of PROFILE_LEVELS) {
    if (row.level < 2 || row.level > currentLevel) continue;
    const reason = reasonFor(row.level);
    if (have.has(reason)) continue;
    const eco = row.reward.eco;
    if (eco > 0) {
      const updated = await bumpEcoPoints(userId, eco, reason, {
        level: row.level,
        title: row.title,
        perk: row.reward.perk,
      });
      if (updated) {
        have.add(reason);
        granted.push(row.level);
      }
    }
  }

  // Prestige stars after level 10 — rewards only for seasons 1..MAX (no infinite loop)
  try {
    if (currentLevel >= 10) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { ecoPoints: true, cosmeticsJson: true, collectiblesJson: true },
      });
      if (user) {
        const { cosmeticsCatalogValue, parseCosmetics } = await import('@/lib/eco-points');
        const { parseCollectibles, collectiblesValue } = await import('@/lib/collectibles');
        const { profileContribution } = await import('@/lib/profile-level');
        const contrib = profileContribution({
          ecoPoints: user.ecoPoints ?? 0,
          cosmeticsValue: cosmeticsCatalogValue(parseCosmetics(user.cosmeticsJson)),
          collectiblesValue: collectiblesValue(parseCollectibles(user.collectiblesJson)),
        });
        const prest = prestigeProgress(contrib);
        if (prest) {
          const starCap = Math.min(prest.star, MAX_PRESTIGE_REWARD_STAR);
          for (let s = 1; s <= starCap; s++) {
            const reason = prestigeReason(s);
            if (have.has(reason)) continue;
            const eco = 10 + s * 5;
            const updated = await bumpEcoPoints(userId, eco, reason, { prestige: s });
            if (updated) {
              have.add(reason);
              granted.push(1000 + s);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[level-rewards] prestige', e);
  }

  return { granted };
}

export function describeLevelReward(level: number) {
  const row = levelByNumber(level);
  if (!row) return null;
  return {
    level: row.level,
    title: row.title,
    eco: row.reward.eco,
    perk: row.reward.perk,
    color: row.color,
    band: row.band,
  };
}
