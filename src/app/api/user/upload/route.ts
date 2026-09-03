import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { saveUploadedImage } from '@/lib/uploads';
import { uploadRateLimiter, rateLimitJson } from '@/lib/rateLimit';
import {
  IMAGE_SOURCE,
  queueImageModeration,
  shouldAutoApproveImages,
} from '@/lib/image-moderation';
import { assertSameOrigin } from '@/lib/csrf-origin';

export async function POST(req: Request) {
  try {
    const originBlock = assertSameOrigin(req);
    if (originBlock) return originBlock;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Доступ запрещен' }, { status: 403 });
    }

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

    const url = await saveUploadedImage(file, 'avatars', { preset: 'avatar' });
    const auto = await shouldAutoApproveImages(session.user.id);
    await queueImageModeration({
      userId: session.user.id,
      url,
      sourceType: IMAGE_SOURCE.AVATAR,
      autoApproved: auto,
    });
    return NextResponse.json({
      url,
      moderationStatus: auto ? 'APPROVED' : 'PENDING',
      message: auto
        ? undefined
        : 'Аватар сохранён и отправлен на проверку модераторам.',
    }, { status: 200 });
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера';
    const status = /большой|формат|содержим|HEIC|обработ/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}
