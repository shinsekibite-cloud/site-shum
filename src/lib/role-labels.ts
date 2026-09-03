/** Russian labels for User.role enum values. */

export const ROLE_LABELS_RU: Record<string, string> = {
  USER: 'Пользователь',
  PARTICIPANT: 'Пользователь',
  GUEST: 'Гость',
  MODERATOR: 'Модератор',
  SCANNER: 'Сканер',
  TECH: 'Техслужба',
  ADMIN: 'Администратор',
};

export function roleLabelRu(role: string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABELS_RU[role] || role;
}
