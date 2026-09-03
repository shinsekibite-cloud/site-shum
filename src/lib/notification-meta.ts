/** Notification actor labels for staff vs end users. */

export const SITE_ADMIN_LABEL = 'Администрация сайта';

export type NotificationTypeId =
  | 'MESSAGE'
  | 'FRIEND_REQUEST'
  | 'BOOKING_REQUEST'
  | 'CHECK_IN'
  | 'SECURITY'
  | 'PORTFOLIO'
  | 'MODERATION'
  | 'APPLICATION'
  | 'ENTITY_INVITE'
  | 'SYSTEM'
  | 'ECO'
  | 'CONTEST'
  | 'VACANCY'
  | 'AWARD'
  | 'LEVEL';

export const NOTIFICATION_TYPE_OPTIONS: { id: NotificationTypeId; label: string }[] = [
  { id: 'MESSAGE', label: 'Сообщения' },
  { id: 'FRIEND_REQUEST', label: 'Друзья' },
  { id: 'BOOKING_REQUEST', label: 'Бронирования' },
  { id: 'APPLICATION', label: 'Заявки' },
  { id: 'ENTITY_INVITE', label: 'Проекты и клубы' },
  { id: 'CHECK_IN', label: 'Чекин' },
  { id: 'PORTFOLIO', label: 'Портфолио' },
  { id: 'MODERATION', label: 'Модерация' },
  { id: 'SECURITY', label: 'Безопасность' },
  { id: 'ECO', label: 'Магазин' },
  { id: 'CONTEST', label: 'Конкурсы' },
  { id: 'VACANCY', label: 'Вакансии' },
  { id: 'AWARD', label: 'Награды' },
  { id: 'LEVEL', label: 'Уровень' },
  { id: 'SYSTEM', label: 'Прочие' },
];

export function notificationTypeLabel(type: string): string {
  return NOTIFICATION_TYPE_OPTIONS.find((t) => t.id === type)?.label || type;
}

type NotificationHrefItem = { type: string; meta?: string | null };

/** Resolve link target for a notification row. */
export function resolveNotificationHref(
  n: NotificationHrefItem,
  opts?: { isStaffViewer?: boolean }
): string | null {
  try {
    if (n.meta) {
      const parsed = JSON.parse(n.meta) as { href?: unknown };
      if (typeof parsed.href === 'string' && parsed.href.startsWith('/')) return parsed.href;
    }
  } catch {
    /* ignore */
  }
  if (n.type === 'MESSAGE') return '/messages';
  if (n.type === 'FRIEND_REQUEST') return '/friends';
  if (n.type === 'BOOKING_REQUEST') {
    return opts?.isStaffViewer ? '/admin/bookings' : '/tickets';
  }
  if (n.type === 'APPLICATION') return '/dashboard/applications';
  if (n.type === 'ENTITY_INVITE') return '/dashboard/applications';
  if (n.type === 'CHECK_IN') {
    return opts?.isStaffViewer ? '/scanner' : '/tickets';
  }
  if (n.type === 'PORTFOLIO') {
    return opts?.isStaffViewer ? '/admin/portfolios' : '/dashboard/portfolio';
  }
  if (n.type === 'MODERATION') {
    return opts?.isStaffViewer ? '/admin/moderation' : '/dashboard';
  }
  if (n.type === 'SECURITY') return '/dashboard';
  if (n.type === 'ECO') return '/dashboard/shop';
  if (n.type === 'CONTEST') return '/contests';
  if (n.type === 'VACANCY') return '/vacancies';
  if (n.type === 'AWARD') return '/dashboard/awards';
  if (n.type === 'LEVEL') return '/dashboard';
  if (n.type === 'SYSTEM') return '/dashboard';
  return '/dashboard';
}

export type NotificationMeta = {
  href?: string;
  actorId?: string;
  actorName?: string;
  /** Always show this to end users */
  actorLabel?: string;
  audience?: 'staff' | 'user';
  status?: string;
  handled?: boolean;
  stale?: boolean;
  staleLabel?: string;
  decisionStatus?: string;
  [key: string]: unknown;
};

export function parseNotificationMeta(raw: string | null | undefined): NotificationMeta {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as NotificationMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Who to show under a notification row. */
export function notificationActorLine(
  meta: NotificationMeta,
  opts?: { isStaffViewer?: boolean }
): string | null {
  if (opts?.isStaffViewer) {
    return meta.actorName || meta.actorLabel || null;
  }
  // End users: never expose personal moderator names for decision notices
  if (meta.audience === 'user' || meta.actorLabel || meta.actorId) {
    return meta.actorLabel || SITE_ADMIN_LABEL;
  }
  return meta.actorName || null;
}

export function withDecisionActor(
  meta: Record<string, unknown> | undefined,
  actor: { id: string; name?: string | null },
  audience: 'staff' | 'user'
): Record<string, unknown> {
  return {
    ...(meta || {}),
    audience,
    actorId: actor.id,
    actorName: (actor.name || '').trim() || 'Модератор',
    actorLabel: SITE_ADMIN_LABEL,
    handled: true,
  };
}
