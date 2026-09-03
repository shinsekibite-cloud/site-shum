import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { canUploadContent } from '@/lib/acl';
import { saveUploadedImage } from '@/lib/uploads';
import { uploadRateLimiter, rateLimitJson } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!session || !canUploadContent(role, session.user?.permissions)) {
      return NextResponse.json({ message: 'Доступ запрещен' }, { status: 403 });
    }

    const userKey = session.user?.id || 'anon';
    const { userLimitMultiplier, boostedMax } = await import('@/lib/activity-limits');
    const upMax = session.user?.id
      ? boostedMax(20, await userLimitMultiplier(session.user.id))
      : 20;
    if (!(await uploadRateLimiter.checkAsync(`up:${userKey}`, upMax))) {
      return NextResponse.json(rateLimitJson('Слишком много загрузок. Подождите минуту.'), {
        status: 429,
      });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ message: 'Файл не найден' }, { status: 400 });
    }

    const url = await saveUploadedImage(file, 'editor', { preset: 'editor' });
    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера';
    const status = /большой|формат|содержим|HEIC|обработ/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}
