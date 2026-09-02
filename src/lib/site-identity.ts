import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { isNextBuildPhase } from '@/lib/build-phase';
import {
  DEFAULT_PUBLIC_ORIGIN,
  DEFAULT_SITE_NAME,
  hostFromOrigin,
  identityFromSettings,
  normalizeOrigin,
  originFromEnv,
  shortSiteName,
  type SiteIdentity,
} from '@/lib/site-identity-shared';

export type { SiteIdentity };
export {
  DEFAULT_PUBLIC_ORIGIN,
  DEFAULT_SITE_NAME,
  applySitePlaceholders,
  hostFromOrigin,
  identityFromSettings,
  isLocalOrigin,
  normalizeOrigin,
  originFromEnv,
  shortSiteName,
  withSiteBrand,
} from '@/lib/site-identity-shared';

/**
 * Resolve site name + public domain from DB + env.
 * Server-only (uses Prisma). Prefer identityFromSettings / shared helpers on the client.
 */
export const getSiteIdentity = cache(async (): Promise<SiteIdentity> => {
  if (isNextBuildPhase()) {
    const publicOrigin = originFromEnv({ allowLocal: true });
    return {
      siteName: DEFAULT_SITE_NAME,
      publicOrigin,
      shortName: shortSiteName(DEFAULT_SITE_NAME),
      host: hostFromOrigin(publicOrigin),
    };
  }
  try {
    const s = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: { siteName: true, publicSiteUrl: true },
    });
    return identityFromSettings(s);
  } catch {
    const publicOrigin = originFromEnv({ allowLocal: true });
    return {
      siteName: DEFAULT_SITE_NAME,
      publicOrigin,
      shortName: shortSiteName(DEFAULT_SITE_NAME),
      host: hostFromOrigin(publicOrigin),
    };
  }
});
