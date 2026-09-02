/** Zodiac from birth date (tropical, Northern hemisphere) */
export function zodiacFromDate(input: Date | string | null | undefined): string | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const ranges: Array<{ from: [number, number]; to: [number, number]; name: string }> = [
    { from: [1, 20], to: [2, 18], name: 'Водолей' },
    { from: [2, 19], to: [3, 20], name: 'Рыбы' },
    { from: [3, 21], to: [4, 19], name: 'Овен' },
    { from: [4, 20], to: [5, 20], name: 'Телец' },
    { from: [5, 21], to: [6, 20], name: 'Близнецы' },
    { from: [6, 21], to: [7, 22], name: 'Рак' },
    { from: [7, 23], to: [8, 22], name: 'Лев' },
    { from: [8, 23], to: [9, 22], name: 'Дева' },
    { from: [9, 23], to: [10, 22], name: 'Весы' },
    { from: [10, 23], to: [11, 21], name: 'Скорпион' },
    { from: [11, 22], to: [12, 21], name: 'Стрелец' },
    { from: [12, 22], to: [1, 19], name: 'Козерог' },
  ];
  for (const r of ranges) {
    const [fm, fd] = r.from;
    const [tm, td] = r.to;
    if (fm <= tm) {
      if ((month === fm && day >= fd) || (month === tm && day <= td) || (month > fm && month < tm)) {
        return r.name;
      }
    } else {
      // Capricorn wrap
      if ((month === fm && day >= fd) || (month === tm && day <= td) || month > fm || month < tm) {
        return r.name;
      }
    }
  }
  return null;
}

export const HOBBY_GROUPS: { title: string; tags: string[] }[] = [
  {
    title: 'Спорт',
    tags: [
      'Футбол',
      'Баскетбол',
      'Волейбол',
      'Плавание',
      'Бег',
      'Йога',
      'Тренажёрный зал',
      'Единоборства',
      'Велоспорт',
      'Сёрфинг',
      'Теннис',
      'Скейт',
      'Сноуборд',
      'Скалолазание',
    ],
  },
  {
    title: 'Творчество',
    tags: ['Музыка', 'Танцы', 'Рисование', 'Фотография', 'Видео', 'Театр', 'КВН', 'Вокал', 'Дизайн', 'Рукоделие', 'Писательство', 'Стендап'],
  },
  {
    title: 'Досуг',
    tags: ['Кино', 'Чтение', 'Игры', 'Настолки', 'Кулинария', 'Путешествия', 'Блогерство', 'Квизы', 'Настольный теннис', 'Шахматы', 'Аниме', 'Подкасты'],
  },
  {
    title: 'Город и люди',
    tags: ['Волонтёрство', 'Программирование', 'Киберспорт', 'Туризм по Сочи', 'Пляж', 'Горы', 'Животные', 'Авто'],
  },
];

export const INTEREST_GROUPS: { title: string; tags: string[] }[] = [
  {
    title: 'Город и общество',
    tags: ['Молодёжная политика', 'Самоуправление', 'Социальные проекты', 'Волонтёрство', 'События города', 'Экология', 'Патриотизм', 'Медиация'],
  },
  {
    title: 'Карьера и учёба',
    tags: ['Образование', 'Предпринимательство', 'Гранты', 'IT', 'Наука', 'Медиа', 'Дизайн', 'Карьера', 'Иностранные языки'],
  },
  {
    title: 'Стиль жизни',
    tags: ['Спорт и ЗОЖ', 'Искусство', 'Туризм', 'Кино и сериалы', 'Музыкальная сцена', 'Игры и киберспорт', 'Мода', 'Кулинария'],
  },
];

export const DEFAULT_HOBBIES = HOBBY_GROUPS.flatMap((g) => g.tags);
export const DEFAULT_INTERESTS = INTEREST_GROUPS.flatMap((g) => g.tags);

export function tagGroupsFor(kind: 'hobbies' | 'interests') {
  return kind === 'interests' ? INTEREST_GROUPS : HOBBY_GROUPS;
}

export function parseTagList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parseTagList(parsed);
    } catch {
      /* split by comma/newline */
    }
    return t
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  return [];
}

export function serializeTagList(tags: string[]): string {
  const unique = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).slice(0, 30);
  return JSON.stringify(unique);
}
