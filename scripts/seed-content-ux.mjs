/**
 * Fill CMS pages, completed catalogs, contacts/hours.
 * Run inside web container:
 *   docker-compose exec -T web node /app/scripts/seed-content-ux.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import path from 'path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const PUBLIC = process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');

function ensurePageCover(slug) {
  const destDir = path.join(PUBLIC, 'uploads', 'pages');
  fs.mkdirSync(destDir, { recursive: true });
  const destFile = `pages-${slug}-cover.jpg`;
  const dest = path.join(destDir, destFile);
  const candidates = [
    path.join(PUBLIC, 'uploads/projects/projects-1-1785831323262.jpg'),
    path.join(PUBLIC, 'uploads/projects/projects-0-1785831323133.jpg'),
    path.join(PUBLIC, 'uploads/spaces/spaces-6-1785831323436.jpg'),
    path.join(PUBLIC, 'hero-bg.jpg'),
  ];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) return '/hero-bg.jpg';
  fs.copyFileSync(src, dest);
  return `/uploads/pages/${destFile}`;
}

const pages = {
  about: {
    title: 'О нас',
    template: 'HERO',
    menuPosition: 'HEADER_MAIN',
    content: `
<p><strong>Молодёжь Сочи</strong> — официальный цифровой портал для молодых жителей и гостей курорта. Здесь собраны проекты, клубы, пространства и возможности для самореализации.</p>
<h2>Чем мы занимаемся</h2>
<ul>
<li>Поддерживаем молодёжные инициативы и волонтёрство</li>
<li>Открываем пространства для встреч, учёбы и творчества</li>
<li>Помогаем с грантами и самоуправлением</li>
<li>Собираем афишу событий и упрощаем запись</li>
</ul>
<p>Присоединяйтесь к сообществам, бронируйте площадки и следите за новостями — вместе делаем город удобнее для молодёжи.</p>
`.trim(),
  },
  grants: {
    title: 'Гранты',
    template: 'DEFAULT',
    menuPosition: 'HEADER_SUB',
    content: `
<p>Раздел грантовой поддержки молодёжных инициатив Сочи. Актуальные конкурсы, сроки и подача заявки — на <a href="/grants">странице грантов</a>.</p>
<h2>Как это работает</h2>
<ol>
<li>Выберите открытую программу и изучите условия</li>
<li>Подготовьте описание проекта, смету и команду</li>
<li>Подайте заявку на портале до дедлайна</li>
<li>Дождитесь экспертизы — статус будет в личном кабинете</li>
</ol>
<p>Положения и формы также публикуются в разделе <a href="/documents">Документы</a>. Вопросы — в <a href="/contacts">Контактах</a>.</p>
`.trim(),
  },
  documents: {
    title: 'Документы',
    template: 'DEFAULT',
    menuPosition: 'FOOTER',
    content: `
<p>Нормативные документы, положения и формы заявок портала «Молодёжь Сочи».</p>
<h2>Основные материалы</h2>
<ul>
<li>Положение о молодёжных пространствах</li>
<li>Правила бронирования площадок</li>
<li>Форма заявки в проект / клуб</li>
<li>Политика обработки персональных данных — см. также <a href="/privacy">Политику конфиденциальности</a></li>
</ul>
<p>Администратор дополняет раздел через панель: <em>Страницы → Документы</em>. Описание и файлы/изображения добавляются через редактор.</p>
`.trim(),
  },
  dobro: {
    title: 'Добро',
    template: 'HERO',
    menuPosition: 'HEADER_SUB',
    content: `
<p><strong>Добро.Центр Сочи</strong> — точка входа в добровольчество. Акции и наборы — в каталоге <a href="/dobro">Добро</a>.</p>
<ul>
<li>Городские и экологические смены</li>
<li>Помощь на мероприятиях</li>
<li>Набор в штаб координаторов</li>
</ul>
<p>Федеральная платформа: <a href="https://dobro.ru" target="_blank" rel="noreferrer">Добро.ру</a>.</p>
`.trim(),
  },
  'self-gov': {
    title: 'Самоуправление',
    template: 'DEFAULT',
    menuPosition: 'HEADER_SUB',
    content: `
<p>Молодёжное самоуправление Сочи: совет, парламент и ученические советы. Открытые наборы — на странице <a href="/self-gov">Самоуправление</a>.</p>
<ul>
<li>Молодёжный совет при главе города</li>
<li>Молодёжный парламент</li>
<li>Кураторы ученического самоуправления</li>
</ul>
<p>Подайте заявку онлайн — статус появится в личном кабинете.</p>
`.trim(),
  },
};

async function main() {
  for (const [slug, meta] of Object.entries(pages)) {
    const images = ensurePageCover(slug);
    await prisma.pageContent.upsert({
      where: { slug },
      create: {
        slug,
        title: meta.title,
        content: meta.content,
        images,
        template: meta.template,
        menuPosition: meta.menuPosition,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      update: {
        title: meta.title,
        content: meta.content,
        images,
        template: meta.template,
        menuPosition: meta.menuPosition,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    console.log('page', slug, '→', images);
  }

  await prisma.project.upsert({
    where: { id: 'seed_proj_done' },
    create: {
      id: 'seed_proj_done',
      title: 'Летний кампус 2025',
      description:
        '<p>Завершённый образовательный кампус для подростков: мастер-классы, спортивные смены и ярмарка проектов.</p>',
      image: '/uploads/projects/projects-0-1785831323133.jpg',
      status: 'COMPLETED',
      isDemoData: true,
    },
    update: { status: 'COMPLETED', title: 'Летний кампус 2025' },
  });

  await prisma.club.upsert({
    where: { id: 'seed_club_done' },
    create: {
      id: 'seed_club_done',
      title: 'Клуб настольных игр (архив)',
      description: '<p>Сезон завершён. Новые встречи анонсируем в афише.</p>',
      image: '/uploads/clubs/clubs-3-1785831323328.jpg',
      status: 'COMPLETED',
      isDemoData: true,
    },
    update: { status: 'COMPLETED' },
  });

  await prisma.space.upsert({
    where: { id: 'seed_space_done' },
    create: {
      id: 'seed_space_done',
      title: 'Павильон на набережной (сезон закрыт)',
      description: '<p>Временная площадка летнего сезона. Бронирование закрыто.</p>',
      image: '/uploads/spaces/spaces-8-1785831323504.jpg',
      address: 'г. Сочи, Набережная',
      capacity: 40,
      status: 'COMPLETED',
      isDemoData: true,
    },
    update: { status: 'COMPLETED' },
  });

  await prisma.siteSettings.update({
    where: { id: '1' },
    data: {
      siteName: 'Молодёжь Сочи',
      contactEmail: 'info@young.idivles.ru',
      supportEmail: 'support@young.idivles.ru',
      contactPhone: '+7 (862) 262-00-00',
      address: 'г. Сочи, ул. Навагинская, 9',
      workHours: 'Пн–Пт: 9:00 – 18:00\nСб–Вс: выходной',
      bookingOpenTime: '09:00',
      bookingCloseTime: '21:00',
    },
  });

  console.log('Done content UX seed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
