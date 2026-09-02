#!/usr/bin/env node
/**
 * Starter / demo content for a new organization (no real PII).
 * Respects current SiteSettings.moduleFlagsJson — skips entities for off modules.
 *
 * Env:
 *   SITE_NAME, PUBLIC_URL, CONTACT_EMAIL, CONTACT_PHONE, ADDRESS
 *   SEED_ORG_DEMO=1 (default) — create sample projects/clubs/news/…
 *
 * Safe to re-run (idempotent by title / slug markers).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const siteName = String(process.env.SITE_NAME || 'Молодёжный портал').trim();
const publicUrl = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
const contactEmail = String(process.env.CONTACT_EMAIL || 'admin@example.org').trim();
const contactPhone = String(process.env.CONTACT_PHONE || '+7 (000) 000-00-00').trim();
const address = String(process.env.ADDRESS || 'г. Пример, ул. Центральная, 1').trim();
const wantDemo = String(process.env.SEED_ORG_DEMO || '1') !== '0';

function parseFlags(raw) {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function on(flags, key) {
  return flags[key] !== false;
}

async function ensureOne(model, where, data) {
  const existing = await model.findFirst({ where });
  if (existing) return existing;
  return model.create({ data });
}

async function main() {
  const settings = await prisma.siteSettings.upsert({
    where: { id: '1' },
    create: {
      id: '1',
      siteName,
      publicSiteUrl: publicUrl || null,
      contactEmail,
      contactPhone,
      address,
      publicEventsVisibility: true,
    },
    update: {
      siteName,
      ...(publicUrl ? { publicSiteUrl: publicUrl } : {}),
      contactEmail,
      contactPhone,
      address,
    },
  });

  const flags = parseFlags(settings.moduleFlagsJson);
  console.log('Org starter:', siteName, publicUrl || '(no url)');
  console.log('Demo content:', wantDemo ? 'yes' : 'no');

  if (!wantDemo) {
    console.log('Skip demo entities (SEED_ORG_DEMO=0)');
    return;
  }

  if (on(flags, 'projects')) {
    await ensureOne(
      prisma.project,
      { title: 'Демо-проект «Первые шаги»' },
      {
        title: 'Демо-проект «Первые шаги»',
        description:
          'Пример проекта для новой организации. Замените текст и обложку в админке.',
        status: 'ACTIVE',
        isDemoData: true,
      }
    );
    await ensureOne(
      prisma.project,
      { title: 'Демо-проект «Городские инициативы»' },
      {
        title: 'Демо-проект «Городские инициативы»',
        description: 'Второй пример карточки проекта. Можно удалить после наполнения.',
        status: 'ACTIVE',
        isDemoData: true,
      }
    );
    console.log('  + projects');
  }

  if (on(flags, 'clubs')) {
    await ensureOne(
      prisma.club,
      { title: 'Демо-клуб «Творчество»' },
      {
        title: 'Демо-клуб «Творчество»',
        description: 'Пример клуба. Отредактируйте расписание и описание.',
        status: 'ACTIVE',
        isDemoData: true,
      }
    );
    console.log('  + clubs');
  }

  let space = null;
  if (on(flags, 'spaces') || on(flags, 'events')) {
    space = await ensureOne(
      prisma.space,
      { title: 'Демо-пространство «Коворкинг»' },
      {
        title: 'Демо-пространство «Коворкинг»',
        address,
        description: 'Пример пространства для встреч и мероприятий.',
        capacity: 40,
        status: 'ACTIVE',
        isDemoData: true,
      }
    );
    console.log('  + spaces');
  }

  if (on(flags, 'news')) {
    await ensureOne(
      prisma.news,
      { title: 'Добро пожаловать на портал' },
      {
        title: 'Добро пожаловать на портал',
        text: 'Это демо-новость. Опубликуйте свои материалы в разделе «Новости» админки.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        isDemoData: true,
      }
    );
    console.log('  + news');
  }

  if (on(flags, 'events') && space) {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      const start = new Date();
      start.setDate(start.getDate() + 7);
      start.setHours(18, 0, 0, 0);
      const end = new Date(start);
      end.setHours(20, 0, 0, 0);
      await ensureOne(
        prisma.booking,
        { title: 'Демо-мероприятие «Открытие сезона»' },
        {
          title: 'Демо-мероприятие «Открытие сезона»',
          description: 'Пример записи в афише. Измените дату и описание в админке.',
          startTime: start,
          endTime: end,
          spaceId: space.id,
          userId: admin.id,
          status: 'APPROVED',
          isDemoData: true,
        }
      );
      console.log('  + events (booking)');
    } else {
      console.log('  · events skipped (no ADMIN yet)');
    }
  }

  if (on(flags, 'places')) {
    await ensureOne(
      prisma.place,
      { slug: 'demo-park' },
      {
        title: 'Демо-место «Парк»',
        slug: 'demo-park',
        summary: 'Пример карточки «Куда сходить».',
        description: 'Отредактируйте или удалите в админке после наполнения своим контентом.',
        category: 'PARK',
        address,
        status: 'PUBLISHED',
        isDemoData: true,
      }
    );
    console.log('  + places');
  }

  await prisma.pageContent.upsert({
    where: { slug: 'about' },
    update: {
      title: 'О нас',
      content: `<p>${siteName} — демо-страница «О нас». Замените текст в админке.</p>`,
    },
    create: {
      slug: 'about',
      title: 'О нас',
      content: `<p>${siteName} — демо-страница «О нас». Замените текст в админке.</p>`,
      images: '[]',
      menuPosition: 'NONE',
    },
  });

  console.log('Org starter done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
