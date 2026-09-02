import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {
  issueMessengerLinkToken,
  MESSENGER_LINK_TTL_SEC,
  type MessengerChannel,
} from '@/lib/messenger-link';
import { tgGetMe } from '@/lib/telegram';
import { maxGetMe } from '@/lib/max';

export const dynamic = 'force-dynamic';

/** Deep-link tokens + bot URLs for one-tap messenger binding. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const channelParam = new URL(req.url).searchParams.get('channel');
  const channels: MessengerChannel[] =
    channelParam === 'tg' || channelParam === 'max'
      ? [channelParam]
      : ['tg', 'max'];

  let telegramBotUsername: string | null = null;
  let maxBotUsername: string | null = null;
  let maxBotLink: string | null = null;

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
      link?: string;
    } | null;
    if (me?.username) {
      maxBotUsername = String(me.username).replace(/^@/, '');
      maxBotLink = `https://max.ru/${maxBotUsername}`;
    } else if (me?.link) {
      maxBotLink = me.link;
    }
  } catch {
    /* ignore */
  }

  const links: Record<
    string,
    { token: string; deepLink: string | null; startPayload: string }
  > = {};

  for (const ch of channels) {
    const token = await issueMessengerLinkToken(session.user.id, ch);
    const startPayload = token;
    let deepLink: string | null = null;
    if (ch === 'tg' && telegramBotUsername) {
      deepLink = `https://t.me/${telegramBotUsername}?start=${encodeURIComponent(token)}`;
    }
    if (ch === 'max' && maxBotLink) {
      deepLink = `${maxBotLink}${maxBotLink.includes('?') ? '&' : '?'}start=${encodeURIComponent(token)}`;
    }
    links[ch] = { token, deepLink, startPayload };
  }

  return NextResponse.json({
    links,
    telegramBotUsername,
    maxBotUsername,
    maxBotLink,
    ttlSec: MESSENGER_LINK_TTL_SEC,
    oneTime: true,
  });
}
