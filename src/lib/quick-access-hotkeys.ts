/** Shared quick-access hotkey definitions (keyboard + panel links). */

export type QuickAccessRole = 'USER' | 'PARTICIPANT' | 'MODERATOR' | 'ADMIN' | 'SCANNER' | 'TECH';

export type HotkeyDef = {
  keys: string;
  label: string;
  href?: string;
  action?: 'home' | 'back' | 'help' | 'search';
  roles?: QuickAccessRole[];
  /** Group for panel layout */
  group?: 'nav' | 'account' | 'staff' | 'system';
};

/**
 * Chord map: press G, then the second key within ~1.2s.
 * Single-key entries: /, ?, Esc
 *
 * Verified routes exist under src/app.
 */
export const QUICK_ACCESS_HOTKEYS: HotkeyDef[] = [
  { keys: 'G H', label: 'Главная', href: '/', action: 'home', group: 'nav' },
  { keys: 'G E', label: 'Афиша', href: '/events', group: 'nav' },
  { keys: 'G N', label: 'Новости', href: '/news', group: 'nav' },
  { keys: 'G P', label: 'Проекты', href: '/projects', group: 'nav' },
  { keys: 'G M', label: 'Пространства', href: '/spaces', group: 'nav' },
  { keys: 'G Q', label: 'Куда сходить', href: '/places', group: 'nav' },
  { keys: 'G L', label: 'Клубы', href: '/clubs', group: 'nav' },
  { keys: 'G K', label: 'Гранты', href: '/grants', group: 'nav' },
  { keys: 'G V', label: 'Добро', href: '/dobro', group: 'nav' },
  { keys: 'G Y', label: 'Самоуправление', href: '/self-gov', group: 'nav' },
  { keys: 'G F', label: 'Документы', href: '/documents', group: 'nav' },
  { keys: 'G G', label: 'Игры', href: '/games', group: 'nav' },
  { keys: 'G O', label: 'Контакты', href: '/contacts', group: 'nav' },

  {
    keys: 'G C',
    label: 'Сообщения',
    href: '/messages',
    group: 'account',
    roles: ['USER', 'PARTICIPANT', 'MODERATOR', 'ADMIN'],
  },
  {
    keys: 'G R',
    label: 'Друзья',
    href: '/friends',
    group: 'account',
    roles: ['USER', 'PARTICIPANT', 'MODERATOR', 'ADMIN'],
  },
  {
    keys: 'G D',
    label: 'Профиль',
    href: '/dashboard',
    group: 'account',
    roles: ['USER', 'PARTICIPANT', 'MODERATOR', 'ADMIN'],
  },
  {
    keys: 'G U',
    label: 'Настройки',
    href: '/dashboard/settings',
    group: 'account',
    roles: ['USER', 'PARTICIPANT', 'MODERATOR', 'ADMIN'],
  },
  {
    keys: 'G A',
    label: 'Достижения',
    href: '/dashboard/achievements',
    group: 'account',
    roles: ['USER', 'PARTICIPANT', 'MODERATOR', 'ADMIN'],
  },

  { keys: 'G S', label: 'Сканер', href: '/scanner', roles: ['MODERATOR', 'ADMIN', 'SCANNER'], group: 'staff' },
  { keys: 'G T', label: 'Админ', href: '/admin', roles: ['ADMIN', 'MODERATOR'], group: 'staff' },
  { keys: 'G T', label: 'Ops', href: '/ops', roles: ['TECH'], group: 'staff' },

  { keys: '/', label: 'Поиск', action: 'search', group: 'system' },
  { keys: 'Esc', label: 'Назад / закрыть', action: 'back', group: 'system' },
  { keys: '?', label: 'Эта шпаргалка', action: 'help', group: 'system' },
];

export function filterHotkeysForRole(role?: string | null): HotkeyDef[] {
  return QUICK_ACCESS_HOTKEYS.filter((item) => {
    if (!item.roles) return true;
    if (!role) return false;
    return item.roles.includes(role as QuickAccessRole);
  });
}

export function normalizeHotkeyKey(key: string) {
  if (key === 'Escape') return 'Esc';
  if (key === ' ') return 'Space';
  return key.length === 1 ? key.toUpperCase() : key;
}

export function isEditableHotkeyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** True when another modal/dialog should own Escape / focus. */
export function hasBlockingOverlay() {
  if (typeof document === 'undefined') return false;
  if (document.querySelector('.yp-cookie-banner')) return true;
  if (document.querySelector('.qa-tutorial-root')) return true;
  if (document.body.classList.contains('mobile-nav-open')) return true;
  // Other app dialogs (not our own quick-access sheet)
  const dialogs = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
  for (const el of dialogs) {
    if (el.classList.contains('qa-sheet-root')) continue;
    return true;
  }
  return false;
}
