/**
 * Staff alerts & moderation helpers for MAX (mirrors telegram-moderation).
 */
import { prisma } from '@/lib/prisma';
import { hasPermission, isTechRole } from '@/lib/acl-shared';
import { getSiteIdentity } from '@/lib/site-identity';
import {
  maxGetConfig,
  maxSendMessage,
  maxCallbackKeyboard,
  maxLinkKeyboard,
} from '@/lib/max';
import { resolveBotDelivery } from '@/lib/bots-config';
import { formatMskDateTime, formatMskTimeRange } from '@/lib/booking-hours';
import { notifyApplicationStatus, notifyBookingStatus } from '@/lib/notifications';
import { promoteToParticipant } from '@/lib/participant';
import { buildTicketCode } from '@/lib/tickets';
import { applicationStatusRu, bookingStatusRu } from '@/lib/status-labels-ru';

export type MaxLinkedUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: string | null;
  maxUserId: string | null;
};

export function canModerate(
  u: Pick<MaxLinkedUser, 'role' | 'permissions'>,
  kind: 'applications' | 'bookings'
) {
  if (u.role === 'ADMIN' || isTechRole(u.role)) return true;
  return hasPermission(u.role, u.permissions, kind);
}

export function isStaffRole(role: string | null | undefined) {
  return role === 'ADMIN' || role === 'MODERATOR' || role === 'TECH';
}

async function moderationEnabled(): Promise<boolean> {
  const c = await maxGetConfig();
  return !!(c.token && c.enabled);
}

export async function resolveLinkedMaxUser(
  maxUserId?: string | number | null
): Promise<MaxLinkedUser | null> {
  if (maxUserId === undefined || maxUserId === null || maxUserId === '') return null;
  const id = String(maxUserId).replace(/[^\d]/g, '');
  if (!id) return null;
  return prisma.user.findFirst({
    where: { maxUserId: id, blockedAt: null, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      maxUserId: true,
    },
  });
}

/** Alert user ids from settings + staff with linked maxUserId. */
export async function getStaffMaxRecipients(
  resource: 'applications' | 'bookings'
): Promise<string[]> {
  if (!(await moderationEnabled())) return [];
  const c = await maxGetConfig();

  const staff = await prisma.user.findMany({
    where: {
      maxUserId: { not: null },
      blockedAt: null,
      deletedAt: null,
      OR: [{ role: 'ADMIN' }, { role: 'MODERATOR' }, { role: 'TECH' }],
    },
    select: {
      role: true,
      permissions: true,
      maxUserId: true,
    },
    take: 100,
  });

  const fromStaff = staff
    .filter((u: { maxUserId: string | null; role: string; permissions: string | null }) => u.maxUserId && canModerate(u, resource))
    .map((u: { maxUserId: string | null }) => String(u.maxUserId));

  return Array.from(new Set([...c.ids, ...fromStaff]));
}

/** Actor for moderation: linked staff with permission, or alert-list id → first ADMIN. */
export async function resolveMaxActor(
  maxUserId: string | number | null | undefined,
  resource: 'applications' | 'bookings'
): Promise<MaxLinkedUser | null> {
  const linked = await resolveLinkedMaxUser(maxUserId);
  if (linked && isStaffRole(linked.role) && canModerate(linked, resource)) {
    return linked;
  }

  const recipients = await getStaffMaxRecipients(resource);
  const id = maxUserId == null ? '' : String(maxUserId).replace(/[^\d]/g, '');
  if (!id || !recipients.includes(id)) return null;

  return prisma.user.findFirst({
    where: { role: 'ADMIN', blockedAt: null, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      maxUserId: true,
    },
  });
}

function appTargetTitle(app: {
  project?: { title: string } | null;
  club?: { title: string } | null;
  program?: { title: string } | null;
}) {
  return app.project?.title || app.club?.title || app.program?.title || 'Без цели';
}

export async function notifyStaffMaxNewApplication(applicationId: string): Promise<void> {
  try {
    const delivery = await resolveBotDelivery('max', 'applications');
    if (!delivery.allowed) return;
    const recipients = await getStaffMaxRecipients('applications');
    if (!recipients.length) return;

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        project: { select: { title: true } },
        club: { select: { title: true } },
        program: { select: { title: true } },
      },
    });
    if (!app || app.status !== 'PENDING') return;

    const { publicOrigin } = await getSiteIdentity();
    const kind = app.project ? 'Проект' : app.club ? 'Клуб' : app.program ? 'Программа' : 'Заявка';
    const text =
      `📥 Новая заявка · ${kind}\n` +
      `${appTargetTitle(app)}\n` +
      `👤 ${app.user?.name || '—'}${app.user?.phone ? ` · ${app.user.phone}` : ''}\n` +
      `${(app.message || '').slice(0, 280) || 'без сообщения'}\n` +
      `⏱ ${formatMskDateTime(app.createdAt)}`;

    const attachments = [
      ...maxCallbackKeyboard([
        [
          { text: '✅ Одобрить', payload: `app_ok_${app.id}` },
          { text: '✕ Отклонить', payload: `app_no_${app.id}` },
        ],
      ]),
      ...maxLinkKeyboard(
        'Открыть в админке',
        `${publicOrigin}/admin/applications?status=PENDING&focus=${app.id}`
      ),
    ];

    for (const userId of recipients) {
      const sent = await maxSendMessage({ userId }, text, {
        attachments,
        ...(delivery.silent ? { notify: false } : {}),
      });
      if (sent.ok && sent.messageId) {
        const { rememberModerationCard } = await import('@/lib/moderation-cards');
        await rememberModerationCard('app', app.id, {
          channel: 'MAX',
          chatId: String(userId),
          messageId: String(sent.messageId),
        }).catch(() => null);
      }
    }
  } catch (e) {
    console.error('[max-moderation] application notify failed', e);
  }
}

export async function notifyStaffMaxNewBooking(opts: {
  bookingId: string;
  status: 'PENDING' | 'APPROVED';
}): Promise<void> {
  try {
    const delivery = await resolveBotDelivery('max', 'bookings');
    if (!delivery.allowed) return;
    const recipients = await getStaffMaxRecipients('bookings');
    if (!recipients.length) return;

    const booking = await prisma.booking.findUnique({
      where: { id: opts.bookingId },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        space: { select: { title: true, address: true } },
      },
    });
    if (!booking) return;

    const { publicOrigin } = await getSiteIdentity();
    const when = `${formatMskDateTime(booking.startTime)} · ${formatMskTimeRange(
      booking.startTime,
      booking.endTime
    )}`;

    if (opts.status === 'APPROVED') {
      const text =
        `✅ Бронь автоодобрена\n` +
        `${booking.title}\n` +
        `🏠 ${booking.space?.title || '—'}\n` +
        `📆 ${when}\n` +
        `👤 ${booking.user.name || '—'}`;
      const attachments = maxLinkKeyboard(
        'Брони в админке',
        `${publicOrigin}/admin/bookings?status=APPROVED`
      );
      for (const userId of recipients) {
        await maxSendMessage({ userId }, text, {
          attachments,
          ...(delivery.silent ? { notify: false } : {}),
        });
      }
      return;
    }

    if (booking.status !== 'PENDING') return;

    const text =
      `📅 Новая бронь на модерацию\n` +
      `${booking.title}\n` +
      `🏠 ${booking.space?.title || '—'}\n` +
      `📆 ${when}\n` +
      `👤 ${booking.user.name || '—'}${booking.user.phone ? ` · ${booking.user.phone}` : ''}`;

    const attachments = [
      ...maxCallbackKeyboard([
        [
          { text: '✅ Одобрить', payload: `book_ok_${booking.id}` },
          { text: '✕ Отклонить', payload: `book_no_${booking.id}` },
        ],
      ]),
      ...maxLinkKeyboard(
        'Открыть',
        `${publicOrigin}/admin/bookings?status=PENDING&view=${booking.id}`
      ),
    ];

    for (const userId of recipients) {
      const sent = await maxSendMessage({ userId }, text, {
        attachments,
        ...(delivery.silent ? { notify: false } : {}),
      });
      if (sent.ok && sent.messageId) {
        const { rememberModerationCard } = await import('@/lib/moderation-cards');
        await rememberModerationCard('book', booking.id, {
          channel: 'MAX',
          chatId: String(userId),
          messageId: String(sent.messageId),
        }).catch(() => null);
      }
    }
  } catch (e) {
    console.error('[max-moderation] booking notify failed', e);
  }
}

export async function applyMaxDecision(opts: {
  kind: 'app' | 'book';
  id: string;
  approve: boolean;
  actorMaxUserId: string | number | null | undefined;
  /** Message mid from callback — used to edit the tapped card */
  messageId?: string | null;
  chatId?: string | number | null;
}): Promise<{ ok: boolean; message: string }> {
  if (!(await moderationEnabled())) {
    return { ok: false, message: 'MAX-бот выключен' };
  }

  const resource = opts.kind === 'app' ? 'applications' : 'bookings';
  const actor = await resolveMaxActor(opts.actorMaxUserId, resource);
  if (!actor) {
    return {
      ok: false,
      message:
        'Нет доступа. Привяжите MAX в профиле сотрудника (роль ADMIN/модератор с правом) или добавьте ID в оповещения.',
    };
  }

  const status = opts.approve ? 'APPROVED' : 'REJECTED';
  const rejectReason = opts.approve ? null : 'Отклонено через MAX-бота';
  const by = actor.name || actor.email || 'модератор';

  try {
    if (opts.kind === 'app') {
      const application = await prisma.$transaction(async (tx) => {
        const current = await tx.application.findUnique({
          where: { id: opts.id },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            project: { select: { title: true } },
            club: { select: { title: true } },
            program: { select: { title: true } },
          },
        });
        if (!current) return { error: 'NOT_FOUND' as const };
        if (current.status !== 'PENDING') {
          return { error: 'ALREADY' as const, status: current.status };
        }
        const updated = await tx.application.update({
          where: { id: opts.id, status: 'PENDING' },
          data: { status, rejectReason },
          include: {
            user: { select: { id: true, name: true, email: true, phone: true } },
            project: { select: { title: true } },
            club: { select: { title: true } },
            program: { select: { title: true } },
          },
        });
        return { error: null, updated };
      });

      if (application.error === 'NOT_FOUND') return { ok: false, message: 'Заявка не найдена' };
      if (application.error === 'ALREADY') {
        const st =
          application.status === 'APPROVED' || application.status === 'REJECTED'
            ? application.status
            : null;
        if (st) {
          void import('@/lib/moderation-outcome')
            .then(({ publishModerationOutcome }) =>
              publishModerationOutcome({
                kind: 'app',
                id: opts.id,
                status: st,
                actorName: by,
                primaryCard:
                  opts.messageId
                    ? {
                        channel: 'MAX',
                        chatId: String(opts.chatId ?? opts.actorMaxUserId ?? ''),
                        messageId: String(opts.messageId),
                      }
                    : null,
              })
            )
            .catch(() => null);
        }
        return { ok: false, message: `Уже обработано: ${applicationStatusRu(String(application.status))}` };
      }
      const updated = application.updated!;

      if (status === 'APPROVED') {
        await promoteToParticipant(updated.userId || updated.user.id);
      }
      if (updated.user?.email) {
        void notifyApplicationStatus({
          to: updated.user.email,
          userId: updated.user.id,
          targetName: appTargetTitle(updated),
          status,
          rejectReason: updated.rejectReason,
        }).catch(() => null);
      }

      const verb = status === 'APPROVED' ? '✅ Одобрено' : '❌ Отклонено';
      void import('@/lib/moderation-outcome')
        .then(({ publishModerationOutcome }) =>
          publishModerationOutcome({
            kind: 'app',
            id: opts.id,
            status,
            actorId: actor.id,
            actorName: by,
            subject: appTargetTitle(updated),
            rejectReason: updated.rejectReason,
            primaryCard:
              opts.messageId
                ? {
                    channel: 'MAX',
                    chatId: String(opts.chatId ?? opts.actorMaxUserId ?? ''),
                    messageId: String(opts.messageId),
                  }
                : null,
          })
        )
        .catch(() => null);
      return { ok: true, message: `${verb} · ${by}` };
    }

    const bookingResult = await prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({
        where: { id: opts.id },
        include: {
          space: { select: { title: true, address: true } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      });
      if (!current) return { error: 'NOT_FOUND' as const };
      if (current.status !== 'PENDING') {
        return { error: 'ALREADY' as const, status: current.status };
      }

      if (status === 'APPROVED') {
        const overlap = await tx.booking.findFirst({
          where: {
            spaceId: current.spaceId,
            status: 'APPROVED',
            id: { not: current.id },
            startTime: { lt: current.endTime },
            endTime: { gt: current.startTime },
          },
        });
        if (overlap) return { error: 'OVERBOOK' as const };
      }

      const updated = await tx.booking.update({
        where: { id: opts.id, status: 'PENDING' },
        data: { status, rejectReason },
        include: {
          space: { select: { title: true, address: true } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      });
      return { error: null, updated };
    });

    if (bookingResult.error === 'NOT_FOUND') return { ok: false, message: 'Бронь не найдена' };
    if (bookingResult.error === 'ALREADY') {
      const st =
        bookingResult.status === 'APPROVED' || bookingResult.status === 'REJECTED'
          ? bookingResult.status
          : null;
      if (st) {
        void import('@/lib/moderation-outcome')
          .then(({ publishModerationOutcome }) =>
            publishModerationOutcome({
              kind: 'book',
              id: opts.id,
              status: st,
              actorName: by,
              primaryCard:
                opts.messageId
                  ? {
                      channel: 'MAX',
                      chatId: String(opts.chatId ?? opts.actorMaxUserId ?? ''),
                      messageId: String(opts.messageId),
                    }
                  : null,
            })
          )
          .catch(() => null);
      }
      return { ok: false, message: `Уже обработано: ${bookingStatusRu(String(bookingResult.status))}` };
    }
    if (bookingResult.error === 'OVERBOOK') {
      return { ok: false, message: 'Конфликт по времени с другой одобренной бронью' };
    }

    const updated = bookingResult.updated!;
    if (status === 'APPROVED') {
      await promoteToParticipant(updated.userId || updated.user.id);
    }
    if (updated.user?.email) {
      void notifyBookingStatus({
        to: updated.user.email,
        userId: updated.userId || updated.user.id,
        bookingId: updated.id,
        title: updated.title,
        spaceTitle: updated.space?.title,
        spaceAddress: updated.space?.address,
        startTime: updated.startTime,
        endTime: updated.endTime,
        status,
        rejectReason: updated.rejectReason,
      }).catch(() => null);
    }

    const verb = status === 'APPROVED' ? '✅ Подтверждено' : '❌ Отклонено';
    void import('@/lib/moderation-outcome')
      .then(({ publishModerationOutcome }) =>
        publishModerationOutcome({
          kind: 'book',
          id: opts.id,
          status,
          actorId: actor.id,
          actorName: by,
          subject: updated.title,
          rejectReason: updated.rejectReason,
          primaryCard:
            opts.messageId
              ? {
                  channel: 'MAX',
                  chatId: String(opts.chatId ?? opts.actorMaxUserId ?? ''),
                  messageId: String(opts.messageId),
                }
              : null,
        })
      )
      .catch(() => null);
    return { ok: true, message: `${verb} · ${by}` };
  } catch (e) {
    console.error('[max-moderation] decision failed', e);
    return { ok: false, message: 'Ошибка обработки' };
  }
}

export async function listPendingApplicationsForMax(take = 5) {
  return prisma.application.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take,
    include: {
      user: { select: { name: true, phone: true } },
      project: { select: { title: true } },
      club: { select: { title: true } },
      program: { select: { title: true } },
    },
  });
}

export async function listPendingBookingsForMax(take = 5) {
  return prisma.booking.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take,
    include: {
      user: { select: { name: true, phone: true } },
      space: { select: { title: true, address: true } },
    },
  });
}

export async function listUpcomingEventsForMax(take = 5) {
  const now = new Date();
  return prisma.booking.findMany({
    where: {
      status: 'APPROVED',
      startTime: { gte: now },
    },
    orderBy: { startTime: 'asc' },
    take,
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      space: { select: { title: true, address: true } },
      _count: { select: { participants: true } },
    },
  });
}

export async function listUserTicketsForMax(userId: string, take = 8) {
  const now = new Date(Date.now() - 6 * 3600_000);
  const rows = await prisma.bookingParticipant.findMany({
    where: {
      userId,
      booking: { endTime: { gte: now }, status: 'APPROVED' },
    },
    include: {
      booking: {
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          space: { select: { title: true, address: true } },
        },
      },
    },
    orderBy: { booking: { startTime: 'asc' } },
    take,
  });
  return rows.map((p: (typeof rows)[number]) => ({
    ...p,
    ticketCode: buildTicketCode(p.bookingId, p.userId),
  }));
}

export function formatApplicationCard(app: Awaited<ReturnType<typeof listPendingApplicationsForMax>>[number]) {
  const kind = app.project ? 'Проект' : app.club ? 'Клуб' : app.program ? 'Программа' : 'Заявка';
  return (
    `📋 Заявка · ${kind}\n` +
    `${appTargetTitle(app)}\n` +
    `👤 ${app.user?.name || '—'}${app.user?.phone ? ` · ${app.user.phone}` : ''}\n` +
    `${(app.message || '').slice(0, 280) || 'без сообщения'}\n` +
    `⏱ ${formatMskDateTime(app.createdAt)}\n` +
    `id: ${app.id.slice(0, 10)}…`
  );
}

export function formatBookingCard(b: Awaited<ReturnType<typeof listPendingBookingsForMax>>[number]) {
  const when = `${formatMskDateTime(b.startTime)} · ${formatMskTimeRange(b.startTime, b.endTime)}`;
  return (
    `📅 Бронь на согласование\n` +
    `${b.title}\n` +
    `🏠 ${b.space?.title || '—'}\n` +
    `📆 ${when}\n` +
    `👤 ${b.user?.name || '—'}${b.user?.phone ? ` · ${b.user.phone}` : ''}\n` +
    `id: ${b.id.slice(0, 10)}…`
  );
}
