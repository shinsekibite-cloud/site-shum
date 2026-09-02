import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NOTIFICATION_TYPE_OPTIONS } from '@/lib/notification-meta';
import {
  DEFAULT_NOTIFICATION_PREFS,
  parseNotificationPrefs,
  serializeNotificationPrefs,
} from '@/lib/notification-prefs';

const typeEnum = z.enum(
  NOTIFICATION_TYPE_OPTIONS.map((o) => o.id) as [string, ...string[]]
);

const bodySchema = z.object({
  muted: z.array(typeEnum).max(32).optional(),
  emailDigest: z.boolean().optional(),
  sound: z.boolean().optional(),
  push: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPrefsJson: true },
  });
  const prefs = parseNotificationPrefs(user?.notificationPrefsJson);
  return NextResponse.json({ prefs, defaults: DEFAULT_NOTIFICATION_PREFS });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Некорректные данные' }, { status: 400 });
  }
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationPrefsJson: true },
  });
  const prefs = parseNotificationPrefs(current?.notificationPrefsJson);
  if (parsed.data.muted !== undefined) prefs.muted = parsed.data.muted as typeof prefs.muted;
  if (parsed.data.emailDigest !== undefined) prefs.emailDigest = parsed.data.emailDigest;
  if (parsed.data.sound !== undefined) prefs.sound = parsed.data.sound;
  if (parsed.data.push !== undefined) prefs.push = parsed.data.push;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { notificationPrefsJson: serializeNotificationPrefs(prefs) },
  });
  return NextResponse.json({ ok: true, prefs });
}
