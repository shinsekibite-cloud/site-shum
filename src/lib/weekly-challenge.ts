/** Ротирующийся недельный челлендж — без БД, по номеру недели */

export type WeeklyChallenge = {
  id: string;
  title: string;
  hint: string;
  emoji: string;
  /** код достижения, к которому привязан прогресс (опционально) */
  relatedAchievement?: string;
  /** как измеряем прогресс на клиенте */
  metric: 'attended' | 'participations' | 'applications' | 'bio' | 'profile' | 'checkins';
  target: number;
};

const CHALLENGES: WeeklyChallenge[] = [
  {
    id: 'go-out',
    title: 'Выйди в город',
    hint: 'Запишись хотя бы на одно мероприятие на этой неделе',
    emoji: '🎧',
    relatedAchievement: 'EVENT_JOIN',
    metric: 'participations',
    target: 1,
  },
  {
    id: 'show-up',
    title: 'Не фейл',
    hint: 'Приди и отметь QR — докажи, что ты не ноу-шоу',
    emoji: '📸',
    relatedAchievement: 'CHECKED_IN',
    metric: 'checkins',
    target: 1,
  },
  {
    id: 'vibe',
    title: 'Расскажи о себе',
    hint: 'Напиши свежий статус в профиле',
    emoji: '✨',
    relatedAchievement: 'VIBE_ON',
    metric: 'bio',
    target: 1,
  },
  {
    id: 'crew',
    title: 'Найди свою тусовку',
    hint: 'Подай заявку в клуб или проект',
    emoji: '🤝',
    relatedAchievement: 'COMMUNITY',
    metric: 'applications',
    target: 1,
  },
  {
    id: 'flex',
    title: 'Профиль на максимум',
    hint: 'Город + статус + увлечения + интересы',
    emoji: '🔥',
    relatedAchievement: 'PROFILE_PRO',
    metric: 'profile',
    target: 1,
  },
  {
    id: 'streak',
    title: 'Двойной заход',
    hint: 'Посети 2 мероприятия (накопительно)',
    emoji: '⚡',
    metric: 'attended',
    target: 2,
  },
  {
    id: 'face',
    title: 'Покажись',
    hint: 'Добавь фото в профиль — узнают на мероприятиях',
    emoji: '📷',
    relatedAchievement: 'FACE_ON',
    metric: 'profile',
    target: 1,
  },
];

export function isoWeekNumber(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getWeeklyChallenge(d = new Date()): WeeklyChallenge & { week: number; year: number } {
  const week = isoWeekNumber(d);
  const year = d.getFullYear();
  const challenge = CHALLENGES[week % CHALLENGES.length];
  return { ...challenge, week, year };
}
