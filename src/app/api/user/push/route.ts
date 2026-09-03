import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  getVapidPublicKey,
  removePushSubscription,
  savePushSubscription,
  sendPushToUser,
} from '@/lib/web-push';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const [publicKey, count] = await Promise.all([
      getVapidPublicKey(),
      prisma.pushSubscription.count({ where: { userId: session.user.id } }),
    ]);

    return NextResponse.json({
      publicKey,
      subscribed: count > 0,
      deviceCount: count,
    });
  } catch (e) {
    console.error('GET /api/user/push', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(10).max(512),
    auth: z.string().min(8).max(256),
  }),
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.action === 'test') {
      await sendPushToUser(session.user.id, {
        title: 'Пуш включён',
        body: 'Уведомления будут приходить в браузер, даже когда вкладка закрыта.',
        url: '/dashboard',
        type: 'SYSTEM',
        tag: 'yp-push-test',
      });
      return NextResponse.json({ ok: true, tested: true });
    }

    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Некорректная подписка' }, { status: 400 });
    }

    await savePushSubscription({
      userId: session.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true, subscribed: true });
  } catch (e) {
    console.error('POST /api/user/push', e);
    return NextResponse.json({ message: 'Не удалось сохранить подписку' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const all = Boolean(body?.all);
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : undefined;

    await removePushSubscription({
      userId: session.user.id,
      endpoint,
      all: all || !endpoint,
    });

    return NextResponse.json({ ok: true, subscribed: false });
  } catch (e) {
    console.error('DELETE /api/user/push', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}
