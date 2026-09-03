import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notificationHub } from '@/lib/notification-hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** SSE stream of new in-app notifications for the current user. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };

      send('ready', { ok: true, at: new Date().toISOString() });

      const onNotif = (payload: unknown) => send('notification', payload);
      cleanup = notificationHub.subscribe(userId, onNotif);

      heartbeat = setInterval(() => {
        send('ping', { t: Date.now() });
      }, 25000);

      // Initial unread snapshot
      void prisma.userNotification
        .count({ where: { userId, readAt: null } })
        .then((unread) => send('unread', { unread }))
        .catch(() => null);

      const abort = () => {
        if (heartbeat) clearInterval(heartbeat);
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      req.signal.addEventListener('abort', abort);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      cleanup?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
