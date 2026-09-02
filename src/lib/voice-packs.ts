/**
 * Fun UI voice packs — phrase maps for entertainment surfaces only.
 * Legal / admin / consent copy stays in default Russian.
 */

export type VoicePackId =
  | 'voice_slavonic'
  | 'voice_punk'
  | 'voice_elite'
  | 'voice_sochi'
  | 'voice_youth';

export const VOICE_PACK_IDS: VoicePackId[] = [
  'voice_slavonic',
  'voice_punk',
  'voice_elite',
  'voice_sochi',
  'voice_youth',
];

export function isVoicePackId(v: string | null | undefined): v is VoicePackId {
  return Boolean(v && (VOICE_PACK_IDS as string[]).includes(v));
}

/** Canonical keys used by useVoiceCopy */
const BASE: Record<string, string> = {
  'nav.games': 'Игры',
  'nav.profile': 'Кабинет',
  'nav.quick': 'Быстрый доступ',
  'eco.title': 'мбаллы',
  'eco.spend': 'Тратьте на рамки, значки, голоса и темы — видно в сообществе.',
  'eco.buy': 'Купить',
  'eco.equip': 'Надеть',
  'eco.unequip': 'Снять',
  'eco.owned': 'Куплено',
  'eco.equipped': 'Надето',
  'eco.toast.game': '+{n} эко за игру сегодня',
  'eco.toast.view': '+{n} эко за просмотр',
  'eco.toast.buy': 'Покупка оформлена',
  'games.hub.title': 'Офлайн-игры',
  'game.hub.intro': 'Рекорды на устройстве и в рейтинге сайта. До 5 эко в день за игру.',
  'game.start': 'Играть',
  'profile.empty.achievements': 'Пока нет открытых достижений',
  'profile.bio.edit': 'Добавить статус',
  'views.label': 'просмотры',
};

const SLAVONIC: Record<string, string> = {
  ...BASE,
  'nav.games': 'Игрища',
  'nav.profile': 'Келья',
  'nav.quick': 'Скорый доступ',
  'eco.title': 'Эко-дань',
  'eco.spend': 'Меняйте дань на убранство и глас — да видят братья.',
  'eco.buy': 'Стяжати',
  'eco.equip': 'Возложить',
  'eco.unequip': 'Сложить',
  'eco.owned': 'Стяжано',
  'eco.equipped': 'Возложено',
  'eco.toast.game': '+{n} дани за игрище днесь',
  'eco.toast.view': '+{n} дани за узрение',
  'eco.toast.buy': 'Сделка свершилась',
  'game.hub.title': 'Игрища офлайн',
  'game.hub.intro': 'Рекорды ваши и рейтинг портала. До пяти даней в сутки за игрище.',
  'game.start': 'Начать брань',
  'profile.empty.achievements': 'Пока не стяжали подвигов',
  'profile.bio.edit': 'Начертать статус',
  'views.label': 'узрели',
};

const PUNK: Record<string, string> = {
  ...BASE,
  'nav.games': 'Игрухи',
  'nav.profile': 'Халупа',
  'nav.quick': 'Быстрый вход',
  'eco.title': 'Эко-фишки',
  'eco.spend': 'Сливай фишки на рамки, голоса и шмот — пусть видят.',
  'eco.buy': 'Забрать',
  'eco.equip': 'Включить',
  'eco.unequip': 'Скинуть',
  'eco.owned': 'Уже твоё',
  'eco.equipped': 'На тебе',
  'eco.toast.game': '+{n} фишек за игру сегодня',
  'eco.toast.view': '+{n} фишка за взгляд',
  'eco.toast.buy': 'Забрал — кайф',
  'game.hub.title': 'Оффлайн-игрухи',
  'game.hub.intro': 'Рекорды на девайсе и в рейтинге. До 5 фишек в день за игру.',
  'game.start': 'Погнали',
  'profile.empty.achievements': 'Пока пусто по достижениям',
  'profile.bio.edit': 'Кинуть статус',
  'views.label': 'глянули',
};

const ELITE: Record<string, string> = {
  ...BASE,
  'nav.games': 'Досуг',
  'nav.profile': 'Кабинет',
  'nav.quick': 'Экспресс-меню',
  'eco.title': 'мбаллы',
  'eco.spend': 'Инвестируйте капитал в эстетику и тон общения.',
  'eco.buy': 'Приобрести',
  'eco.equip': 'Активировать',
  'eco.unequip': 'Деактивировать',
  'eco.owned': 'В коллекции',
  'eco.equipped': 'Активно',
  'eco.toast.game': '+{n} к эко-капиталу за партию',
  'eco.toast.view': '+{n} за ознакомление с материалом',
  'eco.toast.buy': 'Приобретение оформлено',
  'game.hub.title': 'Камерный досуг',
  'game.hub.intro': 'Личные рекорды и рейтинг. До 5 единиц капитала в сутки за игру.',
  'game.start': 'Начать сессию',
  'profile.empty.achievements': 'Коллекция достижений пока пуста',
  'profile.bio.edit': 'Указать статус',
  'views.label': 'ознакомлений',
};

const SOCHI: Record<string, string> = {
  ...BASE,
  'nav.games': 'Игры',
  'nav.profile': 'Кабинет',
  'nav.quick': 'Быстрый доступ',
  'eco.title': 'мбаллы',
  'eco.spend': 'Меняйте баллы на стиль — как сувенир с набережной.',
  'eco.buy': 'Взять',
  'eco.equip': 'Надеть',
  'eco.unequip': 'Снять',
  'eco.owned': 'Уже есть',
  'eco.equipped': 'На тебе',
  'eco.toast.game': '+{n} эко за игру сегодня — огонь',
  'eco.toast.view': '+{n} эко за просмотр',
  'eco.toast.buy': 'Готово, красота',
  'game.hub.title': 'Офлайн-игры',
  'game.hub.intro': 'Рекорды на устройстве и в рейтинге. До 5 эко в день — как прогулка у моря.',
  'game.start': 'Погнали',
  'profile.empty.achievements': 'Пока без медалей — всё впереди',
  'profile.bio.edit': 'Добавить статус',
  'views.label': 'просмотров',
};

const YOUTH: Record<string, string> = {
  ...BASE,
  'nav.games': 'Игры',
  'nav.profile': 'Профиль',
  'nav.quick': 'Быстро',
  'eco.title': 'мб',
  'eco.spend': 'Копи эко и апгрейдь стиль — рамки, голоса, темы.',
  'eco.buy': 'Беру',
  'eco.equip': 'Надеть',
  'eco.unequip': 'Снять',
  'eco.owned': 'Есть',
  'eco.equipped': 'На тебе',
  'eco.toast.game': '+{n} эко за игру — красава',
  'eco.toast.view': '+{n} эко за просмотр',
  'eco.toast.buy': 'Забрали',
  'game.hub.title': 'Мини-игры',
  'game.hub.intro': 'Рекорды тут и в рейтинге. До 5 эко в день за игру.',
  'game.start': 'Старт',
  'profile.empty.achievements': 'Ачивок пока нет — время фармить',
  'profile.bio.edit': 'Статус',
  'views.label': 'просмотры',
};

export const VOICE_PACKS: Record<VoicePackId, Record<string, string>> = {
  voice_slavonic: SLAVONIC,
  voice_punk: PUNK,
  voice_elite: ELITE,
  voice_sochi: SOCHI,
  voice_youth: YOUTH,
};

export function voiceCopy(
  packId: string | null | undefined,
  key: string,
  fallback?: string,
  vars?: Record<string, string | number>
): string {
  const pack = isVoicePackId(packId) ? VOICE_PACKS[packId] : BASE;
  let text = pack[key] ?? fallback ?? BASE[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
