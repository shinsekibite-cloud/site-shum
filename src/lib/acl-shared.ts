/** Client-safe ACL helpers (no Node/Prisma imports) */

export const MODERATOR_PERMISSIONS = [
  'projects',
  'clubs',
  'spaces',
  'places',
  'bookings',
  'applications',
  'pages',
  'programs',
  'news',
  'stats',
  'scanner',
  'portfolios',
  'moderation',
  'vacancies',
  'contests',
] as const;

export type ModeratorPermission = (typeof MODERATOR_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<ModeratorPermission, string> = {
  projects: 'Проекты',
  clubs: 'Клубы',
  spaces: 'Пространства',
  places: 'Куда сходить',
  bookings: 'Афиша',
  applications: 'Заявки (клубы/проекты/программы)',
  pages: 'Страницы CMS',
  programs: 'Гранты / Добро / Самоуправление',
  news: 'Новости',
  stats: 'Статистика входов',
  scanner: 'Сканер билетов',
  portfolios: 'Портфолио и команда «О нас»',
  moderation: 'Модерация переписок',
  vacancies: 'Вакансии и работодатели',
  contests: 'Конкурсы и розыгрыши',
};

export function parsePermissions(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function sanitizePermissions(input: unknown): string {
  if (input == null || input === '') return '';
  const list = Array.isArray(input)
    ? input.map(String)
    : String(input).split(',');
  const allowed = new Set<string>(MODERATOR_PERMISSIONS);
  return [...new Set(list.map((p) => p.trim()).filter((p) => allowed.has(p)))].join(',');
}

export const LIMITED_ADMIN_TOKEN = 'limited';

export function isSuperAdmin(
  role: string | null | undefined,
  permissionsRaw: string | null | undefined
): boolean {
  if (role !== 'ADMIN') return false;
  return !parsePermissions(permissionsRaw).includes(LIMITED_ADMIN_TOKEN);
}

export function hasPermission(
  role: string | null | undefined,
  permissionsRaw: string | null | undefined,
  needed: ModeratorPermission | ModeratorPermission[]
): boolean {
  // TECH is ops-only — not a silent super-admin for moderator permissions /admin APIs.
  if (role === 'ADMIN') {
    if (isSuperAdmin(role, permissionsRaw)) return true;
    const have = parsePermissions(permissionsRaw).filter((p) => p !== LIMITED_ADMIN_TOKEN);
    const need = Array.isArray(needed) ? needed : [needed];
    return need.some((p) => have.includes(p));
  }
  if (role !== 'MODERATOR') return false;
  const have = parsePermissions(permissionsRaw);
  const need = Array.isArray(needed) ? needed : [needed];
  return need.some((p) => have.includes(p));
}

export function permissionsForAdminPath(
  pathname: string
): ModeratorPermission[] | 'ADMIN_ONLY' | 'ANY_MOD' {
  if (
    pathname.startsWith('/admin/users') ||
    pathname.startsWith('/admin/settings') ||
    pathname.startsWith('/admin/rkn') ||
    pathname.startsWith('/admin/backup') ||
    pathname.startsWith('/admin/system') ||
    pathname.startsWith('/admin/online') ||
    pathname.startsWith('/admin/bots') ||
    pathname.startsWith('/admin/activity')
  ) {
    return 'ADMIN_ONLY';
  }
  if (pathname.startsWith('/admin/security')) return ['moderation'];
  if (pathname.startsWith('/admin/projects')) return ['projects'];
  if (pathname.startsWith('/admin/clubs')) return ['clubs'];
  if (pathname.startsWith('/admin/spaces')) return ['spaces'];
  if (pathname.startsWith('/admin/places')) return ['places'];
  if (pathname.startsWith('/admin/bookings')) return ['bookings'];
  if (pathname.startsWith('/admin/applications')) return ['applications'];
  if (pathname.startsWith('/admin/pages')) return ['pages'];
  if (pathname.startsWith('/admin/faq')) return ['pages'];
  if (pathname.startsWith('/admin/documents')) return ['pages'];
  if (pathname.startsWith('/admin/about-team')) return ['pages', 'portfolios'];
  if (pathname.startsWith('/admin/portfolios')) return ['portfolios'];
  if (pathname.startsWith('/admin/awards')) return ['portfolios', 'pages'];
  if (pathname.startsWith('/admin/programs')) return ['programs', 'pages'];
  if (pathname.startsWith('/admin/news')) return ['news', 'pages'];
  if (pathname.startsWith('/admin/stats')) return ['stats', 'bookings'];
  if (pathname.startsWith('/admin/moderation')) return ['moderation'];
  if (pathname.startsWith('/admin/scanner')) return ['scanner'];
  if (pathname.startsWith('/admin/vacancies') || pathname.startsWith('/admin/employers')) return ['vacancies'];
  if (pathname.startsWith('/admin/contests')) return ['contests'];
  if (pathname === '/admin' || pathname === '/admin/') return 'ANY_MOD';
  // Unknown admin paths fail closed (admin-only) so new routes are not open by default
  return 'ADMIN_ONLY';
}

/** Roles that may use public end-user features (book, apply, join events) */
export function isEndUserRole(role?: string | null) {
  return role === 'USER' || role === 'PARTICIPANT' || role === 'ADMIN' || role === 'MODERATOR';
}

export function canAccessAdminPath(
  role: string | null | undefined,
  permissionsRaw: string | null | undefined,
  pathname: string
): boolean {
  if (role === 'ADMIN') {
    const need = permissionsForAdminPath(pathname);
    if (need === 'ADMIN_ONLY') return isSuperAdmin(role, permissionsRaw);
    if (isSuperAdmin(role, permissionsRaw) || need === 'ANY_MOD') return true;
    return hasPermission(role, permissionsRaw, need);
  }
  // TECH is redirected to /ops in proxy — never treat as admin UI access.
  if (role === 'TECH' || role !== 'MODERATOR') return false;
  const need = permissionsForAdminPath(pathname);
  if (need === 'ADMIN_ONLY') return false;
  if (need === 'ANY_MOD') return true;
  return hasPermission(role, permissionsRaw, need);
}

export function canUseScanner(role?: string | null, permissionsRaw?: string | null) {
  if (role === 'TECH' || role === 'SCANNER') return true;
  return hasPermission(role, permissionsRaw, 'scanner');
}

export function canUploadContent(role?: string | null, permissionsRaw?: string | null) {
  return hasPermission(role, permissionsRaw, [
    'projects',
    'clubs',
    'spaces',
    'places',
    'pages',
    'programs',
    'news',
  ]);
}

export function isTechRole(role?: string | null) {
  return role === 'TECH';
}
