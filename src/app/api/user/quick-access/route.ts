import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { unlockAchievement } from '@/lib/award-achievements';
import { evaluateAchievements } from '@/lib/award-achievements';

/** Complete / skip quick-access tutorial; complete unlocks MODERN_USER. */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Нужна авторизация' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'skip' ? 'skip' : body?.action === 'complete' ? 'complete' : null;
    if (!action) {
      return NextResponse.json({ message: 'Укажите action: complete | skip' }, { status: 400 });
    }

    if (action === 'skip') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const unlocked = await unlockAchievement(session.user.id, 'MODERN_USER');
    await evaluateAchievements(session.user.id).catch(() => null);

    return NextResponse.json({
      ok: true,
      unlocked: unlocked ? 'MODERN_USER' : null,
      alreadyHad: !unlocked,
    });
  } catch (e) {
    console.error('quick-access tutorial', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
