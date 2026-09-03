#!/usr/bin/env node
/**
 * Fill catalogs with useful demo content when empty/thin.
 *   node scripts/seed-content-live.mjs
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://sochi:sochi@127.0.0.1:5432/sochi_portal?schema=public';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const now = new Date();

  const newsSeed = [
    {
      id: 'seed-news-volunteer',
      title: 'Набор волонтёров на городские акции',
      text: 'Центр развития молодежи Сочи приглашает присоединиться к волонтёрским выездам: экология набережной, помощь на фестивалях, сопровождение гостей. Запись через кабинет → Заявки.',
    },
    {
      id: 'seed-news-afisha',
      title: 'Афиша недели: встречи, мастер-классы, спорт',
      text: 'Смотрите календарь мероприятий и бронируйте места заранее. После посещения отметьтесь по QR — так растёт надёжность и эко-вклад.',
    },
    {
      id: 'seed-news-career',
      title: 'Карьера и стажировки для студентов Сочи',
      text: 'Открыты вакансии и стажировки партнёров портала. Обновите портфолио и откликайтесь из раздела «Вакансии».',
    },
  ];

  for (const n of newsSeed) {
    await prisma.news.upsert({
      where: { id: n.id },
      create: {
        id: n.id,
        title: n.title,
        text: n.text,
        status: 'PUBLISHED',
        publishedAt: now,
        imageUrl: `/uploads/covers/news-${n.id}.svg`,
      },
      update: {
        title: n.title,
        text: n.text,
        status: 'PUBLISHED',
        publishedAt: now,
      },
    });
  }

  const placesCount = await prisma.place.count({ where: { status: 'PUBLISHED' } });
  console.log('news upserted', newsSeed.length, 'places published', placesCount);
  console.log('seed-content-live done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
