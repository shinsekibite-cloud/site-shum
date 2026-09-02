import { NextResponse } from 'next/server';
import { tgGetMe } from '@/lib/telegram';
import { maxGetMe } from '@/lib/max';

export const dynamic = 'force-dynamic';

/** Public bot deep-links for profile linking (no secrets). */
export async function GET() {
  let telegramBotUsername: string | null = null;
  let maxBotLink: string | null = null;
  let maxBotUsername: string | null = null;

  try {
    const tg = await tgGetMe();
    const me = tg.result as { username?: string } | null;
    if (me?.username) telegramBotUsername = String(me.username).replace(/^@/, '');
  } catch {
    /* ignore */
  }

  try {
    const max = await maxGetMe();
    const me = (max.json && typeof max.json === 'object' ? max.json : null) as {
      username?: string;
      name?: string;
      link?: string;
    } | null;
    if (me?.username) {
      maxBotUsername = String(me.username).replace(/^@/, '');
      maxBotLink = `https://max.ru/${maxBotUsername}`;
    } else if (me?.link && typeof me.link === 'string') {
      maxBotLink = me.link;
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    telegramBotUsername,
    maxBotUsername,
    maxBotLink,
  });
}
