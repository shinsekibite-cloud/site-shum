/**
 * Единые русские подписи статусов для UI (пользователь / staff / мессенджеры).
 * В интерфейсе никогда не показываем сырые enum'ы PENDING/APPROVED/…
 */

export const BOOKING_STATUS_RU: Record<string, string> = {
  PENDING: 'На модерации',
  APPROVED: 'Одобрено',
  REJECTED: 'Отклонено',
};

export const APPLICATION_STATUS_RU: Record<string, string> = {
  PENDING: 'Ожидает',
  APPROVED: 'Одобрено',
  REJECTED: 'Отклонено',
};

export const VACANCY_APP_STATUS_RU: Record<string, string> = {
  PENDING: 'Черновик',
  SCREENING: 'Предотбор',
  PENDING_REVIEW: 'На рассмотрении',
  APPROVED: 'Принято',
  REJECTED: 'Отклонено',
  WITHDRAWN: 'Отозвано',
};

export const EMPLOYER_STATUS_RU: Record<string, string> = {
  PENDING: 'На проверке',
  APPROVED: 'Подтверждена',
  REJECTED: 'Отклонена',
};

export const PORTFOLIO_STATUS_RU: Record<string, string> = {
  DRAFT: 'Черновик',
  PENDING: 'На проверке',
  APPROVED: 'Опубликовано',
  REJECTED: 'Отклонено',
};

export const REFERRAL_STATUS_RU: Record<string, string> = {
  PENDING: 'Ожидание',
  SIGNED_UP: 'Регистрация',
  QUALIFIED: 'Отмечен на событии',
  REJECTED: 'Антифрод',
};

export const VACANCY_STATUS_RU: Record<string, string> = {
  DRAFT: 'Черновик',
  OPEN: 'Открыта',
  CLOSED: 'Закрыта',
  ARCHIVED: 'Архив',
};

export const CONTEST_UI_STATUS_RU: Record<string, string> = {
  DRAFT: 'Черновик',
  OPEN: 'Приём работ',
  VOTING: 'Голосование',
  CLOSED: 'Завершён',
  ARCHIVED: 'Архив',
};

export const SPACE_STATUS_RU: Record<string, string> = {
  ACTIVE: 'Активна',
  INACTIVE: 'Скрыта',
  COMPLETED: 'Завершена',
};

/** Универсальный fallback: известный код → русская подпись, иначе «Неизвестно». */
export function statusRu(
  map: Record<string, string>,
  status: string | null | undefined,
  fallback = 'Неизвестно'
): string {
  const key = String(status || '').trim();
  if (!key) return fallback;
  return map[key] || map[key.toUpperCase()] || fallback;
}

export function bookingStatusRu(status: string | null | undefined) {
  return statusRu(BOOKING_STATUS_RU, status);
}

export function applicationStatusRu(status: string | null | undefined) {
  return statusRu(APPLICATION_STATUS_RU, status);
}
