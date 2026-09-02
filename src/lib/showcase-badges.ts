import { ACHIEVEMENTS, type AchievementDef } from '@/lib/achievements';

export const SHOWCASE_MAX = 3;

/** Preferred codes when auto-picking the latest showcase set. */
export const SHOWCASE_PRIORITY = ['LEGEND', 'INSTRUCTED', 'MODERN_USER'] as const;

export type UnlockedShowcase = {
  code: string;
  unlockedAt: string | Date | null;
};

export function parseShowcaseBadges(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, SHOWCASE_MAX);
  }
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parseShowcaseBadges(parsed);
  } catch {
    /* ignore */
  }
  return [];
}

export function serializeShowcaseBadges(codes: string[]): string {
  const unique = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean))).slice(0, SHOWCASE_MAX);
  return JSON.stringify(unique);
}

export function achievementDef(code: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.code === code);
}

/**
 * Default showcase: latest unlocked achievements (priority codes first among recent).
 * Falls back to empty when nothing unlocked.
 */
export function defaultShowcaseCodes(unlocked: UnlockedShowcase[], max = SHOWCASE_MAX): string[] {
  if (!unlocked.length) return [];
  const byTime = [...unlocked].sort((a, b) => {
    const ta = a.unlockedAt ? new Date(a.unlockedAt).getTime() : 0;
    const tb = b.unlockedAt ? new Date(b.unlockedAt).getTime() : 0;
    return tb - ta;
  });

  const picked: string[] = [];
  const priority = new Set<string>(SHOWCASE_PRIORITY);
  for (const row of byTime) {
    if (picked.length >= max) break;
    if (priority.has(row.code) && !picked.includes(row.code)) picked.push(row.code);
  }
  for (const row of byTime) {
    if (picked.length >= max) break;
    if (!picked.includes(row.code) && achievementDef(row.code)) picked.push(row.code);
  }
  return picked;
}

/**
 * Resolve stored selection against unlocked codes.
 * - `null` / `undefined` → auto defaults (first visit)
 * - `[]` or explicit list → respect user choice (including empty)
 * Never silently re-fills after the user cleared pins.
 */
export function resolveShowcaseCodes(
  stored: string[] | null | undefined,
  unlocked: UnlockedShowcase[],
  max = SHOWCASE_MAX
): string[] {
  const unlockedSet = new Set(unlocked.map((u) => u.code));
  if (stored === null || stored === undefined) {
    return defaultShowcaseCodes(unlocked, max);
  }
  return stored.filter((c) => unlockedSet.has(c) && achievementDef(c)).slice(0, max);
}
