import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { touchUserPresence } from '@/lib/presence';
import { presenceRateLimiter, rateLimitJson } from '@/lib/rateLimit';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!(await presenceRateLimiter.checkAsync(`presence:${session.user.id}`))) {
    return NextResponse.json(rateLimitJson('Слишком много запросов.'), { status: 429 });
  }

  await touchUserPresence(session.user.id);
  return NextResponse.json({ ok: true });
}
