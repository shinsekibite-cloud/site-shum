import { prisma } from '@/lib/prisma';
import {
  DEFAULT_MODERATION_CONFIG,
  parseModerationConfig,
  type ModerationConfig,
} from '@/lib/moderation-config';

export async function getModerationConfig(): Promise<ModerationConfig> {
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { moderationConfigJson: true },
    });
    return parseModerationConfig(row?.moderationConfigJson);
  } catch {
    return {
      ...DEFAULT_MODERATION_CONFIG,
      rateLimits: { ...DEFAULT_MODERATION_CONFIG.rateLimits },
    };
  }
}
