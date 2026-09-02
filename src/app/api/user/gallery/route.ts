import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  galleryUrls,
  personalGalleryMaxForUser,
  parseGalleryItems,
  serializeGalleryItems,
} from '@/lib/gallery';
import { saveUploadedImage } from '@/lib/uploads';
import { uploadRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import { unlockAchievement } from '@/lib/award-achievements';
import { bumpSocialScore, SOCIAL } from '@/lib/reputation';
import { bumpEcoPoints, ECO } from '@/lib/eco-points';
import {
  galleryStatusForNew,
  IMAGE_SOURCE,
  queueImageModeration,
  shouldAutoApproveImages,
} from '@/lib/image-moderation';
import { profanityResponse } from '@/lib/censor';
import { assertSameOrigin } from '@/lib/csrf-origin';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
  }
  const limits = await personalGalleryMaxForUser(session.user.id);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { personalGalleryJson: true },
  });
  const items = parseGalleryItems(user?.personalGalleryJson, limits.max);
  return NextResponse.json({
    items,
    urls: galleryUrls(items),
    max: limits.max,
    baseMax: limits.base,
    bonusSlots: limits.bonus,
    maxUploadBytes: limits.maxUploadBytes,
  });
}

export async function PUT(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
  }
  const limits = await personalGalleryMaxForUser(session.user.id);
  const body = await req.json().catch(() => ({}));
  const items = parseGalleryItems(body.items ?? body.urls ?? body.gallery, limits.max);
  for (const it of items) {
    const dirty = profanityResponse(it.caption);
    if (dirty) return dirty;
  }
  const json = serializeGalleryItems(items, limits.max);
  const prev = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { personalGalleryJson: true },
  });
  const prevCount = parseGalleryItems(prev?.personalGalleryJson, limits.max).length;
  await prisma.user.update({
    where: { id: session.user.id },
    data: { personalGalleryJson: items.length ? json : null },
  });
  if (items.length > prevCount) {
    const added = items.length - prevCount;
    await bumpSocialScore(
      session.user.id,
      SOCIAL.GALLERY_PHOTO_DELTA * added,
      added > 1 ? `Добавлено ${added} фото в галерею` : 'Фото в личной галерее'
    );
    await bumpEcoPoints(session.user.id, ECO.GALLERY_PHOTO * added, 'gallery_photo');
  }
  if (items.length >= 1) {
    await unlockAchievement(session.user.id, 'GALLERY_SHOT');
  }
  if (items.length >= 5) {
    await unlockAchievement(session.user.id, 'GALLERY_PRO');
  }
  return NextResponse.json({
    items,
    urls: galleryUrls(items),
    max: limits.max,
    bonusSlots: limits.bonus,
  });
}

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
  }
  const limits = await personalGalleryMaxForUser(session.user.id);
  const { userLimitMultiplier, boostedMax } = await import('@/lib/activity-limits');
  const upMax = boostedMax(20, await userLimitMultiplier(session.user.id));
  if (!(await uploadRateLimiter.checkAsync(`up:${session.user.id}`, upMax))) {
    return NextResponse.json(rateLimitJson('Слишком много загрузок. Подождите минуту.'), {
      status: 429,
    });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ message: 'Файл не найден' }, { status: 400 });
  }
  if (file.size > limits.maxUploadBytes) {
    const mb = (limits.maxUploadBytes / (1024 * 1024)).toFixed(1);
    return NextResponse.json(
      { message: `Файл слишком большой. Лимит галереи: ${mb} МБ` },
      { status: 400 }
    );
  }

  const url = await saveUploadedImage(file, 'gallery', { preset: 'content' });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { personalGalleryJson: true },
  });
  const existing = parseGalleryItems(user?.personalGalleryJson, limits.max);
  if (existing.length >= limits.max) {
    return NextResponse.json(
      {
        message: `Лимит личной галереи: ${limits.max} фото (база ${limits.base}${
          limits.bonus ? ` + ${limits.bonus} за соцрейтинг` : ''
        })`,
        url,
      },
      { status: 400 }
    );
  }

  const auto = await shouldAutoApproveImages(session.user.id);
  const status = galleryStatusForNew(auto);
  const next = [
    ...existing,
    {
      url,
      status,
      createdAt: new Date().toISOString(),
    },
  ];
  await prisma.user.update({
    where: { id: session.user.id },
    data: { personalGalleryJson: serializeGalleryItems(next, limits.max) },
  });
  await queueImageModeration({
    userId: session.user.id,
    url,
    sourceType: IMAGE_SOURCE.GALLERY,
    autoApproved: auto,
  });
  // Social/eco only after approval (or immediately if auto)
  if (auto) {
    await bumpSocialScore(session.user.id, SOCIAL.GALLERY_PHOTO_DELTA, 'Фото в личной галерее');
    await bumpEcoPoints(session.user.id, ECO.GALLERY_PHOTO, 'gallery_photo');
  }
  await unlockAchievement(session.user.id, 'GALLERY_SHOT');
  if (next.filter((i) => !i.status || i.status === 'APPROVED').length >= 5) {
    await unlockAchievement(session.user.id, 'GALLERY_PRO');
  }
  return NextResponse.json({
    url,
    items: next,
    max: limits.max,
    bonusSlots: limits.bonus,
    moderationStatus: status,
    message: auto
      ? undefined
      : 'Фото отправлено на модерацию. На публичном профиле появится после проверки.',
  });
}
