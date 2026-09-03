import { prisma } from '@/lib/prisma';
import { getAccessSettings } from '@/lib/access-settings';
import { getModerationConfig } from '@/lib/moderation-settings';
import { getSiteIdentity } from '@/lib/site-identity';
import { getModuleFlags } from '@/lib/module-flags';
import { isNextBuildPhase } from '@/lib/build-phase';
import {
  buildLegalDynamicAppendix,
  buildRulesDynamicAppendix,
  buildTermsDynamicAppendix,
  stripPreviousDynamicBlocks,
  type LegalDynamicInput,
} from '@/lib/legal-dynamic';

export async function loadLegalDynamicInput(): Promise<LegalDynamicInput> {
  if (isNextBuildPhase()) {
    const identity = await getSiteIdentity();
    return {
      siteName: identity.siteName,
      operatorName: null,
      operatorInn: null,
      operatorOgrn: null,
      pdnResponsibleEmail: null,
      contactEmail: null,
      address: null,
      cookieBannerEnabled: true,
      analyticsConsentRequired: true,
      copyProtectionEnabled: true,
      access: await getAccessSettings(),
      moderation: await getModerationConfig(),
      modules: await getModuleFlags(),
    };
  }
  const [identity, access, moderation, settings, modules] = await Promise.all([
    getSiteIdentity(),
    getAccessSettings(),
    getModerationConfig(),
    prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: {
        operatorName: true,
        operatorInn: true,
        operatorOgrn: true,
        pdnResponsibleEmail: true,
        contactEmail: true,
        address: true,
        cookieBannerEnabled: true,
        analyticsConsentRequired: true,
        copyProtectionEnabled: true,
      },
    }),
    getModuleFlags(),
  ]);

  return {
    siteName: identity.siteName,
    operatorName: settings?.operatorName || null,
    operatorInn: settings?.operatorInn || null,
    operatorOgrn: settings?.operatorOgrn || null,
    pdnResponsibleEmail: settings?.pdnResponsibleEmail || null,
    contactEmail: settings?.contactEmail || null,
    address: settings?.address || null,
    cookieBannerEnabled: settings?.cookieBannerEnabled !== false,
    analyticsConsentRequired: settings?.analyticsConsentRequired !== false,
    copyProtectionEnabled: settings?.copyProtectionEnabled !== false,
    access,
    moderation,
    modules,
  };
}

export async function withPrivacyDynamicHtml(rawHtml: string) {
  const cleaned = stripPreviousDynamicBlocks(rawHtml);
  const appendix = buildLegalDynamicAppendix(await loadLegalDynamicInput());
  return `${cleaned}\n${appendix}`;
}

export async function withRulesDynamicHtml(rawHtml: string) {
  const cleaned = stripPreviousDynamicBlocks(rawHtml);
  const appendix = buildRulesDynamicAppendix(await loadLegalDynamicInput());
  return `${cleaned}\n${appendix}`;
}

export async function withTermsDynamicHtml(rawHtml: string) {
  const cleaned = stripPreviousDynamicBlocks(rawHtml);
  const appendix = buildTermsDynamicAppendix(await loadLegalDynamicInput());
  return `${cleaned}\n${appendix}`;
}
