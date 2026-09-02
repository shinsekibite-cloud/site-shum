export type AchievementTier = 'bronze' | 'silver' | 'gold';

export type AchievementCategory =
  | 'profile'
  | 'events'
  | 'social'
  | 'eco'
  | 'places'
  | 'games'
  | 'portfolio'
  | 'career'
  | 'contests'
  | 'meta';

export type AchievementDef = {
  code: string;
  title: string;
  description: string;
  tier: AchievementTier;
  category: AchievementCategory;
  /** lucide icon name key used by UI */
  icon:
    | 'Sparkles'
    | 'Ticket'
    | 'QrCode'
    | 'Shield'
    | 'Users'
    | 'Flame'
    | 'Star'
    | 'Heart'
    | 'MapPin'
    | 'Award'
    | 'Zap'
    | 'Crown'
    | 'MessageCircle'
    | 'Camera'
    | 'Compass'
    | 'CalendarCheck'
    | 'Building2'
    | 'Medal'
    | 'Rocket'
    | 'Eye'
    | 'Gamepad2'
    | 'Puzzle'
    | 'Target'
    | 'BookOpen'
    | 'BadgeCheck'
    | 'Briefcase'
    | 'Leaf'
    | 'Handshake';
  accent: string;
};

export const TIER_META: Record<
  AchievementTier,
  { label: string; color: string; bg: string; order: number; ecoReward: number }
> = {
  bronze: { label: 'Бронза', color: '#b45309', bg: 'rgba(180,83,9,0.12)', order: 1, ecoReward: 5 },
  silver: { label: 'Серебро', color: '#64748b', bg: 'rgba(100,116,139,0.14)', order: 2, ecoReward: 15 },
  gold: { label: 'Золото', color: '#ca8a04', bg: 'rgba(202,138,4,0.14)', order: 3, ecoReward: 40 },
};

/** Eco points granted when unlocking an achievement of this tier. */
export function ecoRewardForTier(tier: AchievementTier) {
  return TIER_META[tier]?.ecoReward ?? 5;
}

export const CATEGORY_META: Record<
  AchievementCategory,
  { label: string; short: string; order: number }
> = {
  profile: { label: 'Профиль', short: 'Профиль', order: 1 },
  events: { label: 'Афиша и площадки', short: 'Афиша', order: 2 },
  social: { label: 'Друзья и общение', short: 'Друзья', order: 3 },
  eco: { label: 'Эко и забота', short: 'Эко', order: 4 },
  places: { label: 'Куда сходить', short: 'Места', order: 5 },
  games: { label: 'Игры', short: 'Игры', order: 6 },
  portfolio: { label: 'Портфолио', short: 'Портфолио', order: 7 },
  career: { label: 'Карьера', short: 'Карьера', order: 8 },
  contests: { label: 'Конкурсы', short: 'Конкурсы', order: 9 },
  meta: { label: 'Особые', short: 'Особые', order: 10 },
};

export const CATEGORY_ORDER = (
  Object.keys(CATEGORY_META) as AchievementCategory[]
).sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order);

function inferCategory(code: string): AchievementCategory {
  if (code.startsWith('JOB_')) return 'career';
  if (code.startsWith('CONTEST_') || code.startsWith('RAFFLE_')) return 'contests';
  if (code.startsWith('ECO_') || code.startsWith('VIEW_') || code.startsWith('CARD_') || code.startsWith('LEVEL_')) return 'eco';
  if (code.startsWith('PLACE_')) return 'places';
  if (code.startsWith('PORTFOLIO_') || code.startsWith('OFFICIAL_') || code === 'FIRST_OFFICIAL_DOC') return 'portfolio';
  if (
    /^(SNAKE_|TETRIS_|CHECKERS_|BREAKOUT_|MEMORY_|FIFTEEN_|GAME_|SECRET_MENU)/.test(code)
  ) {
    return 'games';
  }
  if (/^(FIRST_FRIEND|FIRST_MESSAGE|FRIENDS_|TRUSTED_CIRCLE|MESSAGES_|EVENT_INVITE|PLACE_INVITE|SHARED_EVENT|ENTITY_)/.test(code)) {
    return 'social';
  }
  if (
    /^(EVENT_|CHECKED_|SPACE_|ACTIVE_|SCAN_|JOIN_|RELIABLE|STAR_|LOYAL|HOST_|COMMUNITY|APP_ACCEPTED)/.test(
      code
    )
  ) {
    return 'events';
  }
  if (code === 'BRONZE_SET' || code === 'LEGEND') return 'meta';
  return 'profile';
}

type AchievementSeed = Omit<AchievementDef, 'category'>;

const ACHIEVEMENTS_SEED: AchievementSeed[] = [
  // —— Бронза: лёгкий вход ——
  {
    code: 'FIRST_STEPS',
    title: 'Первые шаги',
    description: 'Зарегистрировались на портале',
    tier: 'bronze',
    icon: 'Sparkles',
    accent: '#b45309',
  },
  {
    code: 'PRIVACY_OK',
    title: 'По делу',
    description: 'Подтвердили политику конфиденциальности',
    tier: 'bronze',
    icon: 'BookOpen',
    accent: '#b45309',
  },
  {
    code: 'RULES_OK',
    title: 'По правилам',
    description: 'Приняли правила сайта при регистрации',
    tier: 'bronze',
    icon: 'Shield',
    accent: '#b45309',
  },
  {
    code: 'VIBE_ON',
    title: 'О себе',
    description: 'Написали пару слов в статусе профиля',
    tier: 'bronze',
    icon: 'MessageCircle',
    accent: '#b45309',
  },
  {
    code: 'FACE_ON',
    title: 'Лицо портала',
    description: 'Добавили фото в профиль',
    tier: 'bronze',
    icon: 'Camera',
    accent: '#b45309',
  },
  {
    code: 'GALLERY_SHOT',
    title: 'Кадр в галерею',
    description: 'Добавили первое фото в личную галерею',
    tier: 'bronze',
    icon: 'Camera',
    accent: '#0d9488',
  },
  {
    code: 'CITY_SET',
    title: 'Свой город',
    description: 'Указали город в профиле',
    tier: 'bronze',
    icon: 'Compass',
    accent: '#b45309',
  },
  {
    code: 'GENDER_SET',
    title: 'Как обращаться',
    description: 'Указали пол в профиле',
    tier: 'bronze',
    icon: 'Users',
    accent: '#b45309',
  },
  {
    code: 'EVENT_JOIN',
    title: 'В деле',
    description: 'Записались на первое мероприятие',
    tier: 'bronze',
    icon: 'Ticket',
    accent: '#b45309',
  },
  {
    code: 'SECRET_MENU',
    title: 'Нашли секрет',
    description: 'Открыли скрытое меню игр (5 тапов по логотипу)',
    tier: 'bronze',
    icon: 'Eye',
    accent: '#b45309',
  },
  {
    code: 'MODERN_USER',
    title: 'Современный человек',
    description: 'Освоили быстрый доступ (⚡) на своём устройстве',
    tier: 'bronze',
    icon: 'Zap',
    accent: '#b45309',
  },
  {
    code: 'INSTRUCTED',
    title: 'Инструктаж пройден',
    description: 'Ознакомились со всеми актуальными инструкциями в профиле',
    tier: 'bronze',
    icon: 'BadgeCheck',
    accent: '#0d9488',
  },
  {
    code: 'SNAKE_PLAY',
    title: 'Змейка',
    description: 'Сыграли партию в змейку',
    tier: 'bronze',
    icon: 'Gamepad2',
    accent: '#b45309',
  },
  {
    code: 'TETRIS_PLAY',
    title: 'Тетрис',
    description: 'Сыграли партию в тетрис',
    tier: 'bronze',
    icon: 'Puzzle',
    accent: '#b45309',
  },

  // —— Серебро: активность ——
  {
    code: 'CHECKED_IN',
    title: 'На месте',
    description: 'Отметили присутствие по QR на входе',
    tier: 'silver',
    icon: 'QrCode',
    accent: '#64748b',
  },
  {
    code: 'COMMUNITY',
    title: 'В сообществе',
    description: 'Подали заявку в проект или клуб',
    tier: 'silver',
    icon: 'Users',
    accent: '#64748b',
  },
  {
    code: 'SPACE_HOST',
    title: 'Хозяин площадки',
    description: 'Забронировали пространство',
    tier: 'silver',
    icon: 'MapPin',
    accent: '#64748b',
  },
  {
    code: 'PROFILE_PRO',
    title: 'Профиль на 100',
    description: 'Заполнили город, статус, увлечения и интересы',
    tier: 'silver',
    icon: 'Zap',
    accent: '#64748b',
  },
  {
    code: 'GALLERY_PRO',
    title: 'Свой альбом',
    description: 'Собрали 5+ фото в личной галерее',
    tier: 'silver',
    icon: 'Camera',
    accent: '#64748b',
  },
  {
    code: 'ACTIVE_5',
    title: 'Активист',
    description: 'Посетили 5 мероприятий',
    tier: 'silver',
    icon: 'Flame',
    accent: '#64748b',
  },
  {
    code: 'SCAN_3',
    title: 'Постоянный гость',
    description: 'Три раза отметились по QR',
    tier: 'silver',
    icon: 'CalendarCheck',
    accent: '#64748b',
  },
  {
    code: 'JOIN_3',
    title: 'В календаре',
    description: 'Записались на 3 мероприятия',
    tier: 'silver',
    icon: 'Rocket',
    accent: '#64748b',
  },
  {
    code: 'CHECKERS_PLAY',
    title: 'Шашист',
    description: 'Сыграли партию в шашки',
    tier: 'silver',
    icon: 'Target',
    accent: '#64748b',
  },
  {
    code: 'BREAKOUT_PLAY',
    title: 'Арканоид',
    description: 'Сыграли партию в арканоид',
    tier: 'bronze',
    icon: 'Gamepad2',
    accent: '#b45309',
  },
  {
    code: 'MEMORY_PLAY',
    title: 'Память',
    description: 'Сыграли партию в «Память»',
    tier: 'bronze',
    icon: 'Puzzle',
    accent: '#b45309',
  },
  {
    code: 'SNAKE_50',
    title: 'Хвост растёт',
    description: 'Набрали 50 очков в змейке',
    tier: 'silver',
    icon: 'Gamepad2',
    accent: '#64748b',
  },
  {
    code: 'TETRIS_800',
    title: 'Линии в ряд',
    description: 'Набрали 800 очков в тетрисе',
    tier: 'silver',
    icon: 'Puzzle',
    accent: '#64748b',
  },
  {
    code: 'GAME_TRIO',
    title: 'Три в ряд',
    description: 'Сыграли минимум в три офлайн-игры',
    tier: 'silver',
    icon: 'Gamepad2',
    accent: '#64748b',
  },
  {
    code: 'BREAKOUT_800',
    title: 'Кирпич за кирпичом',
    description: 'Набрали 800 очков в арканоиде',
    tier: 'silver',
    icon: 'Gamepad2',
    accent: '#64748b',
  },
  {
    code: 'MEMORY_500',
    title: 'Острый глаз',
    description: 'Набрали 500 очков в «Памяти»',
    tier: 'silver',
    icon: 'Puzzle',
    accent: '#64748b',
  },
  {
    code: 'FIRST_FRIEND',
    title: 'Первый друг',
    description: 'Добавили друга на портале',
    tier: 'silver',
    icon: 'Users',
    accent: '#64748b',
  },
  {
    code: 'FIRST_MESSAGE',
    title: 'На связи',
    description: 'Отправили личное сообщение',
    tier: 'silver',
    icon: 'MessageCircle',
    accent: '#64748b',
  },
  {
    code: 'PORTFOLIO_START',
    title: 'Моё портфолио',
    description: 'Создали черновик портфолио в кабинете',
    tier: 'bronze',
    icon: 'Briefcase',
    accent: '#f59e0b',
  },
  {
    code: 'PORTFOLIO_LIVE',
    title: 'Портфолио на витрине',
    description: 'Портфолио одобрено и опубликовано',
    tier: 'silver',
    icon: 'Briefcase',
    accent: '#64748b',
  },
  {
    code: 'PLACE_FIRST',
    title: 'Первая точка',
    description: 'Добавили место Сочи в избранное',
    tier: 'bronze',
    icon: 'MapPin',
    accent: '#0d9488',
  },
  {
    code: 'PLACE_RATED',
    title: 'Оценка места',
    description: 'Поставили оценку месту в каталоге',
    tier: 'bronze',
    icon: 'Star',
    accent: '#d97706',
  },
  {
    code: 'PLACE_EXPLORER',
    title: 'Исследователь Сочи',
    description: 'Пять мест в избранном',
    tier: 'silver',
    icon: 'Compass',
    accent: '#0d9488',
  },
  {
    code: 'PLACE_REVIEWER',
    title: 'Отзыв принят',
    description: 'Опубликован ваш отзыв о месте',
    tier: 'silver',
    icon: 'MessageCircle',
    accent: '#64748b',
  },
  {
    code: 'APP_ACCEPTED',
    title: 'Приняты',
    description: 'Хотя бы одну заявку одобрили (проект, клуб или программа)',
    tier: 'silver',
    icon: 'BadgeCheck',
    accent: '#64748b',
  },
  {
    code: 'FRIENDS_3',
    title: 'Круг общения',
    description: 'Трое принятых друзей на портале',
    tier: 'silver',
    icon: 'Users',
    accent: '#64748b',
  },
  {
    code: 'EVENT_INVITE',
    title: 'Позвать с собой',
    description: 'Пригласили друга на мероприятие в афише',
    tier: 'silver',
    icon: 'CalendarCheck',
    accent: '#2563eb',
  },
  {
    code: 'PLACE_INVITE',
    title: 'Сходим вместе',
    description: 'Пригласили друга в место из «Куда сходить»',
    tier: 'bronze',
    icon: 'MapPin',
    accent: '#0d9488',
  },
  {
    code: 'ENTITY_INVITE',
    title: 'Зовём в команду',
    description: 'Пригласили друга в проект или клуб',
    tier: 'bronze',
    icon: 'Handshake',
    accent: '#2563eb',
  },
  {
    code: 'ENTITY_JOIN',
    title: 'В составе',
    description: 'Приняли приглашение в проект или клуб',
    tier: 'bronze',
    icon: 'Users',
    accent: '#2563eb',
  },

  {
    code: 'VIEW_CURIOUS',
    title: 'Любопытный',
    description: 'Открыли первую карточку контента (уникальный просмотр)',
    tier: 'bronze',
    icon: 'Eye',
    accent: '#0ea5e9',
  },
  {
    code: 'VIEW_TOURIST',
    title: 'Турист портала',
    description: '10 уникальных просмотров проектов, клубов, мест и других карточек',
    tier: 'silver',
    icon: 'Compass',
    accent: '#0284c7',
  },
  {
    code: 'VIEW_CARTOGRAPHER',
    title: 'Картограф',
    description: '50 уникальных просмотров карточек на портале',
    tier: 'gold',
    icon: 'MapPin',
    accent: '#0369a1',
  },
  {
    code: 'ECO_COLLECTOR',
    title: 'Коллекционер',
    description: 'Купили 3 предмета за мбаллы',
    tier: 'silver',
    icon: 'Sparkles',
    accent: '#16a34a',
  },
  {
    code: 'ECO_STYLIST',
    title: 'Стилист',
    description: 'Надели голосовой стиль интерфейса',
    tier: 'silver',
    icon: 'MessageCircle',
    accent: '#15803d',
  },
  {
    code: 'ECO_STARTER',
    title: 'Эко-старт',
    description: 'Получили первые мбаллы за активность',
    tier: 'bronze',
    icon: 'Leaf',
    accent: '#16a34a',
  },
  {
    code: 'ECO_GARDENER',
    title: 'Садовник',
    description: 'Накопили 50+ мбаллов или купили косметику',
    tier: 'silver',
    icon: 'Leaf',
    accent: '#15803d',
  },
  {
    code: 'MESSAGES_25',
    title: 'Живой чат',
    description: 'Отправили 25 личных сообщений',
    tier: 'silver',
    icon: 'MessageCircle',
    accent: '#64748b',
  },

  // —— Золото: элита ——
  {
    code: 'RELIABLE',
    title: 'Надёжный',
    description: 'Рейтинг ≥ 95% и минимум 3 посещения',
    tier: 'gold',
    icon: 'Shield',
    accent: '#ca8a04',
  },
  {
    code: 'STAR_10',
    title: 'Звезда афиши',
    description: 'Посетили 10 мероприятий',
    tier: 'gold',
    icon: 'Star',
    accent: '#ca8a04',
  },
  {
    code: 'LOYAL',
    title: 'Свой человек',
    description: 'Рейтинг 100% при 5+ посещениях без пропусков',
    tier: 'gold',
    icon: 'Heart',
    accent: '#ca8a04',
  },
  {
    code: 'HOST_PRO',
    title: 'Организатор',
    description: 'Забронировали пространство 3 раза',
    tier: 'gold',
    icon: 'Building2',
    accent: '#ca8a04',
  },
  {
    code: 'TRUSTED_CIRCLE',
    title: 'Круг доверия',
    description: '3 друга и общение на портале',
    tier: 'gold',
    icon: 'Heart',
    accent: '#ca8a04',
  },
  {
    code: 'FRIENDS_10',
    title: 'Большой круг',
    description: 'Десять принятых друзей',
    tier: 'gold',
    icon: 'Users',
    accent: '#ca8a04',
  },
  {
    code: 'SHARED_EVENT',
    title: 'Вместе на событии',
    description: 'Были на одном мероприятии с другом',
    tier: 'gold',
    icon: 'CalendarCheck',
    accent: '#ca8a04',
  },
  {
    code: 'SNAKE_120',
    title: 'Длинный хвост',
    description: 'Набрали 120 очков в змейке',
    tier: 'gold',
    icon: 'Gamepad2',
    accent: '#ca8a04',
  },
  {
    code: 'TETRIS_2500',
    title: 'Мастер блоков',
    description: 'Набрали 2500 очков в тетрисе',
    tier: 'gold',
    icon: 'Puzzle',
    accent: '#ca8a04',
  },
  {
    code: 'CHECKERS_WIN',
    title: 'Победа на доске',
    description: 'Выиграли партию в шашки у компьютера',
    tier: 'gold',
    icon: 'Target',
    accent: '#ca8a04',
  },
  {
    code: 'BREAKOUT_LEADER',
    title: 'Лидер арканоида',
    description: 'Заняли 1 место в таблице почёта арканоида',
    tier: 'gold',
    icon: 'Crown',
    accent: '#ca8a04',
  },
  {
    code: 'MEMORY_LEADER',
    title: 'Лидер «Памяти»',
    description: 'Заняли 1 место в таблице почёта «Памяти»',
    tier: 'gold',
    icon: 'Crown',
    accent: '#ca8a04',
  },
  {
    code: 'SNAKE_LEADER',
    title: 'Лидер змейки',
    description: 'Заняли 1 место в таблице почёта змейки',
    tier: 'gold',
    icon: 'Crown',
    accent: '#ca8a04',
  },
  {
    code: 'TETRIS_LEADER',
    title: 'Лидер тетриса',
    description: 'Заняли 1 место в таблице почёта тетриса',
    tier: 'gold',
    icon: 'Crown',
    accent: '#ca8a04',
  },
  {
    code: 'CHECKERS_LEADER',
    title: 'Лидер шашек',
    description: 'Лучшее время победы на любом уровне сложности',
    tier: 'gold',
    icon: 'Crown',
    accent: '#ca8a04',
  },
  {
    code: 'JOB_FIRST_APPLY',
    title: 'Первый отклик',
    description: 'Прошли авто-скрининг по вакансии',
    tier: 'bronze',
    icon: 'Briefcase',
    accent: '#0f766e',
  },
  {
    code: 'JOB_HIRED',
    title: 'Приглашены',
    description: 'Отклик на вакансию одобрен',
    tier: 'silver',
    icon: 'Briefcase',
    accent: '#0f766e',
  },
  {
    code: 'CONTEST_SUBMIT',
    title: 'Участник конкурса',
    description: 'Подали работу на конкурс',
    tier: 'bronze',
    icon: 'Medal',
    accent: '#b45309',
  },
  {
    code: 'CONTEST_WIN',
    title: 'Победитель конкурса',
    description: 'Победа в конкурсе работ',
    tier: 'gold',
    icon: 'Crown',
    accent: '#ca8a04',
  },
  {
    code: 'RAFFLE_LUCKY',
    title: 'Счастливчик',
    description: 'Выиграли розыгрыш',
    tier: 'gold',
    icon: 'Sparkles',
    accent: '#7c3aed',
  },
  {
    code: 'FIFTEEN_PLAY',
    title: 'Пятнашки',
    description: 'Собрали поле хотя бы раз',
    tier: 'bronze',
    icon: 'Puzzle',
    accent: '#06b6d4',
  },
  {
    code: 'FIFTEEN_HARD',
    title: '5×5 покорены',
    description: 'Собрали пятнашки на сложном поле',
    tier: 'silver',
    icon: 'Puzzle',
    accent: '#0891b2',
  },
  {
    code: 'FIFTEEN_LEADER',
    title: 'Король пятнашек',
    description: 'Лучший результат на портале в пятнашках',
    tier: 'gold',
    icon: 'Crown',
    accent: '#06b6d4',
  },
  {
    code: 'CARD_FIRST',
    title: 'Первая карта',
    description: 'Открыли коллекционную карточку',
    tier: 'bronze',
    icon: 'Sparkles',
    accent: '#a855f7',
  },
  {
    code: 'CARD_PACK',
    title: 'Охотник за паками',
    description: 'Открыли 3 пака карточек',
    tier: 'silver',
    icon: 'Sparkles',
    accent: '#8b5cf6',
  },
  {
    code: 'CARD_RARE',
    title: 'Редкий дроп',
    description: 'Получили редкую или выше карту',
    tier: 'silver',
    icon: 'Star',
    accent: '#38bdf8',
  },
  {
    code: 'CARD_SHOWCASE',
    title: 'Витрина',
    description: 'Выставили карту на витрину профиля',
    tier: 'bronze',
    icon: 'Award',
    accent: '#c084fc',
  },
  {
    code: 'CARD_SET',
    title: 'Коллекционер Сочи',
    description: 'Собрали 10+ уникальных карт',
    tier: 'gold',
    icon: 'Medal',
    accent: '#f59e0b',
  },
  {
    code: 'LEVEL_3',
    title: 'Участник волны',
    description: 'Достигли 3 уровня — вы уже в сообществе',
    tier: 'bronze',
    icon: 'Rocket',
    accent: '#0ea5e9',
  },
  {
    code: 'LEVEL_5',
    title: 'Активист портала',
    description: 'Достигли 5 уровня профиля',
    tier: 'silver',
    icon: 'Rocket',
    accent: '#0284c7',
  },
  {
    code: 'LEVEL_6',
    title: 'Навигатор',
    description: 'Достигли 6 уровня — на вас ориентируются',
    tier: 'silver',
    icon: 'Compass',
    accent: '#0369a1',
  },
  {
    code: 'LEVEL_8',
    title: 'Хранитель сообщества',
    description: 'Достигли 8 уровня профиля',
    tier: 'gold',
    icon: 'Leaf',
    accent: '#059669',
  },
  {
    code: 'LEVEL_10',
    title: 'Легенда портала',
    description: 'Достигли максимального 10 уровня',
    tier: 'gold',
    icon: 'Crown',
    accent: '#ea580c',
  },
  {
    code: 'ECO_SPENDER',
    title: 'Свой стиль',
    description: 'Купили 5 предметов за мбаллы',
    tier: 'silver',
    icon: 'Leaf',
    accent: '#22c55e',
  },
    {
    code: 'FIRST_OFFICIAL_DOC',
    title: 'Официальная награда',
    description: 'Получили диплом, сертификат, грамоту или благодарность от администрации',
    tier: 'silver',
    icon: 'Award',
    accent: '#0f766e',
  },
  {
    code: 'OFFICIAL_DIPLOMA',
    title: 'Дипломант',
    description: 'Вам выдан официальный диплом портала',
    tier: 'gold',
    icon: 'Medal',
    accent: '#0e7490',
  },
  {
    code: 'OFFICIAL_CERTIFICATE',
    title: 'Сертифицирован',
    description: 'Получили официальный сертификат',
    tier: 'silver',
    icon: 'BadgeCheck',
    accent: '#2563eb',
  },
  {
    code: 'OFFICIAL_GRATITUDE',
    title: 'Благодарность',
    description: 'Администрация выразила официальную благодарность',
    tier: 'bronze',
    icon: 'Handshake',
    accent: '#b45309',
  },
  {
    code: 'OFFICIAL_HONORARY',
    title: 'Почётный участник',
    description: 'Получили почётную грамоту',
    tier: 'gold',
    icon: 'Crown',
    accent: '#b91c1c',
  },
  {
    code: 'BRONZE_SET',
    title: 'Бронзовый комплект',
    description: 'Собрали все бронзовые достижения',
    tier: 'gold',
    icon: 'Medal',
    accent: '#ca8a04',
  },
  {
    code: 'LEGEND',
    title: 'Легенда Сочи',
    description: 'Собрали все остальные достижения',
    tier: 'gold',
    icon: 'Crown',
    accent: '#ca8a04',
  },
];

export const ACHIEVEMENTS: AchievementDef[] = ACHIEVEMENTS_SEED.map((a) => ({
  ...a,
  category: inferCategory(a.code),
}));

export function getAchievement(code: string) {
  return ACHIEVEMENTS.find((a) => a.code === code);
}

export function achievementCategory(code: string): AchievementCategory {
  return getAchievement(code)?.category || inferCategory(code);
}

/** Group items that have a `code` into ordered category buckets. */
export function groupByAchievementCategory<T extends { code: string }>(
  items: T[]
): Array<{ category: AchievementCategory; label: string; items: T[] }> {
  const buckets = new Map<AchievementCategory, T[]>();
  for (const item of items) {
    const cat = achievementCategory(item.code);
    const list = buckets.get(cat) || [];
    list.push(item);
    buckets.set(cat, list);
  }
  return CATEGORY_ORDER.filter((c) => (buckets.get(c)?.length || 0) > 0).map((category) => ({
    category,
    label: CATEGORY_META[category].label,
    items: buckets.get(category) || [],
  }));
}

/** Achievements that count toward LEGEND (all except LEGEND itself) */
export const LEGEND_REQUIREMENTS = ACHIEVEMENTS.filter((a) => a.code !== 'LEGEND').map((a) => a.code);

/** Bronze codes for BRONZE_SET meta-achievement */
export const BRONZE_CODES = ACHIEVEMENTS.filter((a) => a.tier === 'bronze').map((a) => a.code);

export function achievementProgress(unlockedCodes: string[]) {
  const set = new Set(unlockedCodes);
  // LEGEND is a capstone — counted in gold tier badge, not in overall % ring
  const countable = ACHIEVEMENTS.filter((a) => a.code !== 'LEGEND');
  const unlocked = countable.filter((a) => set.has(a.code)).length;
  const total = countable.length;
  const percent = total ? Math.round((unlocked / total) * 100) : 0;
  const byTier = (tier: AchievementTier) => {
    // Include LEGEND in gold so badge matches the gold filter list
    const list = ACHIEVEMENTS.filter((a) => a.tier === tier);
    const done = list.filter((a) => set.has(a.code)).length;
    return { done, total: list.length, percent: list.length ? Math.round((done / list.length) * 100) : 0 };
  };
  return {
    unlocked,
    total,
    percent,
    complete: percent >= 100,
    bronze: byTier('bronze'),
    silver: byTier('silver'),
    gold: byTier('gold'),
  };
}
