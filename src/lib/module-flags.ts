/**
 * Kill-switch module flags (TECH ops panel).
 * Missing key = enabled (fail-open). TECH always bypasses.
 * Emergency: MODULE_FLAGS_FORCE_ON=1 forces all on.
 *
 * Off-modes (inside moduleFlagsJson): `__offModes: { [key]: 'soon' | 'hide' }`
 * - soon → /unavailable shows «В разработке»
 * - hide → default «Раздел временно отключён»
 */
import { prisma } from '@/lib/prisma';
import { getSharedRedis } from '@/lib/rateLimit';
import { isNextBuildPhase } from '@/lib/build-phase';

export const MODULE_FLAG_KEYS = [
  'registration',
  'messaging',
  'events',
  'tickets_scan',
  'places',
  'gallery',
  'projects',
  'clubs',
  'spaces',
  'grants',
  'dobro',
  'self_gov',
  'vacancies',
  'contests',
  'friends',
  'games',
  'news',
  'portfolio',
  'eco',
  'achievements',
  'ratings',
  'club_chat',
  'applications',
  'notifications',
  'documents',
  'referrals',
  'faq',
  'presentation',
  'server_status',
  'bots',
  'maintenance',
] as const;

export type ModuleFlagKey = (typeof MODULE_FLAG_KEYS)[number];

export type ModuleFlags = Record<ModuleFlagKey, boolean>;

/** How a disabled public module is presented to guests. */
export type ModuleOffMode = 'soon' | 'hide';

export type ModuleOffModes = Partial<Record<ModuleFlagKey, ModuleOffMode>>;

export const MODULE_FLAG_META: Record<
  ModuleFlagKey,
  { label: string; description: string; publicKill: boolean }
> = {
  registration: {
    label: 'Регистрация',
    description: '/register и API регистрации',
    publicKill: true,
  },
  messaging: {
    label: 'Сообщения',
    description: 'Личные сообщения: /messages, кабинет, иконка в шапке, нижнее меню',
    publicKill: true,
  },
  events: {
    label: 'Афиша',
    description: '/events, запись, билеты участников',
    publicKill: true,
  },
  tickets_scan: {
    label: 'Сканер входа',
    description: '/scanner и API сканера',
    publicKill: true,
  },
  places: {
    label: 'Куда сходить',
    description: '/places и связанные API',
    publicKill: true,
  },
  gallery: {
    label: 'Галерея',
    description: '/gallery и орг-галерея',
    publicKill: true,
  },
  projects: {
    label: 'Проекты',
    description: 'Каталог проектов и заявки',
    publicKill: true,
  },
  clubs: {
    label: 'Клубы',
    description: 'Каталог клубов и заявки',
    publicKill: true,
  },
  spaces: {
    label: 'Пространства',
    description: 'Каталог пространств и брони',
    publicKill: true,
  },
  grants: {
    label: 'Гранты',
    description: '/grants — программы грантов',
    publicKill: true,
  },
  dobro: {
    label: 'Добро',
    description: '/dobro — волонтёрские программы',
    publicKill: true,
  },
  self_gov: {
    label: 'Самоуправление',
    description: '/self-gov — самоуправление',
    publicKill: true,
  },
  vacancies: {
    label: 'Вакансии',
    description: '/vacancies и отклики',
    publicKill: true,
  },
  contests: {
    label: 'Конкурсы',
    description: '/contests, работы, розыгрыши',
    publicKill: true,
  },
  friends: {
    label: 'Друзья',
    description: 'Поиск и заявки в друзья',
    publicKill: true,
  },
  games: {
    label: 'Игры',
    description: '/games',
    publicKill: true,
  },
  news: {
    label: 'Новости',
    description: '/news',
    publicKill: true,
  },
  portfolio: {
    label: 'Портфолио',
    description: 'Публичное портфолио и подача',
    publicKill: true,
  },
  eco: {
    label: 'мбаллы',
    description: '/api/user/eco, магазин и разделы кабинета',
    publicKill: true,
  },
  achievements: {
    label: 'Достижения',
    description: 'Значки и прогресс достижений',
    publicKill: true,
  },
  ratings: {
    label: 'Рейтинги',
    description: 'Авторитет, соцрейтинг и уровень в UI',
    publicKill: true,
  },
  club_chat: {
    label: 'Чаты клубов/проектов',
    description: 'Групповые чаты (/api/group-chat)',
    publicKill: true,
  },
  applications: {
    label: 'Заявки',
    description: 'Общий контур заявок: /api/applications, кабинет «Заявки»',
    publicKill: true,
  },
  notifications: {
    label: 'Уведомления',
    description: 'Колокольчик, inbox, push/VAPID',
    publicKill: true,
  },
  documents: {
    label: 'Документы',
    description: '/documents и скачивание файлов',
    publicKill: true,
  },
  referrals: {
    label: 'Рефералы',
    description: '/dashboard/referrals и /api/referrals',
    publicKill: true,
  },
  faq: {
    label: 'FAQ',
    description: '/faq — вопросы и ответы',
    publicKill: true,
  },
  presentation: {
    label: 'Презентация',
    description: '/presentation, слайды и скачивание архива',
    publicKill: true,
  },
  server_status: {
    label: 'Состояние сервера',
    description: '/admin/system и /api/admin/system (не TECH)',
    publicKill: false,
  },
  bots: {
    label: 'Боты',
    description: 'Админка ботов + вебхуки Telegram/MAX + публичные deep-link',
    publicKill: false,
  },
  maintenance: {
    label: 'Техработы (весь сайт)',
    description: 'Зеркало SiteSettings.maintenanceMode',
    publicKill: false,
  },
};

const CACHE_KEY = 'yp:module-flags:v2';
const CACHE_TTL_SEC = 60;

type CacheBundle = { flags: ModuleFlags; offModes: ModuleOffModes };

const MEM = { at: 0, bundle: null as CacheBundle | null };

export function defaultModuleFlags(): ModuleFlags {
  const out = {} as ModuleFlags;
  for (const k of MODULE_FLAG_KEYS) out[k] = true;
  return out;
}

export function defaultModuleOffModes(): ModuleOffModes {
  return {};
}

function normalizeOffMode(v: unknown): ModuleOffMode | null {
  if (v === 'soon' || v === 'hide') return v;
  return null;
}

export function parseModuleOffModesJson(raw: unknown): ModuleOffModes {
  const out: ModuleOffModes = {};
  if (!raw) return out;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return out;
    const modes = (data as Record<string, unknown>).__offModes;
    if (!modes || typeof modes !== 'object') return out;
    for (const k of MODULE_FLAG_KEYS) {
      const m = normalizeOffMode((modes as Record<string, unknown>)[k]);
      if (m) out[k] = m;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function parseModuleFlagsJson(raw: unknown): ModuleFlags {
  const base = defaultModuleFlags();
  if (!raw) return base;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') return base;
    const obj = data as Record<string, unknown>;
    for (const k of MODULE_FLAG_KEYS) {
      if (k in obj && typeof obj[k] === 'boolean') {
        base[k] = Boolean(obj[k]);
      }
    }
    // Legacy umbrella `programs` → grants / dobro / self_gov when split keys absent
    if (typeof obj.programs === 'boolean') {
      for (const k of ['grants', 'dobro', 'self_gov'] as const) {
        if (!(k in obj)) base[k] = obj.programs !== false;
      }
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function parseModuleFlagsBundle(raw: unknown): CacheBundle {
  return {
    flags: parseModuleFlagsJson(raw),
    offModes: parseModuleOffModesJson(raw),
  };
}

export function isTechRole(role?: string | null) {
  return role === 'TECH';
}

/** Path prefix → module flag (first match wins). Used by proxy + pages.
 * Keep in sync with src/lib/module-flags-edge.ts
 */
export const PATH_MODULE_RULES: Array<{ prefix: string; key: ModuleFlagKey }> = [
  { prefix: '/register', key: 'registration' },
  { prefix: '/api/register', key: 'registration' },
  { prefix: '/messages', key: 'messaging' },
  { prefix: '/api/messages', key: 'messaging' },
  { prefix: '/api/dm', key: 'messaging' },
  { prefix: '/events', key: 'events' },
  { prefix: '/tickets', key: 'events' },
  { prefix: '/check-in', key: 'events' },
  { prefix: '/api/events', key: 'events' },
  { prefix: '/api/bookings', key: 'events' },
  { prefix: '/api/check-in', key: 'events' },
  { prefix: '/api/user/bookings', key: 'events' },
  { prefix: '/scanner', key: 'tickets_scan' },
  { prefix: '/scan', key: 'tickets_scan' },
  { prefix: '/admin/scanner', key: 'tickets_scan' },
  { prefix: '/api/scanner', key: 'tickets_scan' },
  { prefix: '/api/scan', key: 'tickets_scan' },
  { prefix: '/coworking', key: 'spaces' },
  { prefix: '/api/coworking', key: 'spaces' },
  { prefix: '/api/presence-qr', key: 'spaces' },
  { prefix: '/c/', key: 'spaces' },
  { prefix: '/places', key: 'places' },
  { prefix: '/api/places', key: 'places' },
  { prefix: '/api/user/places', key: 'places' },
  { prefix: '/gallery', key: 'gallery' },
  { prefix: '/api/user/gallery', key: 'gallery' },
  { prefix: '/projects', key: 'projects' },
  { prefix: '/clubs', key: 'clubs' },
  { prefix: '/spaces', key: 'spaces' },
  { prefix: '/grants', key: 'grants' },
  { prefix: '/dobro', key: 'dobro' },
  { prefix: '/self-gov', key: 'self_gov' },
  { prefix: '/vacancies', key: 'vacancies' },
  { prefix: '/api/vacancies', key: 'vacancies' },
  { prefix: '/api/employers', key: 'vacancies' },
  { prefix: '/admin/vacancies', key: 'vacancies' },
  { prefix: '/contests', key: 'contests' },
  { prefix: '/api/contests', key: 'contests' },
  { prefix: '/admin/contests', key: 'contests' },
  { prefix: '/friends', key: 'friends' },
  { prefix: '/api/friends', key: 'friends' },
  { prefix: '/games', key: 'games' },
  { prefix: '/dashboard/games', key: 'games' },
  { prefix: '/api/games', key: 'games' },
  { prefix: '/api/user/games', key: 'games' },
  { prefix: '/news', key: 'news' },
  { prefix: '/api/news', key: 'news' },
  { prefix: '/portfolio', key: 'portfolio' },
  { prefix: '/dashboard/portfolio', key: 'portfolio' },
  { prefix: '/api/portfolio', key: 'portfolio' },
  { prefix: '/api/user/portfolio', key: 'portfolio' },
  { prefix: '/dashboard/shop', key: 'eco' },
  { prefix: '/api/user/eco', key: 'eco' },
  { prefix: '/api/user/collectibles', key: 'eco' },
  { prefix: '/api/eco', key: 'eco' },
  { prefix: '/api/admin/eco', key: 'eco' },
  { prefix: '/dashboard/achievements', key: 'achievements' },
  { prefix: '/dashboard/awards', key: 'achievements' },
  { prefix: '/api/user/achievements', key: 'achievements' },
  { prefix: '/api/user/awards', key: 'achievements' },
  { prefix: '/api/awards', key: 'achievements' },
  { prefix: '/api/admin/awards', key: 'achievements' },
  { prefix: '/api/user/reputation', key: 'ratings' },
  { prefix: '/api/group-chat', key: 'club_chat' },
  { prefix: '/dashboard/applications', key: 'applications' },
  { prefix: '/api/applications', key: 'applications' },
  { prefix: '/api/user/applications', key: 'applications' },
  { prefix: '/dashboard/notifications', key: 'notifications' },
  { prefix: '/api/user/notifications', key: 'notifications' },
  { prefix: '/api/user/notification-prefs', key: 'notifications' },
  { prefix: '/api/user/push', key: 'notifications' },
  { prefix: '/documents', key: 'documents' },
  { prefix: '/api/documents', key: 'documents' },
  { prefix: '/dashboard/referrals', key: 'referrals' },
  { prefix: '/api/referrals', key: 'referrals' },
  { prefix: '/faq', key: 'faq' },
  { prefix: '/presentation', key: 'presentation' },
  { prefix: '/downloads/youngportal-presentation', key: 'presentation' },
  { prefix: '/admin/system', key: 'server_status' },
  { prefix: '/api/admin/system', key: 'server_status' },
  { prefix: '/admin/bots', key: 'bots' },
  { prefix: '/api/admin/bots', key: 'bots' },
  { prefix: '/api/integrations/telegram', key: 'bots' },
  { prefix: '/api/integrations/max', key: 'bots' },
  { prefix: '/api/public/bots', key: 'bots' },
];

export function moduleKeyForPath(pathname: string): ModuleFlagKey | null {
  for (const rule of PATH_MODULE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.key;
    }
  }
  return null;
}

export function getOffModeForKey(offModes: ModuleOffModes, key: ModuleFlagKey): ModuleOffMode {
  return offModes[key] === 'soon' ? 'soon' : 'hide';
}

async function readBundleFromDb(): Promise<CacheBundle> {
  const row = await prisma.siteSettings
    .findUnique({
      where: { id: '1' },
      select: {
        moduleFlagsJson: true,
        maintenanceMode: true,
      },
    })
    .catch(() => null);

  const bundle = parseModuleFlagsBundle(row?.moduleFlagsJson);
  // true = site operating normally; false = maintenance mode on
  if (row) bundle.flags.maintenance = !row.maintenanceMode;
  return bundle;
}

async function readCachedBundle(): Promise<CacheBundle> {
  if (isNextBuildPhase() || process.env.MODULE_FLAGS_FORCE_ON === '1') {
    return { flags: defaultModuleFlags(), offModes: {} };
  }

  const now = Date.now();
  if (MEM.bundle && now - MEM.at < CACHE_TTL_SEC * 1000) {
    return {
      flags: { ...MEM.bundle.flags },
      offModes: { ...MEM.bundle.offModes },
    };
  }

  const redis = getSharedRedis();
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        const bundle = parseModuleFlagsBundle(cached);
        MEM.bundle = bundle;
        MEM.at = now;
        return {
          flags: { ...bundle.flags },
          offModes: { ...bundle.offModes },
        };
      }
    } catch {
      /* fall through */
    }
  }

  const bundle = await readBundleFromDb();
  MEM.bundle = bundle;
  MEM.at = now;
  if (redis) {
    try {
      const payload: Record<string, unknown> = {};
      for (const k of MODULE_FLAG_KEYS) {
        if (k === 'maintenance') continue;
        payload[k] = bundle.flags[k] !== false;
      }
      if (Object.keys(bundle.offModes).length) {
        payload.__offModes = bundle.offModes;
      }
      await redis.set(CACHE_KEY, JSON.stringify(payload), 'EX', CACHE_TTL_SEC);
    } catch {
      /* ignore */
    }
  }
  return {
    flags: { ...bundle.flags },
    offModes: { ...bundle.offModes },
  };
}

export async function getModuleFlags(): Promise<ModuleFlags> {
  const { flags } = await readCachedBundle();
  return flags;
}

export async function getModuleOffModes(): Promise<ModuleOffModes> {
  const { offModes } = await readCachedBundle();
  return offModes;
}

export async function getModuleFlagsBundle(): Promise<CacheBundle> {
  return readCachedBundle();
}

export async function invalidateModuleFlagsCache() {
  MEM.bundle = null;
  MEM.at = 0;
  const redis = getSharedRedis();
  if (redis) {
    try {
      await redis.del(CACHE_KEY);
      await redis.del('yp:module-flags:v1');
    } catch {
      /* ignore */
    }
  }
  try {
    const { revalidateTag } = await import('next/cache');
    revalidateTag('yp-site-chrome', 'max');
    revalidateTag('yp-home-catalog', 'max');
  } catch {
    /* ignore outside Next runtime */
  }
}

export async function isModuleEnabled(key: ModuleFlagKey, role?: string | null): Promise<boolean> {
  if (isTechRole(role)) return true;
  if (process.env.MODULE_FLAGS_FORCE_ON === '1') return true;
  const flags = await getModuleFlags();
  return flags[key] !== false;
}

export class ModuleDisabledError extends Error {
  key: ModuleFlagKey;
  status = 503;
  constructor(key: ModuleFlagKey) {
    super(`Модуль «${MODULE_FLAG_META[key]?.label || key}» временно отключён`);
    this.key = key;
  }
}

export async function assertModuleEnabled(key: ModuleFlagKey, role?: string | null) {
  if (!(await isModuleEnabled(key, role))) {
    throw new ModuleDisabledError(key);
  }
}

export function moduleDisabledJson(key: ModuleFlagKey) {
  return {
    message: `Модуль «${MODULE_FLAG_META[key]?.label || key}» временно отключён`,
    code: 'MODULE_DISABLED',
    module: key,
  };
}

/**
 * Persist flags from TECH ops. Syncs registration/messaging/maintenance legacy columns.
 * Preserves/updates `__offModes` inside moduleFlagsJson.
 */
export async function setModuleFlags(
  nextPartial: Partial<Record<ModuleFlagKey, boolean>>,
  actorId: string,
  offModesPartial?: ModuleOffModes
): Promise<{ prev: ModuleFlags; next: ModuleFlags; offModes: ModuleOffModes }> {
  const prevBundle = await readCachedBundle();
  const prev = prevBundle.flags;
  const next: ModuleFlags = { ...prev, ...nextPartial };

  const offModes: ModuleOffModes = { ...prevBundle.offModes };
  if (offModesPartial) {
    for (const k of MODULE_FLAG_KEYS) {
      if (k in offModesPartial) {
        const m = normalizeOffMode(offModesPartial[k]);
        if (m) offModes[k] = m;
        else delete offModes[k];
      }
    }
  }
  // Drop off-mode for modules that are enabled
  for (const k of MODULE_FLAG_KEYS) {
    if (next[k] !== false) delete offModes[k];
  }

  const jsonPayload: Record<string, unknown> = {};
  for (const k of MODULE_FLAG_KEYS) {
    if (k === 'maintenance') continue;
    jsonPayload[k] = next[k] !== false;
  }
  if (Object.keys(offModes).length) {
    jsonPayload.__offModes = offModes;
  }

  const maintenanceMode = next.maintenance === false;

  await prisma.siteSettings.update({
    where: { id: '1' },
    data: {
      moduleFlagsJson: JSON.stringify(jsonPayload),
      maintenanceMode,
      registrationEnabled: next.registration !== false,
      messagingEnabled: next.messaging !== false,
      galleryPageEnabled: next.gallery !== false,
    },
  });

  await invalidateModuleFlagsCache();

  const changed = MODULE_FLAG_KEYS.filter((k) => prev[k] !== next[k]);
  try {
    await prisma.loginEvent.create({
      data: {
        userId: actorId,
        kind: 'OPS_FLAGS',
        success: true,
        deviceLabel: changed.length ? changed.map((k) => `${k}:${next[k] ? 'on' : 'off'}`).join(',') : 'noop',
      },
    });
  } catch (e) {
    console.info('[ops-flags]', actorId, changed, (e as Error)?.message);
  }

  const refreshed = await readCachedBundle();
  return { prev, next: refreshed.flags, offModes: refreshed.offModes };
}
