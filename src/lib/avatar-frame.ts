import type { AchievementTier } from '@/lib/achievements';
import { TIER_META } from '@/lib/achievements';

/** Border / ring color for avatar based on highest achievement tier. */
export function avatarFrameFromTiers(tiers: AchievementTier[]): {
  border: string;
  glow: string;
  label: string | null;
} {
  if (!tiers.length) {
    return { border: 'rgba(148,163,184,0.55)', glow: 'transparent', label: null };
  }
  const order = { gold: 3, silver: 2, bronze: 1 } as const;
  let best: AchievementTier = 'bronze';
  for (const t of tiers) {
    if (order[t] > order[best]) best = t;
  }
  const meta = TIER_META[best];
  const glow =
    best === 'gold'
      ? 'rgba(202,138,4,0.35)'
      : best === 'silver'
        ? 'rgba(100,116,139,0.3)'
        : 'rgba(180,83,9,0.28)';
  return { border: meta.color, glow, label: meta.label };
}

/** Compact badge codes to show around avatar (max 3). Prefer gold → silver → bronze. */
export function pickAvatarBadgeCodes(
  items: { code: string; tier: AchievementTier }[],
  max = 3
): { code: string; tier: AchievementTier }[] {
  const order = { gold: 3, silver: 2, bronze: 1 } as const;
  return [...items]
    .sort((a, b) => order[b.tier] - order[a.tier] || a.code.localeCompare(b.code))
    .slice(0, max);
}
