/** Server gallery helpers (Prisma settings). Client code must import gallery-shared. */

import { prisma } from '@/lib/prisma';
import {
  galleryUrls,
  parseGalleryItems,
  type GalleryItem,
} from '@/lib/gallery-shared';
import { galleryBonusSlots } from '@/lib/reputation';
import { isNextBuildPhase } from '@/lib/build-phase';

export type { GalleryItem };
export {
  parseGalleryItems,
  serializeGalleryItems,
  serializeGalleryUrls,
  galleryUrls,
} from '@/lib/gallery-shared';

export type GallerySettings = {
  homepageEnabled: boolean;
  pageEnabled: boolean;
  publicEnabled: boolean;
  orgGallery: string[];
  orgGalleryItems: GalleryItem[];
  orgGalleryJson: string | null;
  maxPerUser: number;
  maxUploadBytes: number;
};

/** Whether a viewer (guest or user) may see the portal activity gallery. */
export function canViewPortalGallery(opts: {
  homepageEnabled?: boolean;
  pageEnabled?: boolean;
  publicEnabled: boolean;
  isAuthenticated: boolean;
  surface: 'home' | 'page';
}): boolean {
  const surfaceOn =
    opts.surface === 'home' ? Boolean(opts.homepageEnabled) : Boolean(opts.pageEnabled);
  if (!surfaceOn) return false;
  return opts.isAuthenticated || opts.publicEnabled;
}

/** Load org gallery settings for admin pickers and homepage. */
export async function getGallerySettings(): Promise<GallerySettings> {
  if (isNextBuildPhase()) {
    return {
      homepageEnabled: true,
      pageEnabled: true,
      publicEnabled: false,
      orgGallery: [],
      orgGalleryItems: [],
      orgGalleryJson: null,
      maxPerUser: 12,
      maxUploadBytes: 2 * 1024 * 1024,
    };
  }
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: {
        galleryHomepageEnabled: true,
        galleryPageEnabled: true,
        galleryPublicEnabled: true,
        orgGalleryJson: true,
        galleryMaxPerUser: true,
        galleryMaxUploadBytes: true,
      },
    });
    const orgItems = parseGalleryItems(row?.orgGalleryJson, 48);
    return {
      homepageEnabled: row?.galleryHomepageEnabled ?? true,
      pageEnabled: row?.galleryPageEnabled ?? true,
      publicEnabled: row?.galleryPublicEnabled ?? false,
      orgGallery: galleryUrls(orgItems),
      orgGalleryItems: orgItems,
      orgGalleryJson: row?.orgGalleryJson ?? null,
      maxPerUser: Math.min(48, Math.max(1, row?.galleryMaxPerUser ?? 12)),
      maxUploadBytes: Math.min(
        15 * 1024 * 1024,
        Math.max(256 * 1024, row?.galleryMaxUploadBytes ?? 2 * 1024 * 1024)
      ),
    };
  } catch {
    return {
      homepageEnabled: true,
      pageEnabled: true,
      publicEnabled: false,
      orgGallery: [],
      orgGalleryItems: [],
      orgGalleryJson: null,
      maxPerUser: 12,
      maxUploadBytes: 2 * 1024 * 1024,
    };
  }
}

/** Base personal gallery limit + social rating bonus slots. */
export async function personalGalleryMaxForUser(userId: string): Promise<{
  base: number;
  bonus: number;
  max: number;
  maxUploadBytes: number;
}> {
  const settings = await getGallerySettings();
  let bonus = 0;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { socialScore: true },
    });
    bonus = galleryBonusSlots(u?.socialScore ?? 50);
  } catch {
    bonus = 0;
  }
  const max = Math.min(48, settings.maxPerUser + bonus);
  return {
    base: settings.maxPerUser,
    bonus,
    max,
    maxUploadBytes: settings.maxUploadBytes,
  };
}
