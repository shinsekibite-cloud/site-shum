/** Categories for space bookings that become public afisha events. */

export const EVENT_CATEGORIES = [
  'Общее',
  'Встреча клуба',
  'Мастер-класс',
  'Лекция / разговор',
  'Спорт',
  'Творчество',
  'Волонтёрство',
  'Кино / медиа',
  'Игры',
  'Открытый микрофон',
  'Другое',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_CONTACT_MODES = ['PROFILE', 'CUSTOM', 'HIDDEN'] as const;
export type EventContactMode = (typeof EVENT_CONTACT_MODES)[number];

export function normalizeEventCategory(raw?: string | null): EventCategory {
  const v = String(raw || '').trim();
  if ((EVENT_CATEGORIES as readonly string[]).includes(v)) return v as EventCategory;
  return 'Общее';
}

export function normalizeEventContactMode(raw?: string | null): EventContactMode {
  const v = String(raw || '').trim().toUpperCase();
  if ((EVENT_CONTACT_MODES as readonly string[]).includes(v)) return v as EventContactMode;
  return 'PROFILE';
}
