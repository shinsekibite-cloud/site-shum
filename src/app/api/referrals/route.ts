import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getReferralDashboard, getReferralLite, ensureReferralCode } from '@/lib/referrals';
import { rejectIfModuleDisabled } from '@/lib/require-module';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const blocked = await rejectIfModuleDisabled('referrals');
    if (blocked) return blocked;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Необходимо авторизоваться' }, { status: 401 });
    }
    const lite = new URL(req.url).searchParams.get('lite') === '1';
    await ensureReferralCode(session.user.id);
    const data = lite
      ? await getReferralLite(session.user.id)
      : await getReferralDashboard(session.user.id);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': lite ? 'private, max-age=60' : 'private, max-age=15' },
    });
  } catch (e) {
    console.error('GET /api/referrals', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
