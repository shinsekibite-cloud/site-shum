/**
 * After a booking/application is approved or rejected from any channel
 * (admin UI, Telegram, MAX): mark staff in-app alerts as stale and sync
 * messenger moderation cards.
 */
import { prisma } from '@/lib/prisma';
import { formatMskDateTime } from '@/lib/booking-hours';
import { SITE_ADMIN_LABEL } from '@/lib/notification-meta';
import { applicationStatusRu, bookingStatusRu } from '@/lib/status-labels-ru';
import {
  clearModerationCards,
  listModerationCards,
  rememberModerationCard,
  type ModerationCardRef,
} from '@/lib/moderation-cards';

export type ModerationOutcomeOpts = {
  kind: 'book' | 'app';
  id: string;
  status: 'APPROVED' | 'REJECTED';
  actorName?: string | null;
  actorId?: string | null;
  /** Short subject for the card (booking title / target name) */
  subject?: string | null;
  rejectReason?: string | null;
  /** Prefer editing this card first (the one the moderator clicked) */
  primaryCard?: ModerationCardRef | null;
};

function decisionVerb(status: 'APPROVED' | 'REJECTED') {
  return status === 'APPROVED' ? 'Одобрено' : 'Отклонено';
}

function decisionEmoji(status: 'APPROVED' | 'REJECTED') {
  return status === 'APPROVED' ? '✅' : '❌';
}

export function moderationStaleLabel(status: 'APPROVED' | 'REJECTED', actorName?: string | null) {
  const who = (actorName || '').trim() || 'модератор';
  return `Не актуально · ${decisionVerb(status)} · ${who}`;
}

/** Update staff pending in-app notifications for this entity. */
export async function markStaffModerationNotificationsHandled(
  opts: ModerationOutcomeOpts
): Promise<number> {
  const idKey = opts.kind === 'book' ? 'bookingId' : 'applicationId';
  const needleA = `"${idKey}":"${opts.id}"`;
  const needleB = `"${idKey}": "${opts.id}"`;
  const when = formatMskDateTime(new Date());
  const who = (opts.actorName || '').trim() || 'Модератор';
  const verb = decisionVerb(opts.status);
  const subject = (opts.subject || '').trim();

  const candidates = await prisma.userNotification.findMany({
    where: {
      OR: [{ meta: { contains: needleA } }, { meta: { contains: needleB } }],
      createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true, meta: true, title: true, body: true, readAt: true },
    take: 120,
  });

  let updated = 0;
  for (const row of candidates) {
    let meta: Record<string, unknown> = {};
    try {
      meta = row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : {};
    } catch {
      meta = {};
    }
    if (meta[idKey] !== opts.id && String(meta[idKey] || '') !== opts.id) continue;
    // Только staff-очереди (не «бронь отправлена» у пользователя)
    if (meta.audience === 'user') continue;
    const href = typeof meta.href === 'string' ? meta.href : '';
    if (href.startsWith('/tickets') || href.startsWith('/dashboard')) continue;
    if (meta.handled === true && meta.decisionStatus === opts.status) continue;

    const nextMeta = {
      ...meta,
      handled: true,
      stale: true,
      decisionStatus: opts.status,
      decidedAt: new Date().toISOString(),
      actorId: opts.actorId || meta.actorId || null,
      actorName: who,
      actorLabel: SITE_ADMIN_LABEL,
      audience: meta.audience || 'staff',
      staleLabel: moderationStaleLabel(opts.status, who),
    };

    const title = `Не актуально · ${verb}${subject ? `: ${subject.slice(0, 80)}` : ''}`;
    const body = `${who} · ${when}${
      opts.status === 'REJECTED' && opts.rejectReason
        ? ` · ${String(opts.rejectReason).slice(0, 120)}`
        : ''
    }`;

    await prisma.userNotification.update({
      where: { id: row.id },
      data: {
        title: title.slice(0, 180),
        body: body.slice(0, 400),
        meta: JSON.stringify(nextMeta),
        readAt: row.readAt || new Date(),
      },
    });
    updated += 1;
  }
  return updated;
}

function tgStamp(opts: ModerationOutcomeOpts) {
  const who = (opts.actorName || '').trim() || 'модератор';
  return (
    `\n\n${decisionEmoji(opts.status)} <b>${decisionVerb(opts.status)}</b>` +
    ` · ${who} · ${formatMskDateTime(new Date())}` +
    `\n<i>Не актуально — решение уже принято</i>`
  );
}

function maxStamp(opts: ModerationOutcomeOpts) {
  const who = (opts.actorName || '').trim() || 'модератор';
  return (
    `\n\n${decisionEmoji(opts.status)} ${decisionVerb(opts.status)}` +
    ` · ${who} · ${formatMskDateTime(new Date())}` +
    `\nНе актуально — решение уже принято`
  );
}

async function buildCardBody(opts: ModerationOutcomeOpts, channel: 'TELEGRAM' | 'MAX'): Promise<string> {
  if (opts.kind === 'book') {
    const booking = await prisma.booking.findUnique({
      where: { id: opts.id },
      include: {
        space: { select: { title: true, address: true } },
        user: { select: { name: true, phone: true, email: true } },
      },
    });
    if (!booking) {
      return channel === 'TELEGRAM'
        ? `📅 Бронь\n<code>${opts.id}</code>${tgStamp(opts)}`
        : `📅 Бронь\n${opts.id}${maxStamp(opts)}`;
    }
    if (channel === 'TELEGRAM') {
      const { bookingCardHtml } = await import('@/lib/telegram-moderation');
      return bookingCardHtml(booking) + tgStamp(opts);
    }
    const when = formatMskDateTime(booking.startTime);
    return (
      `📅 Бронь · ${bookingStatusRu(booking.status)}\n` +
      `${booking.title}\n` +
      `🏠 ${booking.space?.title || '—'}\n` +
      `📆 ${when}\n` +
      `👤 ${booking.user.name || '—'}${maxStamp(opts)}`
    );
  }

  const app = await prisma.application.findUnique({
    where: { id: opts.id },
    include: {
      user: { select: { name: true, phone: true, email: true } },
      project: { select: { title: true } },
      club: { select: { title: true } },
      program: { select: { title: true } },
    },
  });
  if (!app) {
    return channel === 'TELEGRAM'
      ? `📋 Заявка\n<code>${opts.id}</code>${tgStamp(opts)}`
      : `📋 Заявка\n${opts.id}${maxStamp(opts)}`;
  }
  if (channel === 'TELEGRAM') {
    const { applicationCardHtml } = await import('@/lib/telegram-moderation');
    return applicationCardHtml(app) + tgStamp(opts);
  }
  const target = app.project?.title || app.club?.title || app.program?.title || 'Без цели';
  return (
    `📥 Заявка · ${applicationStatusRu(app.status)}\n` +
    `${target}\n` +
    `👤 ${app.user?.name || '—'}${maxStamp(opts)}`
  );
}

async function editStoredCards(opts: ModerationOutcomeOpts): Promise<number> {
  const stored = await listModerationCards(opts.kind, opts.id);
  const primary = opts.primaryCard;
  const all = uniqRefs(
    primary ? [primary, ...stored] : stored
  );
  if (!all.length) {
    // Fallback: notify recipients that decision was made (no card ids to edit)
    await fanoutDecisionNotice(opts).catch(() => null);
    return 0;
  }

  let edited = 0;
  const { publicOrigin } = await import('@/lib/site-identity').then((m) => m.getSiteIdentity());
  const adminPath =
    opts.kind === 'book'
      ? `/admin/bookings?status=${opts.status}`
      : `/admin/applications?status=${opts.status}`;

  for (const ref of all) {
    try {
      if (ref.channel === 'TELEGRAM') {
        const text = await buildCardBody(opts, 'TELEGRAM');
        const { tgEditMessage, openAdminKeyboard } = await import('@/lib/telegram');
        const mid = Number(ref.messageId);
        if (!Number.isFinite(mid)) continue;
        const r = await tgEditMessage(ref.chatId, mid, text, {
          reply_markup: openAdminKeyboard(adminPath, publicOrigin),
        });
        if (r.ok) edited += 1;
      } else {
        const text = await buildCardBody(opts, 'MAX');
        const { maxEditMessage, maxLinkKeyboard } = await import('@/lib/max');
        const r = await maxEditMessage(ref.messageId, text, {
          attachments: maxLinkKeyboard(
            opts.kind === 'book' ? 'Брони в админке' : 'Заявки в админке',
            `${publicOrigin}${adminPath}`
          ),
          notify: false,
        });
        if (r.ok) edited += 1;
      }
    } catch (e) {
      console.warn('[moderation-outcome] edit card', ref, e);
    }
  }

  await clearModerationCards(opts.kind, opts.id).catch(() => null);
  return edited;
}

function uniqRefs(refs: ModerationCardRef[]): ModerationCardRef[] {
  const seen = new Set<string>();
  const out: ModerationCardRef[] = [];
  for (const r of refs) {
    const k = `${r.channel}:${r.chatId}:${r.messageId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** When we have no stored message ids — soft ping staff chats. */
async function fanoutDecisionNotice(opts: ModerationOutcomeOpts) {
  const who = (opts.actorName || '').trim() || 'модератор';
  const subject = (opts.subject || opts.id).slice(0, 120);
  const { escapeHtml } = await import('@/lib/html-escape');
  const tgLine =
    `${decisionEmoji(opts.status)} <b>${decisionVerb(opts.status)}</b> · ${escapeHtml(subject)}\n` +
    `${escapeHtml(who)} · ${escapeHtml(formatMskDateTime(new Date()))}\n` +
    `<i>Не актуально</i>`;
  const plainLine =
    `${decisionEmoji(opts.status)} ${decisionVerb(opts.status)} · ${subject}\n` +
    `${who} · ${formatMskDateTime(new Date())}\nНе актуально`;

  try {
    const { getStaffTelegramRecipients } = await import('@/lib/telegram-moderation');
    const { tgSendMessage } = await import('@/lib/telegram');
    const resource = opts.kind === 'book' ? 'bookings' : 'applications';
    const chats = await getStaffTelegramRecipients(resource);
    for (const chatId of chats.slice(0, 20)) {
      await tgSendMessage(chatId, tgLine);
    }
  } catch {
    /* ignore */
  }

  try {
    const { getStaffMaxRecipients } = await import('@/lib/max-moderation');
    const { maxSendMessage } = await import('@/lib/max');
    const resource = opts.kind === 'book' ? 'bookings' : 'applications';
    const ids = await getStaffMaxRecipients(resource);
    for (const userId of ids.slice(0, 20)) {
      await maxSendMessage({ userId }, plainLine, { notify: false });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Call after DB commit of APPROVED/REJECTED for booking or application.
 * Safe to fire-and-forget.
 */
export async function publishModerationOutcome(opts: ModerationOutcomeOpts): Promise<void> {
  try {
    if (opts.primaryCard) {
      await rememberModerationCard(opts.kind, opts.id, opts.primaryCard).catch(() => null);
    }
    await markStaffModerationNotificationsHandled(opts);
    await editStoredCards(opts);
  } catch (e) {
    console.warn('[moderation-outcome]', e);
  }
}
