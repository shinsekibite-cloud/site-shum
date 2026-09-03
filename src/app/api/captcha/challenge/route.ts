import { NextResponse } from 'next/server';
import { createCaptchaChallenge, solveCaptcha } from '@/lib/captcha';
import { registerRateLimiter, rateLimitJson } from '@/lib/rateLimit';

/** Issue a fresh math challenge */
export async function GET(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  if (!(await registerRateLimiter.checkAsync(`cap:${ip}`))) {
    return NextResponse.json(rateLimitJson('Слишком много запросов'), { status: 429 });
  }
  const challenge = await createCaptchaChallenge();
  return NextResponse.json(challenge);
}

/** Solve challenge → one-time token */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await solveCaptcha({
      challengeId: body.challengeId,
      answer: body.answer,
      selected: body.selected,
      website: body.website,
    });
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({ token: result.token });
  } catch (e) {
    console.error('captcha solve', e);
    return NextResponse.json({ message: 'Ошибка проверки' }, { status: 500 });
  }
}
