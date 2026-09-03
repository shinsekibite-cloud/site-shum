/**
 * Fill portal with Sochi-themed content + stable role test accounts.
 * Idempotent upserts by fixed ids / emails.
 *
 *   docker-compose exec -T web node /app/scripts/seed-qa-fill.mjs
 *
 * Staging / QA accounts (password from QA_SEED_PASSWORD or STAGING_ADMIN_PASS env — never commit prod passwords):
 *   qa-admin@sochi.ru   ADMIN (preferred staging admin; does not touch prod admin@sochi.ru password)
 *   mod@sochi.ru        MODERATOR
 *   part@sochi.ru       PARTICIPANT
 *   user@sochi.ru       USER
 *   scanner@sochi.ru    SCANNER
 *   private@sochi.ru    USER PRIVATE profile
 * Existing users: password is NEVER overwritten.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const PASS = process.env.QA_SEED_PASSWORD || process.env.STAGING_ADMIN_PASS || '';
if (!PASS) {
  console.warn('QA_SEED_PASSWORD / STAGING_ADMIN_PASS not set — creating users only if missing, password required for new accounts');
}
const EFFECTIVE_PASS = PASS || `qa-local-${Date.now().toString(36)}`;
const DEMO_MARK = true;

function daysFromNow(days, hour = 14) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour - 3, 0, 0, 0); // approx MSK as UTC+3 for seed
  return d;
}

function hoursLater(start, hours) {
  return new Date(start.getTime() + hours * 3600 * 1000);
}

async function upsertUser(spec) {
  const password = await bcrypt.hash(EFFECTIVE_PASS, 10);
  const existing = await prisma.user.findUnique({ where: { email: spec.email } });
  if (existing) {
    // Never overwrite an existing password — QA seed used to reset admin@sochi.ru
    // and break the real admin login.
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: spec.name,
        role: spec.role,
        permissions: spec.permissions ?? null,
        profileVisibility: spec.profileVisibility || 'PUBLIC',
        friendInviteToken: spec.friendInviteToken ?? existing.friendInviteToken,
        bio: spec.bio ?? existing.bio,
        city: spec.city || 'Сочи',
        deletedAt: null,
        blockedAt: null,
        isDemoData: existing.isDemoData || DEMO_MARK,
      },
    });
  }
  return prisma.user.create({
    data: {
      email: spec.email,
      name: spec.name,
      role: spec.role,
      permissions: spec.permissions ?? null,
      password,
      profileVisibility: spec.profileVisibility || 'PUBLIC',
      friendInviteToken: spec.friendInviteToken || null,
      bio: spec.bio || null,
      city: spec.city || 'Сочи',
      privacyAcceptedAt: new Date(),
      rulesAcceptedAt: new Date(),
      cookiesAcceptedAt: new Date(),
      isDemoData: DEMO_MARK,
    },
  });
}

async function main() {
  console.log('QA fill: roles + content…');

  await prisma.siteSettings.upsert({
    where: { id: '1' },
    update: {
      siteName: 'Молодёжь Сочи',
      contactEmail: 'info@young.idivles.ru',
      contactPhone: '+7 (862) 264-00-00',
      address: 'г. Сочи, ул. Навагинская, 9',
      publicEventsVisibility: true,
      vkEnabled: true,
      tgEnabled: true,
    },
    create: {
      id: '1',
      siteName: 'Молодёжь Сочи',
      contactEmail: 'info@young.idivles.ru',
      contactPhone: '+7 (862) 264-00-00',
      address: 'г. Сочи, ул. Навагинская, 9',
      publicEventsVisibility: true,
    },
  });

  // Prefer dedicated staging admin — never rely on resetting prod admin@sochi.ru password
  const admin = await upsertUser({
    email: 'qa-admin@sochi.ru',
    name: 'QA Администратор',
    role: 'ADMIN',
    bio: 'Staging/QA админ портала (пароль только из env)',
  });
  // Keep role on prod admin if present, but do not set/reset password
  const prodAdmin = await prisma.user.findUnique({ where: { email: 'admin@sochi.ru' } });
  if (prodAdmin && prodAdmin.role !== 'ADMIN') {
    await prisma.user.update({ where: { id: prodAdmin.id }, data: { role: 'ADMIN' } });
  }
  const mod = await upsertUser({
    email: 'mod@sochi.ru',
    name: 'Модератор Портала',
    role: 'MODERATOR',
    permissions: 'projects,clubs,spaces,bookings,applications,pages,programs,news,stats,scanner',
    bio: 'Модерирую заявки и контент',
  });
  const participant = await upsertUser({
    email: 'part@sochi.ru',
    name: 'Активный Участник',
    role: 'PARTICIPANT',
    bio: 'Хожу на события и в клубы',
  });
  const user = await upsertUser({
    email: 'user@sochi.ru',
    name: 'Новый Пользователь',
    role: 'USER',
    bio: 'Только зарегистрировался',
  });
  const scanner = await upsertUser({
    email: 'scanner@sochi.ru',
    name: 'Сканер Входа',
    role: 'SCANNER',
  });
  const privateUser = await upsertUser({
    email: 'private@sochi.ru',
    name: 'Закрытый Профиль',
    role: 'USER',
    profileVisibility: 'PRIVATE',
    friendInviteToken: 'qa-invite-token-test-001',
    bio: 'Профиль скрыт',
  });
  const friendsOnly = await upsertUser({
    email: 'friends@sochi.ru',
    name: 'Только Для Друзей',
    role: 'USER',
    profileVisibility: 'FRIENDS',
    bio: 'Детали только друзьям',
  });

  console.log('users ok', {
    admin: admin.id,
    mod: mod.id,
    participant: participant.id,
    user: user.id,
    scanner: scanner.id,
  });

  const projects = [
    {
      id: 'qa_proj_media',
      title: 'Школа медиа',
      description:
        '<p>Практикум по фото, видео и SMM для молодёжи Сочи. Набор открыт на осенний поток.</p>',
      status: 'ACTIVE',
      image: '/covers/project-kvn.svg',
    },
    {
      id: 'qa_proj_volunteers',
      title: 'Добровольцы Сочи',
      description: '<p>Городские акции, помощь на событиях и волонтёрские смены.</p>',
      status: 'ACTIVE',
      image: '/covers/project-media.svg',
    },
    {
      id: 'qa_proj_forum',
      title: 'Молодёжный форум Сочи',
      description: '<p>Образовательные треки, спикеры и нетворкинг.</p>',
      status: 'ACTIVE',
      image: '/covers/project-eco.svg',
    },
    {
      id: 'qa_proj_done',
      title: 'Летний кампус 2025',
      description: '<p>Завершённый летний интенсив. Архив для портфолио.</p>',
      status: 'COMPLETED',
      image: '/covers/project-volunteers.svg',
    },
  ];

  for (const p of projects) {
    await prisma.project.upsert({
      where: { id: p.id },
      update: { ...p, isDemoData: DEMO_MARK },
      create: { ...p, isDemoData: DEMO_MARK },
    });
  }

  const clubs = [
    {
      id: 'qa_club_debate',
      title: 'Клуб дебатов',
      description: '<p>Еженедельные дебаты, риторика и публичные выступления.</p>',
      status: 'ACTIVE',
      meetingSchedule: 'Чт 18:00',
      meetingPlace: 'Дом молодёжи, зал А',
      curatorName: 'Анна Куратор',
      curatorContact: '@sochi_debate',
      curatorContactPublic: true,
      tags: 'дебаты, ораторское',
      image: '/covers/club-debate.svg',
    },
    {
      id: 'qa_club_board',
      title: 'Клуб настольных игр',
      description: '<p>Вечера настолок, турниры и открытые столы.</p>',
      status: 'ACTIVE',
      meetingSchedule: 'Сб 16:00',
      meetingPlace: 'Дом молодёжи, лобби',
      curatorName: 'Игорь',
      curatorContact: '+7 900 111-22-33',
      curatorContactPublic: false,
      tags: 'настолки, досуг',
      image: '/covers/club-photo.svg',
    },
    {
      id: 'qa_club_it',
      title: 'IT-комьюнити Сочи',
      description: '<p>Митапы разработчиков, хакатоны и разбор кейсов.</p>',
      status: 'ACTIVE',
      meetingSchedule: 'Вт 19:00',
      meetingPlace: 'Коворкинг',
      curatorName: 'Мария',
      curatorContact: 'it@sochi.ru',
      curatorContactPublic: true,
      tags: 'IT, хакатон',
      image: '/covers/club-board.svg',
    },
    {
      id: 'qa_club_archive',
      title: 'Клуб кино (архив)',
      description: '<p>Завершённый киноклуб прошлого сезона.</p>',
      status: 'COMPLETED',
      meetingSchedule: '—',
      meetingPlace: '—',
      tags: 'архив',
      image: '/covers/club-music.svg',
    },
  ];

  for (const c of clubs) {
    await prisma.club.upsert({
      where: { id: c.id },
      update: { ...c, isDemoData: DEMO_MARK },
      create: { ...c, isDemoData: DEMO_MARK },
    });
  }

  const spaces = [
    {
      id: 'qa_space_dm',
      title: 'Дом молодёжи',
      address: 'г. Сочи, ул. Навагинская, 9',
      description: '<p>Главная площадка: залы, коворкинг, сцена.</p>',
      category: 'Зал мероприятий',
      amenities: JSON.stringify(['wifi', 'projector', 'stage']),
      capacity: 120,
      status: 'ACTIVE',
      lat: 43.5855,
      lng: 39.7231,
      image: '/covers/space-house.svg',
    },
    {
      id: 'qa_space_cowork',
      title: 'Коворкинг «Идеи»',
      address: 'г. Сочи, ул. Навагинская, 9, 2 этаж',
      description: '<p>Рабочие места, переговорки, Wi‑Fi.</p>',
      category: 'Коворкинг',
      amenities: JSON.stringify(['wifi', 'printer']),
      capacity: 40,
      status: 'ACTIVE',
      lat: 43.5857,
      lng: 39.7233,
      image: '/covers/space-cowork.svg',
    },
    {
      id: 'qa_space_sport',
      title: 'Спортзал молодёжи',
      address: 'г. Сочи, ул. Партизанская, 20',
      description: '<p>Тренировки, йога, открытые занятия.</p>',
      category: 'Спорт',
      amenities: JSON.stringify(['gym', 'lockers']),
      capacity: 30,
      status: 'ACTIVE',
      image: '/covers/space-hall.svg',
    },
    {
      id: 'qa_space_season',
      title: 'Павильон на набережной',
      address: 'г. Сочи, Набережная',
      description: '<p>Сезонная площадка (архив).</p>',
      category: 'Общее',
      capacity: 80,
      status: 'COMPLETED',
      image: '/covers/space-sport.svg',
    },
  ];

  for (const s of spaces) {
    await prisma.space.upsert({
      where: { id: s.id },
      update: { ...s, isDemoData: DEMO_MARK },
      create: { ...s, isDemoData: DEMO_MARK },
    });
  }

  // Applications (unique per user+target)
  const apps = [
    { userId: participant.id, projectId: 'qa_proj_media', status: 'APPROVED', message: 'Хочу в медиа' },
    { userId: participant.id, clubId: 'qa_club_debate', status: 'APPROVED', message: 'Люблю дебаты' },
    { userId: user.id, projectId: 'qa_proj_volunteers', status: 'PENDING', message: 'Готов помогать' },
    { userId: user.id, clubId: 'qa_club_board', status: 'PENDING', message: 'Играю в настолки' },
    { userId: friendsOnly.id, clubId: 'qa_club_debate', status: 'APPROVED', message: 'Участник' },
    { userId: privateUser.id, clubId: 'qa_club_it', status: 'APPROVED', message: 'IT' },
    { userId: mod.id, projectId: 'qa_proj_forum', status: 'APPROVED', message: 'Модератор-участник' },
  ];

  for (const a of apps) {
    const where = a.clubId
      ? { userId_clubId: { userId: a.userId, clubId: a.clubId } }
      : { userId_projectId: { userId: a.userId, projectId: a.projectId } };
    try {
      await prisma.application.upsert({
        where,
        update: { status: a.status, message: a.message, isDemoData: DEMO_MARK },
        create: {
          userId: a.userId,
          projectId: a.projectId || null,
          clubId: a.clubId || null,
          status: a.status,
          message: a.message,
          isDemoData: DEMO_MARK,
        },
      });
    } catch (e) {
      // Fallback if compound unique name differs
      const existing = await prisma.application.findFirst({
        where: {
          userId: a.userId,
          ...(a.clubId ? { clubId: a.clubId } : { projectId: a.projectId }),
        },
      });
      if (existing) {
        await prisma.application.update({
          where: { id: existing.id },
          data: { status: a.status, message: a.message },
        });
      } else {
        await prisma.application.create({
          data: {
            userId: a.userId,
            projectId: a.projectId || null,
            clubId: a.clubId || null,
            status: a.status,
            message: a.message,
            isDemoData: DEMO_MARK,
          },
        });
      }
    }
  }

  // Bookings: past + upcoming
  const bookingSpecs = [
    {
      id: 'qa_book_past_walk',
      title: 'Прогулка по центру (прошедшее)',
      spaceId: 'qa_space_dm',
      userId: participant.id,
      status: 'APPROVED',
      start: daysFromNow(-5, 11),
      hours: 2,
    },
    {
      id: 'qa_book_past_meetup',
      title: 'IT-митап (прошедшее)',
      spaceId: 'qa_space_cowork',
      userId: admin.id,
      status: 'APPROVED',
      start: daysFromNow(-2, 18),
      hours: 3,
    },
    {
      id: 'qa_book_upcoming_quiz',
      title: 'Квиз для молодёжи',
      spaceId: 'qa_space_dm',
      userId: participant.id,
      status: 'APPROVED',
      start: daysFromNow(3, 17),
      hours: 2,
    },
    {
      id: 'qa_book_upcoming_yoga',
      title: 'Открытая йога',
      spaceId: 'qa_space_sport',
      userId: user.id,
      status: 'PENDING',
      start: daysFromNow(5, 10),
      hours: 1.5,
    },
    {
      id: 'qa_book_upcoming_hack',
      title: 'Хакатон идей',
      spaceId: 'qa_space_cowork',
      userId: mod.id,
      status: 'APPROVED',
      start: daysFromNow(10, 12),
      hours: 6,
    },
    {
      id: 'qa_book_upcoming_film',
      title: 'Киновечер',
      spaceId: 'qa_space_dm',
      userId: admin.id,
      status: 'APPROVED',
      start: daysFromNow(14, 19),
      hours: 3,
    },
  ];

  for (const b of bookingSpecs) {
    const startTime = b.start;
    const endTime = hoursLater(startTime, b.hours);
    await prisma.booking.upsert({
      where: { id: b.id },
      update: {
        title: b.title,
        spaceId: b.spaceId,
        userId: b.userId,
        status: b.status,
        startTime,
        endTime,
        description: 'QA наполнение: активное/прошедшее событие',
        isDemoData: DEMO_MARK,
      },
      create: {
        id: b.id,
        title: b.title,
        spaceId: b.spaceId,
        userId: b.userId,
        status: b.status,
        startTime,
        endTime,
        description: 'QA наполнение: активное/прошедшее событие',
        isDemoData: DEMO_MARK,
      },
    });
  }

  // Participants on approved bookings
  const joins = [
    { bookingId: 'qa_book_upcoming_quiz', userId: user.id },
    { bookingId: 'qa_book_upcoming_quiz', userId: friendsOnly.id },
    { bookingId: 'qa_book_upcoming_hack', userId: participant.id },
    { bookingId: 'qa_book_upcoming_film', userId: participant.id },
    { bookingId: 'qa_book_past_walk', userId: user.id },
  ];
  for (const j of joins) {
    const exists = await prisma.bookingParticipant.findFirst({
      where: { bookingId: j.bookingId, userId: j.userId },
    });
    if (!exists) {
      await prisma.bookingParticipant.create({
        data: {
          bookingId: j.bookingId,
          userId: j.userId,
          attendanceStatus: j.bookingId.includes('past') ? 'CHECKED_IN' : 'PENDING',
        },
      });
    }
  }

  // Friendship: participant ↔ user
  const fr = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: participant.id, addresseeId: user.id },
        { requesterId: user.id, addresseeId: participant.id },
      ],
    },
  });
  if (!fr) {
    await prisma.friendship.create({
      data: {
        requesterId: participant.id,
        addresseeId: user.id,
        status: 'ACCEPTED',
      },
    });
  }

  // News
  const newsItems = [
    {
      id: 'qa_news_1',
      title: 'Открыт набор в Школу медиа',
      text: 'Подавайте заявки на портале до конца месяца. Кураторы ответят в личном кабинете.',
      imageUrl: '/covers/news-portal.svg',
    },
    {
      id: 'qa_news_2',
      title: 'Клубы принимают участников',
      text: 'Дебаты, настолки и IT-комьюнити ждут новые лица. Заявки — в карточке клуба.',
      imageUrl: '/covers/news-clubs.svg',
    },
    {
      id: 'qa_news_3',
      title: 'Афиша августа: квиз, йога, хакатон',
      text: 'Смотрите раздел «Афиша» и записывайтесь на открытые мероприятия.',
      imageUrl: '/covers/news-default.svg',
    },
  ];
  for (const n of newsItems) {
    await prisma.news.upsert({
      where: { id: n.id },
      update: { ...n, isDemoData: DEMO_MARK },
      create: { ...n, isDemoData: DEMO_MARK },
    });
  }

  // Give participant some achievements toward member visibility (not full set)
  const basicAchievements = ['PRIVACY_OK', 'FIRST_FRIEND', 'PROFILE_BIO'];
  for (const code of basicAchievements) {
    await prisma.userAchievement.upsert({
      where: { userId_code: { userId: participant.id, code } },
      update: {},
      create: { userId: participant.id, code },
    }).catch(async () => {
      const ex = await prisma.userAchievement.findFirst({
        where: { userId: participant.id, code },
      });
      if (!ex) {
        await prisma.userAchievement.create({ data: { userId: participant.id, code } });
      }
    });
  }

  // Admin gets LEGEND so members list unlocks for staff-like check; already isStaff
  await prisma.userAchievement.upsert({
    where: { userId_code: { userId: admin.id, code: 'LEGEND' } },
    update: {},
    create: { userId: admin.id, code: 'LEGEND' },
  }).catch(async () => {
    const ex = await prisma.userAchievement.findFirst({
      where: { userId: admin.id, code: 'LEGEND' },
    });
    if (!ex) await prisma.userAchievement.create({ data: { userId: admin.id, code: 'LEGEND' } });
  });

  const summary = {
    projects: await prisma.project.count(),
    clubs: await prisma.club.count(),
    spaces: await prisma.space.count(),
    bookings: await prisma.booking.count(),
    applications: await prisma.application.count(),
    news: await prisma.news.count(),
    users: await prisma.user.count({ where: { deletedAt: null } }),
    password: PASS ? '(from QA_SEED_PASSWORD)' : '(generated once for new users only)',
    accounts: [
      'admin@sochi.ru ADMIN',
      'mod@sochi.ru MODERATOR',
      'part@sochi.ru PARTICIPANT',
      'user@sochi.ru USER',
      'scanner@sochi.ru SCANNER',
      'private@sochi.ru USER PRIVATE',
      'friends@sochi.ru USER FRIENDS',
    ],
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
