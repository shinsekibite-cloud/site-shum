import { prisma } from '@/lib/prisma';
import {
  extractMessengerLinkToken,
  consumeMessengerLinkToken,
  type MessengerChannel,
} from '@/lib/messenger-link';
import { createUserNotification } from '@/lib/security';
import { bindMaxUserIdToAccount } from '@/lib/messenger-bind-max';

export async function tryBindMessengerFromStart(opts: {
  text: string | null | undefined;
  channel: MessengerChannel;
  externalId: string | number | null | undefined;
}): Promise<{ bound: boolean; message?: string; userId?: string }> {
  const token = extractMessengerLinkToken(opts.text);
  if (!token) return { bound: false };
  if (opts.externalId == null || opts.externalId === '') {
    return { bound: false, message: 'Нет ID чата' };
  }
  const verified = await consumeMessengerLinkToken(token);
  if (!verified.ok) {
    return {
      bound: false,
      message:
        verified.reason === 'expired'
          ? 'Ссылка устарела — откройте новую в настройках профиля'
          : verified.reason === 'used'
            ? 'Ссылка уже использована — откройте новую в настройках профиля'
            : 'Некорректная ссылка привязки',
    };
  }
  if (verified.channel !== opts.channel) {
    return { bound: false, message: 'Ссылка для другого мессенджера' };
  }

  const externalId = String(opts.externalId).replace(/[^\d]/g, '');
  if (!externalId) return { bound: false, message: 'Некорректный ID' };

  const user = await prisma.user.findFirst({
    where: { id: verified.userId, deletedAt: null, blockedAt: null },
    select: { id: true, name: true },
  });
  if (!user) return { bound: false, message: 'Пользователь не найден' };

  if (opts.channel === 'tg') {
    await prisma.user.updateMany({
      where: { telegramChatId: externalId, NOT: { id: user.id } },
      data: { telegramChatId: null, telegramLinkedAt: null },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: externalId, telegramLinkedAt: new Date() },
    });
    await createUserNotification({
      userId: user.id,
      type: 'SYSTEM',
      title: 'Telegram привязан',
      body: 'Бот Telegram успешно связан с аккаунтом.',
      meta: { channel: opts.channel, href: '/dashboard/settings' },
    });
  } else {
    const bound = await bindMaxUserIdToAccount({ userId: user.id, maxUserId: externalId });
    if (!bound.ok) return { bound: false, message: bound.message };
  }

  return {
    bound: true,
    userId: user.id,
    message:
      opts.channel === 'tg'
        ? '✅ Telegram привязан к аккаунту на сайте. Можно закрыть чат.'
        : '✅ MAX привязан к аккаунту на сайте. Можно закрыть чат.',
  };
}
