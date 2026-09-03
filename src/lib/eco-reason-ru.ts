/**
 * Human-readable Russian labels for ReputationEvent / eco reason codes.
 * Codes stay English in DB for stability; UI must always show Russian.
 */

const EXACT: Record<string, string> = {
  event_check_in: 'Отметка на входе (QR)',
  join_event: 'Запись на мероприятие',
  friend_accept: 'Новый друг',
  gallery_photo: 'Фото в галерею',
  entity_invite_accept: 'Принятие приглашения в клуб/проект',
  instructions_complete: 'Инструктаж пройден',
  vacancy_screen_pass: 'Отклик на вакансию (скрининг)',
  vacancy_approved: 'Одобрение вакансии',
  contest_submit: 'Работа на конкурс',
  contest_approved: 'Одобрение конкурсной работы',
  contest_win: 'Победа в конкурсе',
  raffle_win: 'Победа в розыгрыше',
  game_daily: 'Игра (раз в сутки)',
  fifteen_win_daily: 'Победа в «Пятнашках»',
  view_unique: 'Просмотр карточки',
  admin_grant: 'Начисление администратором',
  admin_adjust: 'Корректировка администратором',
  eco_pool_reset: 'Сброс М-пула',
  contest_manual_award: 'Премия за конкурс (вручную)',
  referral_signup: 'Реферал: регистрация друга',
  referral_signup_welcome: 'Бонус за регистрацию по приглашению',
  referral_checkin: 'Реферал: друг на мероприятии',
  referral_checkin_welcome: 'Бонус за первое посещение',
  profile_self_update: 'Обновление профиля',
};

export function ecoReasonRu(reason: string | null | undefined): string {
  const raw = String(reason || '').trim();
  if (!raw) return 'Операция';
  if (EXACT[raw]) return EXACT[raw];

  const level = /^level_reward_(\d+)$/.exec(raw);
  if (level) return `Награда за уровень ${level[1]}`;

  const prestige = /^prestige_reward_(\d+)$/.exec(raw);
  if (prestige) return `Награда за престиж ${prestige[1]}`;

  if (raw.startsWith('Достижение:') || raw.startsWith('Покупка:') || raw.startsWith('Пак:')) {
    return raw;
  }

  const referral = /^referral_([a-z0-9_]+)$/i.exec(raw);
  if (referral) {
    const kind = referral[1].toLowerCase();
    if (kind.includes('signup') && kind.includes('welcome')) return EXACT.referral_signup_welcome;
    if (kind.includes('signup')) return EXACT.referral_signup;
    if (kind.includes('checkin') && kind.includes('welcome')) return EXACT.referral_checkin_welcome;
    if (kind.includes('check')) return EXACT.referral_checkin;
    return `Реферальная награда (${kind})`;
  }

  // Fallback: soften snake_case for any leftover English codes
  if (/^[a-z][a-z0-9_]*$/i.test(raw) && raw.includes('_')) {
    return raw
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return raw;
}
