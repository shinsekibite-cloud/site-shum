import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://sochi:sochi@127.0.0.1:5432/sochi_portal?schema=public';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  console.log('Seeding demo content...');

  await prisma.siteSettings.upsert({
    where: { id: '1' },
    update: {
      siteName: 'Молодёжь Сочи',
      contactEmail: 'info@young.sochi.ru',
      contactPhone: '+7 (862) 000-00-00',
      address: 'г. Сочи, ул. Навагинская, 9',
      vkLink: 'https://vk.com/molodezhsochi',
      vkEnabled: true,
      tgLink: 'https://t.me/molodezhsochi',
      tgEnabled: true,
      publicEventsVisibility: true,
    },
    create: {
      id: '1',
      siteName: 'Молодёжь Сочи',
      contactEmail: 'info@young.sochi.ru',
      contactPhone: '+7 (862) 000-00-00',
      address: 'г. Сочи, ул. Навагинская, 9',
      vkLink: 'https://vk.com/molodezhsochi',
      vkEnabled: true,
      tgLink: 'https://t.me/molodezhsochi',
      tgEnabled: true,
      publicEventsVisibility: true,
    },
  });

  const projects = [
    {
      title: 'Сочинская Лига КВН',
      description:
        'Официальная лига КВН города Сочи. Присоединяйся к самой смешной молодежи города!',
      image:
        'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&q=80',
      isDemoData: true,
      status: 'ACTIVE',
    },
    {
      title: 'Мисс студенчество',
      description:
        'Ежегодный конкурс таланта, грации и артистического мастерства среди студентов Сочи.',
      image:
        'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&q=80',
      isDemoData: true,
      status: 'ACTIVE',
    },
    {
      title: 'Форум «Сочиняй смыслы»',
      description:
        'Масштабный форум для молодежи: образовательные площадки, спикеры и гранты.',
      image:
        'https://images.unsplash.com/photo-1475721028070-2051152d4b93?w=800&q=80',
      isDemoData: true,
      status: 'ACTIVE',
    },
  ];

  for (const p of projects) {
    const exists = await prisma.project.findFirst({ where: { title: p.title } });
    if (!exists) await prisma.project.create({ data: p });
  }

  const clubs = [
    {
      title: 'Клуб настольных игр',
      description:
        'Собираемся каждые выходные в Доме Молодежи. Более 50 различных игр.',
      image:
        'https://images.unsplash.com/photo-1610890716171-6b1bb98ffaed?w=800&q=80',
      isDemoData: true,
      status: 'ACTIVE',
    },
    {
      title: 'IT-комьюнити Сочи',
      description: 'Встречи разработчиков, хакатоны и обмен опытом.',
      image:
        'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=800&q=80',
      isDemoData: true,
      status: 'ACTIVE',
    },
    {
      title: 'Клуб молодых семей',
      description:
        'Поддержка, совместный досуг и мастер-классы для молодых родителей.',
      image:
        'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&q=80',
      isDemoData: true,
      status: 'ACTIVE',
    },
  ];

  for (const c of clubs) {
    const exists = await prisma.club.findFirst({ where: { title: c.title } });
    if (!exists) await prisma.club.create({ data: c });
  }

  const spaces = [
    {
      title: 'Дом молодежи',
      address: 'г. Сочи, ул. Навагинская, 9',
      description:
        'Многофункциональное пространство для работы, встреч и мероприятий.',
      image:
        'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
      capacity: 120,
      isDemoData: true,
      status: 'ACTIVE',
    },
    {
      title: 'Тимирязева, 6',
      address: 'г. Сочи, ул. Тимирязева, 6',
      description: 'Креативный кластер для реализации творческих идей молодежи.',
      image:
        'https://images.unsplash.com/photo-1572025442646-866d16c84a54?w=800&q=80',
      capacity: 60,
      isDemoData: true,
      status: 'ACTIVE',
    },
    {
      title: 'Партизанская, 20',
      address: 'г. Сочи, ул. Партизанская, 20',
      description: 'Площадка для лекций, мастер-классов и тренингов.',
      image:
        'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800&q=80',
      capacity: 80,
      isDemoData: true,
      status: 'ACTIVE',
    },
  ];

  for (const s of spaces) {
    const exists = await prisma.space.findFirst({ where: { title: s.title } });
    if (!exists) await prisma.space.create({ data: s });
  }

  await prisma.space.updateMany({
    where: { title: 'tes' },
    data: {
      title: 'Тестовое пространство',
      description: 'Пространство для проверки бронирования.',
      status: 'ACTIVE',
      address: 'г. Сочи',
    },
  });

  const pages = [
    {
      slug: 'about',
      title: 'О нас',
      content:
        '<p>Официальный портал молодёжи города Сочи. Мы объединяем проекты, клубы и пространства для развития молодых людей.</p>',
      images: '[]',
      menuPosition: 'NONE',
    },
    {
      slug: 'contacts',
      title: 'Контакты',
      content: '<p>Свяжитесь с нами через страницу <a href="/contacts">Контакты</a>.</p>',
      images: '[]',
      menuPosition: 'NONE',
    },
    {
      slug: 'grants',
      title: 'Гранты',
      content: '<p>Информация о грантовых конкурсах для молодёжи Сочи.</p>',
      images: '[]',
      menuPosition: 'HEADER_SUB',
    },
    {
      slug: 'documents',
      title: 'Документы',
      content: '<p>Нормативные документы и материалы.</p>',
      images: '[]',
      menuPosition: 'FOOTER',
    },
  ];

  for (const page of pages) {
    await prisma.pageContent.upsert({
      where: { slug: page.slug },
      update: {
        title: page.title,
        content: page.content,
        menuPosition: page.menuPosition,
      },
      create: page,
    });
  }

  const newsCount = await prisma.news.count();
  if (newsCount === 0) {
    await prisma.news.createMany({
      data: [
        {
          title: 'Старт нового сезона проектов',
          text: 'Открыт набор в молодёжные проекты Сочи на новый сезон. Подавайте заявки на портале.',
          isDemoData: true,
        },
        {
          title: 'Бронирование пространств онлайн',
          text: 'Теперь забронировать Дом молодёжи и другие площадки можно прямо на портале.',
          isDemoData: true,
        },
      ],
    });
  }

  console.log('Done:', {
    projects: await prisma.project.count(),
    clubs: await prisma.club.count(),
    spaces: await prisma.space.count(),
    news: await prisma.news.count(),
    pages: await prisma.pageContent.count(),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
