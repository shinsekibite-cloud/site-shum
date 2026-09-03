import { createHash, timingSafeEqual } from 'crypto';
import { getBotsConfig } from '@/lib/bots-config';
import { NextRequest, NextResponse } from 'next/server';
import {
  maxSendMessage,
  maxGetConfig,
  maxCallbackKeyboard,
  maxLinkKeyboard,
  maxLinksKeyboard,
} from '@/lib/max';
import { getSiteIdentity } from '@/lib/site-identity';
import { isModuleEnabled } from '@/lib/module-flags';
import { buildMaxClaimPath } from '@/lib/messenger-link';
import { formatMskDateTime, formatMskTimeRange } from '@/lib/booking-hours';
import {
  maxWebhookGlobalRateLimiter,
  maxWebhookUserRateLimiter,
} from '@/lib/rateLimit';
import {
  applyMaxDecision,
  formatApplicationCard,
  formatBookingCard,
  isStaffRole,
  listPendingApplicationsForMax,
  listPendingBookingsForMax,
  listUpcomingEventsForMax,
  listUserTicketsForMax,
  resolveLinkedMaxUser,
  resolveMaxActor,
} from '@/lib/max-moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 96_000;
const MAX_QUEUE = 5;
const MAX_TICKETS = 8;

/**
 * Parse `/command` or `/command@BotName` (+ optional args).
 * Do NOT use JS `\b` — it is ASCII-only and breaks Cyrillic (`/афиша`, `/заявки`).
 */
function parseSlashCommand(text: string): { cmd: string; rest: string } | null {
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return null;
  const m = t.match(/^\/([^\s@]+)(?:@[^\s]+)?(?:\s+(.*))?$/u);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), rest: (m[2] || '').trim() };
}

function isCmd(text: string, ...names: string[]): boolean {
  const p = parseSlashCommand(text);
  if (!p) return false;
  const set = new Set(names.map((n) => n.toLowerCase()));
  return set.has(p.cmd);
}

function isStartCommand(text: string) {
  const t = text.trim().toLowerCase();
  return t === 'start' || t === 'старт' || isCmd(text, 'start', 'старт');
}

function secretsEqual(a: string, b: string): boolean {
  try {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

async function bindKeyboard(publicOrigin: string, maxUserId: string | number | null | undefined) {
  let callbackPath = '/dashboard/settings?section=messengers';
  try {
    if (maxUserId != null && maxUserId !== '') {
      callbackPath = await buildMaxClaimPath(String(maxUserId));
    }
  } catch {
    /* keep settings fallback */
  }
  const bindAbs = `${publicOrigin}${callbackPath}`;
  return maxLinksKeyboard([
    [
      { text: '⚡ Привязать аккаунт', url: bindAbs },
      {
        text: 'Войти на сайт',
        url: `${publicOrigin}/login?callbackUrl=${encodeURIComponent(callbackPath)}`,
      },
    ],
  ]);
}

async function sendUnlinkedHelp(
  reply: (t: string, attachments?: unknown[]) => Promise<unknown>,
  publicOrigin: string,
  siteName: string,
  senderId: string | number | null,
  extra?: string
) {
  const botsCfg = await getBotsConfig();
  const custom = (botsCfg.max.welcomeText || '').trim();
  const base =
    custom ||
    `👋 ${siteName}\n\nВаш MAX ID: ${senderId ?? '—'}\n\n` +
      `Привяжите аккаунт одной кнопкой ниже — откроется сайт (вход, если нужно), ID сохранится сам.\n` +
      `После привязки: /афиша и /билеты.`;
  const text = extra ? `${base}\n\n${extra}` : `${base}\n\nКоманды: /help`;
  await reply(text, await bindKeyboard(publicOrigin, senderId));
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'max-webhook' });
}

export async function POST(req: NextRequest) {
  if (!(await isModuleEnabled('bots'))) {
    return NextResponse.json({ ok: false, reason: 'module_disabled' }, { status: 503 });
  }

  const c = await maxGetConfig();
  if (!c.token || !c.enabled) {
    // 200 — do not drop MAX subscription on temporary disable
    return NextResponse.json({ ok: false, reason: 'disabled' });
  }

  const configured = String(c.secret || '').trim();
  if (!configured) {
    return NextResponse.json({ ok: false, reason: 'secret_required' }, { status: 401 });
  }
  const secret = req.headers.get('x-max-bot-api-secret') || '';
  if (!secretsEqual(secret, configured)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, reason: 'payload_too_large' }, { status: 413 });
  }

  let update: Record<string, any> = {};
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, reason: 'payload_too_large' }, { status: 413 });
    }
    update = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ ok: true });
  }

  const updateType = String(update.update_type || update.type || '');
  const msg = update.message || update.message_created?.message || null;
  const cb = update.callback || update.message_callback?.callback || null;

  const senderId =
    msg?.sender?.user_id ??
    update.user_id ??
    update.user?.user_id ??
    cb?.user?.user_id ??
    cb?.from?.user_id ??
    null;

  const chatId =
    msg?.recipient?.chat_id ??
    update.chat_id ??
    cb?.message?.recipient?.chat_id ??
    null;

  const text: string = (msg?.body?.text || msg?.text || '').toString().trim();
  const payload: string = (cb?.payload || '').toString().slice(0, 256);

  // Always 200 on rate limit so MAX does not drop the subscription.
  if (!(await maxWebhookGlobalRateLimiter.checkAsync('all'))) {
    return NextResponse.json({ ok: true, reason: 'rate_limited' });
  }
  const rlKey = senderId != null ? String(senderId) : 'anon';
  if (!(await maxWebhookUserRateLimiter.checkAsync(rlKey))) {
    return NextResponse.json({ ok: true, reason: 'rate_limited' });
  }

  const reply = async (t: string, attachments?: unknown[]) => {
    if (senderId == null && chatId == null) return { ok: false };
    return maxSendMessage(
      { userId: senderId, chatId },
      t,
      { token: c.token, attachments }
    );
  };

  const { publicOrigin, siteName } = await getSiteIdentity();
  const linked = await resolveLinkedMaxUser(senderId);

  const handleStart = async (startPayload: string) => {
    const { tryBindMessengerFromStart } = await import('@/lib/messenger-bind');
    const bound = await tryBindMessengerFromStart({
      text: startPayload,
      channel: 'max',
      externalId: senderId,
    });
    if (bound.bound) {
      const after = await resolveLinkedMaxUser(senderId);
      const staffBits =
        after && isStaffRole(after.role)
          ? '\nСотрудникам: /заявки · /брони · /модерация'
          : '';
      await reply(
        (bound.message || '✅ MAX привязан') +
          '\n\nДоступно: /афиша · /билеты' +
          staffBits,
        maxLinkKeyboard('Открыть кабинет', `${publicOrigin}/dashboard`)
      );
      return;
    }
    if (bound.message) {
      await reply(bound.message, await bindKeyboard(publicOrigin, senderId));
      return;
    }

    const user = await resolveLinkedMaxUser(senderId);
    if (user) {
      const staffBits = isStaffRole(user.role)
        ? '\nМодерация: /заявки · /брони · /модерация'
        : '';
      await reply(
        `👋 ${siteName}\n\nПривязан аккаунт: ${user.name || user.email || 'вы'}\n` +
          `Ваш MAX ID: ${senderId}\n\n` +
          `Команды: /афиша · /билеты · /help${staffBits}`,
        maxLinkKeyboard('Кабинет', `${publicOrigin}/dashboard`)
      );
      return;
    }

    await sendUnlinkedHelp(reply, publicOrigin, siteName, senderId);
  };

  // bot_started — user opened the bot / pressed Start
  if (updateType === 'bot_started' || (!text && !payload && senderId != null && update.user)) {
    const startPayload =
      String(update.payload || update.start_payload || update.user?.payload || '').trim() || text;
    await handleStart(startPayload || text);
    return NextResponse.json({ ok: true });
  }

  if (isStartCommand(text)) {
    await handleStart(text);
    return NextResponse.json({ ok: true });
  }

  if (isCmd(text, 'help', 'помощь')) {
    const staffHelp =
      linked && isStaffRole(linked.role)
        ? '\n\nСотрудникам:\n/заявки — очередь заявок\n/брони — очередь броней\n/модерация — обе очереди'
        : '';
    await reply(
      `Команды MAX-бота «${siteName}»:\n` +
        `/start — статус / привязка\n` +
        `/афиша — ближайшие события\n` +
        `/билеты — ваши билеты (нужна привязка)\n` +
        `/id — ваш MAX ID\n` +
        `/status — проверка связи` +
        staffHelp +
        `\n\nБез привязки: нажмите «Привязать аккаунт» в /start.`
    );
    return NextResponse.json({ ok: true });
  }

  if (isCmd(text, 'status', 'статус')) {
    await reply(`${siteName} работает ✅\nMAX-бот на связи.`);
    return NextResponse.json({ ok: true });
  }

  if (isCmd(text, 'id')) {
    const status = linked
      ? `Привязан к: ${linked.name || linked.email || linked.id}`
      : 'Не привязан к аккаунту сайта';
    await reply(
      `Ваш MAX ID: ${senderId || '—'}\n${status}`,
      linked ? undefined : await bindKeyboard(publicOrigin, senderId)
    );
    return NextResponse.json({ ok: true });
  }

  // —— End-user: afisha ——
  if (isCmd(text, 'events', 'афиша', 'afisha')) {
    if (!(await isModuleEnabled('events'))) {
      await reply('Афиша временно отключена.');
      return NextResponse.json({ ok: true });
    }
    const events = await listUpcomingEventsForMax(MAX_QUEUE);
    if (!events.length) {
      await reply(
        'Ближайших событий пока нет.',
        maxLinkKeyboard('Открыть афишу', `${publicOrigin}/events`)
      );
      return NextResponse.json({ ok: true });
    }
    const lines = events.map((e: (typeof events)[number], i: number) => {
      const when = formatMskDateTime(e.startTime);
      return `${i + 1}. ${e.title}\n   📆 ${when}\n   🏠 ${e.space?.title || '—'}${e.space?.address ? ` · ${e.space.address}` : ''}\n   👥 ${e._count.participants}`;
    });
    await reply(
      `🗓 Ближайшие события:\n\n${lines.join('\n\n')}`,
      maxLinkKeyboard('Вся афиша', `${publicOrigin}/events`)
    );
    return NextResponse.json({ ok: true });
  }

  // —— End-user: tickets ——
  if (isCmd(text, 'tickets', 'билеты', 'ticket')) {
    if (!(await isModuleEnabled('events'))) {
      await reply('Билеты временно недоступны.');
      return NextResponse.json({ ok: true });
    }
    if (!linked) {
      await sendUnlinkedHelp(
        reply,
        publicOrigin,
        siteName,
        senderId,
        'Чтобы видеть билеты, привяжите MAX к аккаунту на сайте.'
      );
      return NextResponse.json({ ok: true });
    }
    const tickets = await listUserTicketsForMax(linked.id, MAX_TICKETS);
    if (!tickets.length) {
      await reply(
        'Активных билетов нет. Запишитесь на событие в афише.',
        maxLinksKeyboard([
          [
            { text: 'Афиша', url: `${publicOrigin}/events` },
            { text: 'Мои билеты', url: `${publicOrigin}/tickets` },
          ],
        ])
      );
      return NextResponse.json({ ok: true });
    }
    for (const t of tickets) {
      const when = `${formatMskDateTime(t.booking.startTime)} · ${formatMskTimeRange(
        t.booking.startTime,
        t.booking.endTime
      )}`;
      await maxSendMessage(
        { userId: senderId, chatId },
        `🎟 ${t.booking.title}\n📆 ${when}\n🏠 ${t.booking.space?.title || '—'}\nКод: ${t.ticketCode}`,
        {
          token: c.token,
          attachments: maxLinkKeyboard('Открыть билет', `${publicOrigin}/tickets`),
        }
      );
    }
    return NextResponse.json({ ok: true });
  }

  // —— Staff moderation ——
  const sendAppsQueue = async () => {
    const actor = await resolveMaxActor(senderId, 'applications');
    if (!actor) {
      if (linked && !isStaffRole(linked.role)) {
        await reply('Команда для сотрудников. Ваши билеты: /билеты · афиша: /афиша');
      } else if (!linked) {
        await sendUnlinkedHelp(
          reply,
          publicOrigin,
          siteName,
          senderId,
          'Для модерации привяжите MAX к аккаунту ADMIN/модератора.'
        );
      } else {
        await reply(
          'Недостаточно прав на заявки. Нужна роль ADMIN или модератор с правом «Заявки».'
        );
      }
      return;
    }
    const apps = await listPendingApplicationsForMax(MAX_QUEUE);
    if (!apps.length) {
      await reply('Заявок на модерацию нет.');
      return;
    }
    for (const a of apps) {
      const sent = await maxSendMessage(
        { userId: senderId, chatId },
        formatApplicationCard(a),
        {
          token: c.token,
          attachments: [
            ...maxCallbackKeyboard([
              [
                { text: '✅ Одобрить', payload: `app_ok_${a.id}` },
                { text: '✕ Отклонить', payload: `app_no_${a.id}` },
              ],
            ]),
            ...maxLinkKeyboard(
              'В админке',
              `${publicOrigin}/admin/applications?status=PENDING&focus=${a.id}`
            ),
          ],
        }
      );
      if (sent.ok && sent.messageId && senderId != null) {
        const { rememberModerationCard } = await import('@/lib/moderation-cards');
        await rememberModerationCard('app', a.id, {
          channel: 'MAX',
          chatId: String(senderId),
          messageId: String(sent.messageId),
        }).catch(() => null);
      }
    }
  };

  const sendBooksQueue = async () => {
    const actor = await resolveMaxActor(senderId, 'bookings');
    if (!actor) {
      if (linked && !isStaffRole(linked.role)) {
        await reply('Команда для сотрудников (согласование броней). Ваши билеты: /билеты');
      } else if (!linked) {
        await sendUnlinkedHelp(
          reply,
          publicOrigin,
          siteName,
          senderId,
          'Для модерации броней привяжите MAX к аккаунту ADMIN/модератора.'
        );
      } else {
        await reply(
          'Недостаточно прав на брони. Нужна роль ADMIN или модератор с правом «Афиша» (bookings).'
        );
      }
      return;
    }
    const books = await listPendingBookingsForMax(MAX_QUEUE);
    if (!books.length) {
      await reply('Броней на модерацию нет.');
      return;
    }
    for (const b of books) {
      const sent = await maxSendMessage(
        { userId: senderId, chatId },
        formatBookingCard(b),
        {
          token: c.token,
          attachments: [
            ...maxCallbackKeyboard([
              [
                { text: '✅ Одобрить', payload: `book_ok_${b.id}` },
                { text: '✕ Отклонить', payload: `book_no_${b.id}` },
              ],
            ]),
            ...maxLinkKeyboard(
              'В админке',
              `${publicOrigin}/admin/bookings?status=PENDING&view=${b.id}`
            ),
          ],
        }
      );
      if (sent.ok && sent.messageId && senderId != null) {
        const { rememberModerationCard } = await import('@/lib/moderation-cards');
        await rememberModerationCard('book', b.id, {
          channel: 'MAX',
          chatId: String(senderId),
          messageId: String(sent.messageId),
        }).catch(() => null);
      }
    }
  };

  if (isCmd(text, 'applications', 'заявки')) {
    await sendAppsQueue();
    return NextResponse.json({ ok: true });
  }

  if (isCmd(text, 'bookings', 'брони')) {
    await sendBooksQueue();
    return NextResponse.json({ ok: true });
  }

  if (isCmd(text, 'moderation', 'модерация', 'pending', 'очередь')) {
    const canApps = !!(await resolveMaxActor(senderId, 'applications'));
    const canBooks = !!(await resolveMaxActor(senderId, 'bookings'));
    if (!canApps && !canBooks) {
      if (!linked) {
        await sendUnlinkedHelp(
          reply,
          publicOrigin,
          siteName,
          senderId,
          'Модерация доступна сотрудникам после привязки MAX.'
        );
      } else {
        await reply('Нет прав на модерацию. Обратитесь к ADMIN для выдачи прав.');
      }
      return NextResponse.json({ ok: true });
    }
    if (canApps) await sendAppsQueue();
    if (canBooks) await sendBooksQueue();
    return NextResponse.json({ ok: true });
  }

  // Callback / command: (app|book)_(ok|no)_<id>
  const cmd = payload || text;
  const linkAdmin = cmd.match(/^link_admin_app_([A-Za-z0-9_-]{1,64})$/);
  if (linkAdmin) {
    await reply(`Админка: ${publicOrigin}/admin/applications?status=PENDING&focus=${linkAdmin[1]}`);
    return NextResponse.json({ ok: true });
  }

  const m = cmd.match(/^\/?(app|book)_(ok|no)_([A-Za-z0-9_-]{1,64})$/);
  if (m) {
    const callbackMessageId =
      cb?.message?.body?.mid ||
      cb?.message?.mid ||
      cb?.message?.message_id ||
      update.message_callback?.message?.body?.mid ||
      null;
    const result = await applyMaxDecision({
      kind: m[1] as 'app' | 'book',
      id: m[3],
      approve: m[2] === 'ok',
      actorMaxUserId: senderId,
      messageId: callbackMessageId ? String(callbackMessageId) : null,
      chatId: chatId ?? senderId,
    });
    await reply(result.message);
    return NextResponse.json({ ok: true });
  }

  // Soft hint for unknown slash commands
  if (text && text.startsWith('/')) {
    await reply('Неизвестная команда. Напишите /help');
  }

  return NextResponse.json({ ok: true });
}
