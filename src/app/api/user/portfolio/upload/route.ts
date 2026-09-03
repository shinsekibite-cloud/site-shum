import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { saveUploadedDocument, saveUploadedImage } from '@/lib/uploads';
import { uploadRateLimiter, rateLimitJson } from '@/lib/rateLimit';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!(await uploadRateLimiter.checkAsync(
    `up:pf:${session.user.id}`,
    await (async () => {
      const { userLimitMultiplier, boostedMax } = await import('@/lib/activity-limits');
      return boostedMax(20, await userLimitMultiplier(session.user.id));
    })()
  ))) {
    return NextResponse.json(rateLimitJson('Слишком много загрузок. Подождите минуту.'), {
      status: 429,
    });
  }

  try {
    const form = await req.formData();
    const kind = String(form.get('kind') || 'certificate');
    const file = form.get('file');
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ message: 'Файл обязателен' }, { status: 400 });
    }

    if (kind === 'cover') {
      const url = await saveUploadedImage(file, 'portfolio', { preset: 'cover' });
      return NextResponse.json({ url });
    }

    const saved = await saveUploadedDocument(file, 'portfolio-certs');
    if (!saved) {
      return NextResponse.json({ message: 'Не удалось сохранить файл' }, { status: 400 });
    }
    return NextResponse.json({
      url: saved.url,
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Ошибка загрузки' },
      { status: 400 }
    );
  }
}
