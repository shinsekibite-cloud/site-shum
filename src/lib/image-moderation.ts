/**
 * Profile / gallery image moderation queue.
 * New user photos are PENDING until staff approves (or auto-approved for trusted users).
 * Uses ContentFlag with sourceType AVATAR_IMAGE | GALLERY_IMAGE.
 */
import { prisma } from '@/lib/prisma';
import { notifyStaffModeration } from '@/lib/content-moderation';
import {
  parseGalleryItems,
  serializeGalleryItems,
  type GalleryItem,
  type GalleryModerationStatus,
} from '@/lib/gallery-shared';

export const IMAGE_SOURCE = {
  AVATAR: 'AVATAR_IMAGE',
  GALLERY: 'GALLERY_IMAGE',
} as const;

/** Authority threshold for auto-approve of personal photos. */
export const IMAGE_AUTO_APPROVE_AUTHORITY = 92;

export async function shouldAutoApproveImages(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { reliabilityScore: true, role: true },
  });
  if (!u) return false;
  if (u.role === 'ADMIN' || u.role === 'MODERATOR') return true;
  return (u.reliabilityScore ?? 100) >= IMAGE_AUTO_APPROVE_AUTHORITY;
}

export async function queueImageModeration(opts: {
  userId: string;
  url: string;
  sourceType: (typeof IMAGE_SOURCE)[keyof typeof IMAGE_SOURCE];
  caption?: string | null;
  autoApproved?: boolean;
}) {
  const status = opts.autoApproved ? 'REVIEWED' : 'OPEN';
  const flag = await prisma.contentFlag.create({
    data: {
      category: 'IMAGE_REVIEW',
      categories: JSON.stringify(['IMAGE_REVIEW']),
      severity: 1,
      sourceType: opts.sourceType,
      sourceId: opts.url,
      actorUserId: opts.userId,
      originalText: opts.url,
      maskedText: opts.caption?.trim()
        ? `${opts.url} · ${opts.caption.trim().slice(0, 80)}`
        : opts.url,
      matches: JSON.stringify([{ kind: 'image', url: opts.url }]),
      status,
      reliabilityDelta: 0,
      warnIssued: false,
      ...(opts.autoApproved
        ? { reviewedAt: new Date(), reviewNote: 'Авто-одобрено (высокий авторитет)' }
        : {}),
    },
    select: { id: true },
  });

  if (!opts.autoApproved) {
    const actor = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { name: true },
    });
    await notifyStaffModeration({
      flagId: flag.id,
      actorName: actor?.name || 'Пользователь',
      categories: ['IMAGE_REVIEW'],
      severity: 1,
      snippet:
        opts.sourceType === IMAGE_SOURCE.AVATAR
          ? 'Новый аватар на проверке'
          : 'Фото галереи на проверке',
    }).catch(() => null);
  }

  return flag;
}

export function galleryStatusForNew(autoApproved: boolean): GalleryModerationStatus {
  return autoApproved ? 'APPROVED' : 'PENDING';
}

/** Public viewers only see APPROVED (legacy items without status count as approved). */
export function publicGalleryItems(items: GalleryItem[]): GalleryItem[] {
  return items.filter((i) => !i.status || i.status === 'APPROVED');
}

export async function applyImageModerationDecision(opts: {
  flagId: string;
  action: 'ACTIONED' | 'DISMISSED' | 'REVIEWED';
}) {
  const flag = await prisma.contentFlag.findUnique({ where: { id: opts.flagId } });
  if (!flag) return { ok: false as const, message: 'Не найдено' };
  if (flag.sourceType !== IMAGE_SOURCE.AVATAR && flag.sourceType !== IMAGE_SOURCE.GALLERY) {
    return { ok: true as const, skipped: true as const };
  }

  const url = flag.sourceId || flag.originalText;
  if (!url) return { ok: true as const, skipped: true as const };

  if (flag.sourceType === IMAGE_SOURCE.GALLERY) {
    const user = await prisma.user.findUnique({
      where: { id: flag.actorUserId },
      select: { personalGalleryJson: true },
    });
    const items = parseGalleryItems(user?.personalGalleryJson, 48);
    const nextStatus: GalleryModerationStatus =
      opts.action === 'ACTIONED' ? 'REJECTED' : 'APPROVED';
    // DISMISSED / REVIEWED = approve; ACTIONED = remove/reject inappropriate
    const prev = items.find((it) => it.url === url);
    const wasPending = prev?.status === 'PENDING';
    const next = items
      .map((it) => (it.url === url ? { ...it, status: nextStatus } : it))
      .filter((it) => !(it.url === url && nextStatus === 'REJECTED'));
    await prisma.user.update({
      where: { id: flag.actorUserId },
      data: {
        personalGalleryJson: next.length ? serializeGalleryItems(next, 48) : null,
      },
    });
    if (wasPending && nextStatus === 'APPROVED') {
      const { bumpSocialScore, SOCIAL } = await import('@/lib/reputation');
      const { bumpEcoPoints, ECO } = await import('@/lib/eco-points');
      await bumpSocialScore(flag.actorUserId, SOCIAL.GALLERY_PHOTO_DELTA, 'Фото одобрено модерацией');
      await bumpEcoPoints(flag.actorUserId, ECO.GALLERY_PHOTO, 'gallery_photo');
    }
    return { ok: true as const, kind: 'gallery' as const, status: nextStatus };
  }

  // Avatar: ACTIONED → clear image; otherwise keep
  if (flag.sourceType === IMAGE_SOURCE.AVATAR && opts.action === 'ACTIONED') {
    const user = await prisma.user.findUnique({
      where: { id: flag.actorUserId },
      select: { image: true },
    });
    if (user?.image === url) {
      await prisma.user.update({
        where: { id: flag.actorUserId },
        data: { image: null },
      });
    }
    return { ok: true as const, kind: 'avatar' as const, status: 'REJECTED' as const };
  }

  return { ok: true as const, kind: 'avatar' as const, status: 'APPROVED' as const };
}
