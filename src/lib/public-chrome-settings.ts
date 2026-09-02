import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { isNextBuildPhase } from '@/lib/build-phase';
import {
  DEFAULT_PUBLIC_ORIGIN,
  DEFAULT_SITE_NAME,
  identityFromSettings,
} from '@/lib/site-identity-shared';

export type PublicChromeSettings = {
  yandexMetrikaId: string | null;
  copyProtectionEnabled: boolean;
  cookieBannerEnabled: boolean;
  analyticsConsentRequired: boolean;
  siteName: string;
  publicOrigin: string;
};

const FALLBACK: PublicChromeSettings = {
  yandexMetrikaId: null,
  copyProtectionEnabled: true,
  cookieBannerEnabled: true,
  analyticsConsentRequired: true,
  siteName: DEFAULT_SITE_NAME,
  publicOrigin: DEFAULT_PUBLIC_ORIGIN,
};

export const getCachedPublicChromeSettings = unstable_cache(
  async (): Promise<PublicChromeSettings> => {
    if (isNextBuildPhase()) return FALLBACK;
    try {
      const s = await prisma.siteSettings.findUnique({
        where: { id: '1' },
        select: {
          yandexMetrikaId: true,
          copyProtectionEnabled: true,
          cookieBannerEnabled: true,
          analyticsConsentRequired: true,
          siteName: true,
          publicSiteUrl: true,
        },
      });
      const identity = identityFromSettings(s);
      return {
        yandexMetrikaId: s?.yandexMetrikaId || null,
        copyProtectionEnabled: s?.copyProtectionEnabled !== false,
        cookieBannerEnabled: s?.cookieBannerEnabled !== false,
        analyticsConsentRequired: s?.analyticsConsentRequired !== false,
        siteName: identity.siteName,
        publicOrigin: identity.publicOrigin,
      };
    } catch {
      return FALLBACK;
    }
  },
  ['public-chrome-settings-v1'],
  { revalidate: 60, tags: ['yp-site-chrome'] }
);
