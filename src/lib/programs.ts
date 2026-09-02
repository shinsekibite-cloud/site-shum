import { prisma } from '@/lib/prisma';
import { publicPagePath } from '@/lib/public-paths';
import { isNextBuildPhase } from '@/lib/build-phase';

export const PROGRAM_KINDS = ['GRANT', 'DOBRO', 'SELF_GOV'] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];

export const PROGRAM_KIND_META: Record<
  ProgramKind,
  {
    slug: string;
    title: string;
    singular: string;
    applyLabel: string;
    approvedLabel: string;
    listDescription: string;
    adminTitle: string;
  }
> = {
  GRANT: {
    slug: 'grants',
    title: 'Гранты',
    singular: 'грант',
    applyLabel: 'Подать заявку на грант',
    approvedLabel: 'Заявка принята',
    listDescription:
      'Конкурсы и программы поддержки молодёжных инициатив Сочи: сроки, условия и подача заявки на портале.',
    adminTitle: 'Грантовые программы',
  },
  DOBRO: {
    slug: 'dobro',
    title: 'Добро',
    singular: 'акция',
    applyLabel: 'Записаться волонтёром',
    approvedLabel: 'Вы в команде',
    listDescription:
      'Волонтёрские акции и наборы Добро.Центра Сочи: смены, городские события и помощь городу.',
    adminTitle: 'Волонтёрские акции',
  },
  SELF_GOV: {
    slug: 'self-gov',
    title: 'Самоуправление',
    singular: 'орган',
    applyLabel: 'Подать заявку на участие',
    approvedLabel: 'Вы участник',
    listDescription:
      'Молодёжный совет, парламент и ученическое самоуправление — влияние на решения, важные для молодых жителей.',
    adminTitle: 'Самоуправление',
  },
};

export const PROGRAM_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  OPEN: 'Открыт набор',
  CLOSED: 'Набор закрыт',
  ARCHIVED: 'В архиве',
};

export const BODY_TYPE_LABELS: Record<string, string> = {
  COUNCIL: 'Молодёжный совет',
  PARLIAMENT: 'Молодёжный парламент',
  SCHOOL: 'Ученическое самоуправление',
  INITIATIVE: 'Инициативная группа',
};

export function isProgramKind(v: string): v is ProgramKind {
  return (PROGRAM_KINDS as readonly string[]).includes(v);
}

export function programPublicPath(kind: ProgramKind, id?: string) {
  const base = `/${PROGRAM_KIND_META[kind].slug}`;
  return id ? `${base}/${id}` : base;
}

export function kindFromSlug(slug: string): ProgramKind | null {
  const entry = Object.entries(PROGRAM_KIND_META).find(([, m]) => m.slug === slug);
  return entry ? (entry[0] as ProgramKind) : null;
}

/** Intro CMS pages stay in menu but open the live catalogs. */
export function publicPagePathForSlug(slug: string) {
  return publicPagePath(slug);
}

const SEED_PROGRAMS: Array<{
  id: string;
  kind: ProgramKind;
  title: string;
  summary: string;
  description: string;
  status: string;
  organizer?: string;
  place?: string;
  externalUrl?: string;
  tags?: string;
  amountLabel?: string;
  bodyType?: string;
  seats?: number;
  sortOrder: number;
  startsOffsetDays?: number;
  endsOffsetDays?: number;
}> = [
  {
    id: 'seed_grant_initiatives_2026',
    kind: 'GRANT',
    title: 'Молодёжные инициативы Сочи 2026',
    summary: 'Поддержка социальных, культурных и образовательных проектов молодых авторов.',
    description: `
<p>Городской конкурс грантов для жителей Сочи 14–35 лет. Можно подать инициативы в сферах волонтёрства, образования, медиа, спорта и городской среды.</p>
<h2>Что поддержать</h2>
<ul>
<li>Социальные и волонтёрские проекты</li>
<li>Образовательные и медиа-инициативы</li>
<li>События и фестивали для молодёжи</li>
</ul>
<h2>Как участвовать</h2>
<ol>
<li>Изучите условия и подготовьте описание проекта, смету и команду</li>
<li>Подайте заявку на портале до дедлайна</li>
<li>При необходимости приложите документы из раздела «Документы»</li>
<li>Дождитесь экспертизы и объявления результатов</li>
</ol>
<p>Вопросы — через <a href="/contacts">Контакты</a> или куратора программы.</p>
`.trim(),
    status: 'OPEN',
    organizer: 'Дом молодёжи Сочи',
    place: 'г. Сочи',
    tags: 'грант,инициативы,2026',
    amountLabel: 'до 300 000 ₽',
    sortOrder: 10,
    startsOffsetDays: -14,
    endsOffsetDays: 45,
  },
  {
    id: 'seed_grant_media',
    kind: 'GRANT',
    title: 'Грант на молодёжные медиа',
    summary: 'Съёмки, подкасты и городские медиапроекты с наставничеством.',
    description: `
<p>Программа для команд, которые делают контент о жизни молодёжи Сочи: видео, подкасты, фотоистории и спецпроекты.</p>
<ul>
<li>Финансирование оборудования и продакшена</li>
<li>Менторство от городских медиа</li>
<li>Публикация лучших материалов на портале и в партнёрских каналах</li>
</ul>
<p>К заявке приложите портфолио или ссылки на работы и краткий план выпуска.</p>
`.trim(),
    status: 'OPEN',
    organizer: 'Медиацентр «Молодёжь Сочи»',
    amountLabel: 'до 150 000 ₽',
    tags: 'медиа,контент',
    sortOrder: 20,
    startsOffsetDays: -7,
    endsOffsetDays: 60,
  },
  {
    id: 'seed_grant_closed_demo',
    kind: 'GRANT',
    title: 'Летний грант 2025 (архив)',
    summary: 'Сезон завершён — результаты опубликованы, новые заявки не принимаются.',
    description: `<p>Архивная программа летнего сезона 2025. Актуальные конкурсы смотрите в открытом списке грантов.</p>`,
    status: 'CLOSED',
    organizer: 'Дом молодёжи Сочи',
    amountLabel: 'до 200 000 ₽',
    sortOrder: 90,
    startsOffsetDays: -200,
    endsOffsetDays: -90,
  },
  {
    id: 'seed_dobro_clean_sochi',
    kind: 'DOBRO',
    title: 'Чистый Сочи — экологическая смена',
    summary: 'Уборка набережных и парковых зон, разбор вторсырья, фотоотчет.',
    description: `
<p>Городская экоакция Добро.Центра: смены по 3 часа, инвентарь выдаём на месте. Подходит новичкам — инструктаж в начале смены.</p>
<ul>
<li>Возраст от 14 лет (до 18 — согласие законного представителя)</li>
<li>Форма: удобная одежда и обувь</li>
<li>После смены — отметка в личном кабинете и часы в портфолио волонтёра</li>
</ul>
<p>Также можно зарегистрироваться на <a href="https://dobro.ru" target="_blank" rel="noreferrer">Добро.ру</a>.</p>
`.trim(),
    status: 'OPEN',
    organizer: 'Добро.Центр Сочи',
    place: 'Набережная и парки Центрального района',
    externalUrl: 'https://dobro.ru',
    tags: 'экология,смена',
    seats: 40,
    sortOrder: 10,
    startsOffsetDays: 7,
    endsOffsetDays: 7,
  },
  {
    id: 'seed_dobro_city_events',
    kind: 'DOBRO',
    title: 'Волонтёры городских событий',
    summary: 'Навигация гостей, регистрация, помощь на сцене и в зоне комфорта.',
    description: `
<p>Постоянный штаб волонтёров на молодёжных мероприятиях Сочи. Гибкий график смен, обучение и командная форма.</p>
<ol>
<li>Подайте заявку и укажите удобные даты</li>
<li>Пройдите короткий инструктаж онлайн или очно</li>
<li>Выберите смены в афише событий</li>
</ol>
`.trim(),
    status: 'OPEN',
    organizer: 'Добро.Центр Сочи',
    place: 'Площадки мероприятий города',
    externalUrl: 'https://dobro.ru',
    tags: 'события,штаб',
    seats: 80,
    sortOrder: 20,
    startsOffsetDays: 0,
    endsOffsetDays: 120,
  },
  {
    id: 'seed_dobro_hq_recruit',
    kind: 'DOBRO',
    title: 'Набор в штаб Добро.Центра',
    summary: 'Координаторы направлений: экология, события, помощь людям.',
    description: `
<p>Ищем ответственных волонтёров-координаторов: планирование смен, связь с партнёрами, работа с новичками.</p>
<p>Опыт волонтёрства желателен, но не обязателен — важны коммуникация и готовность 4–6 часов в неделю.</p>
`.trim(),
    status: 'OPEN',
    organizer: 'Добро.Центр Сочи',
    place: 'Дом молодёжи',
    tags: 'штаб,координатор',
    seats: 12,
    sortOrder: 30,
    startsOffsetDays: -3,
    endsOffsetDays: 30,
  },
  {
    id: 'seed_selfgov_council',
    kind: 'SELF_GOV',
    title: 'Молодёжный совет при главе города',
    summary: 'Представляйте интересы сверстников и продвигайте городские инициативы.',
    description: `
<p>Совет собирает обратную связь от молодых жителей, готовит предложения по молодёжной политике и сопровождает проекты.</p>
<ul>
<li>Возраст 16–35 лет</li>
<li>Регулярные заседания и рабочие группы</li>
<li>Возможность выносить темы на уровень администрации</li>
</ul>
<p>В заявке расскажите о себе и направлениях, которые хотите курировать.</p>
`.trim(),
    status: 'OPEN',
    organizer: 'Администрация г. Сочи / Дом молодёжи',
    place: 'г. Сочи',
    bodyType: 'COUNCIL',
    tags: 'совет,политика',
    seats: 25,
    sortOrder: 10,
    startsOffsetDays: -10,
    endsOffsetDays: 40,
  },
  {
    id: 'seed_selfgov_parliament',
    kind: 'SELF_GOV',
    title: 'Молодёжный парламент Сочи',
    summary: 'Законотворческие практики, дебаты и проекты нормативных инициатив.',
    description: `
<p>Площадка для тех, кто интересуется правом, публичными выступлениями и городским управлением. Участники готовят резолюции и проводят открытые слушания.</p>
`.trim(),
    status: 'OPEN',
    organizer: 'Молодёжный парламент',
    bodyType: 'PARLIAMENT',
    tags: 'парламент,дебаты',
    seats: 40,
    sortOrder: 20,
    startsOffsetDays: 0,
    endsOffsetDays: 50,
  },
  {
    id: 'seed_selfgov_school',
    kind: 'SELF_GOV',
    title: 'Ученическое самоуправление — кураторы школ',
    summary: 'Связь школьных советов с городскими программами и наборами.',
    description: `
<p>Набор кураторов от школ: трансляция афиши, помощь одноклассникам с заявками на портале, организация школьных инициатив.</p>
`.trim(),
    status: 'OPEN',
    organizer: 'Дом молодёжи Сочи',
    bodyType: 'SCHOOL',
    tags: 'школа,куратор',
    seats: 50,
    sortOrder: 30,
    startsOffsetDays: -5,
    endsOffsetDays: 35,
  },
];

function dayOffset(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

const INTRO_PAGES: Record<
  string,
  { title: string; template: string; menuPosition: string; content: string }
> = {
  grants: {
    title: 'Гранты',
    template: 'DEFAULT',
    menuPosition: 'HEADER_SUB',
    content: `
<p>Раздел грантовой поддержки молодёжных инициатив Сочи. Актуальные конкурсы, сроки и подача заявки — на <a href="/grants">странице грантов</a>.</p>
<p>Положения и формы также публикуются в разделе <a href="/documents">Документы</a>.</p>
`.trim(),
  },
  dobro: {
    title: 'Добро',
    template: 'HERO',
    menuPosition: 'HEADER_SUB',
    content: `
<p><strong>Добро.Центр Сочи</strong> — точка входа в добровольчество. Акции и наборы — в каталоге <a href="/dobro">Добро</a>, федеральная платформа — <a href="https://dobro.ru" target="_blank" rel="noreferrer">Добро.ру</a>.</p>
`.trim(),
  },
  'self-gov': {
    title: 'Самоуправление',
    template: 'DEFAULT',
    menuPosition: 'HEADER_SUB',
    content: `
<p>Молодёжное самоуправление Сочи: совет, парламент и ученические советы. Открытые наборы — на странице <a href="/self-gov">Самоуправление</a>.</p>
`.trim(),
  },
};

/** Soft-seed demo programs and keep CMS intro pages pointing at live catalogs. */
export async function ensurePrograms() {
  if (isNextBuildPhase()) return;
  for (const seed of SEED_PROGRAMS) {
    try {
      const existing = await prisma.portalProgram.findUnique({ where: { id: seed.id } });
      if (existing) continue;
      await prisma.portalProgram.create({
        data: {
          id: seed.id,
          kind: seed.kind,
          title: seed.title,
          summary: seed.summary,
          description: seed.description,
          status: seed.status,
          organizer: seed.organizer ?? null,
          place: seed.place ?? null,
          externalUrl: seed.externalUrl ?? null,
          tags: seed.tags ?? null,
          amountLabel: seed.amountLabel ?? null,
          bodyType: seed.bodyType ?? null,
          seats: seed.seats ?? null,
          sortOrder: seed.sortOrder,
          startsAt:
            seed.startsOffsetDays != null ? dayOffset(seed.startsOffsetDays) : null,
          endsAt: seed.endsOffsetDays != null ? dayOffset(seed.endsOffsetDays) : null,
          isDemoData: true,
          image:
            seed.kind === 'GRANT'
              ? `/covers/grant-${seed.id.includes('media') ? 'media' : seed.id.includes('closed') ? 'archive' : 'initiatives'}.svg`
              : seed.kind === 'DOBRO'
                ? `/covers/dobro-${seed.id.includes('clean') ? 'clean' : seed.id.includes('hq') ? 'hq' : 'events'}.svg`
                : `/covers/selfgov-${seed.id.includes('parliament') ? 'parliament' : seed.id.includes('school') ? 'school' : 'council'}.svg`,
        },
      });
    } catch (e) {
      console.warn('ensurePrograms seed', seed.id, e);
    }
  }

  // Soft-upgrade: fill missing/stock covers on existing programs
  try {
    const stock = await prisma.portalProgram.findMany({
      where: { OR: [{ image: null }, { image: '' }, { image: '/hero-bg.jpg' }] },
    });
    for (const p of stock) {
      const image =
        p.kind === 'DOBRO'
          ? '/covers/dobro-events.svg'
          : p.kind === 'SELF_GOV'
            ? '/covers/selfgov-council.svg'
            : '/covers/grant-initiatives.svg';
      // More specific by id
      const byId: Record<string, string> = {
        seed_grant_initiatives_2026: '/covers/grant-initiatives.svg',
        seed_grant_media: '/covers/grant-media.svg',
        seed_grant_closed_demo: '/covers/grant-archive.svg',
        seed_dobro_clean_sochi: '/covers/dobro-clean.svg',
        seed_dobro_city_events: '/covers/dobro-events.svg',
        seed_dobro_hq_recruit: '/covers/dobro-hq.svg',
        seed_selfgov_council: '/covers/selfgov-council.svg',
        seed_selfgov_parliament: '/covers/selfgov-parliament.svg',
        seed_selfgov_school: '/covers/selfgov-school.svg',
      };
      await prisma.portalProgram.update({
        where: { id: p.id },
        data: { image: byId[p.id] || image },
      });
    }
  } catch (e) {
    console.warn('ensurePrograms cover upgrade', e);
  }

  for (const [slug, meta] of Object.entries(INTRO_PAGES)) {
    try {
      const page = await prisma.pageContent.findUnique({ where: { slug } });
      const liveHref = `href="/${slug === 'self-gov' ? 'self-gov' : slug}"`;
      if (!page) {
        await prisma.pageContent.create({
          data: {
            slug,
            title: meta.title,
            content: meta.content,
            images: `/covers/page-${slug}.svg`,
            template: meta.template,
            menuPosition: meta.menuPosition,
            status: 'PUBLISHED',
            publishedAt: new Date(),
          },
        });
      } else if (!page.content.includes(liveHref)) {
        await prisma.pageContent.update({
          where: { slug },
          data: {
            title: meta.title,
            content: meta.content,
            template: meta.template,
            menuPosition: meta.menuPosition,
            status: 'PUBLISHED',
            publishedAt: page.publishedAt ?? new Date(),
          },
        });
      }
    } catch (e) {
      console.warn('ensurePrograms intro', slug, e);
    }
  }
}

export function formatProgramDate(d: Date | string | null | undefined) {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function programIsApplyOpen(status: string, endsAt?: Date | null) {
  if (status !== 'OPEN') return false;
  if (endsAt && endsAt.getTime() < Date.now()) return false;
  return true;
}
