import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fakerRU as faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
  try {
    if (process.env.ALLOW_DEMO_SEED !== '1' && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { message: 'Демо-сид отключён на production. Установите ALLOW_DEMO_SEED=1 только на staging.' },
        { status: 403 }
      );
    }

    const session = await getServerSession(authOptions);
    // @ts-ignore
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ message: 'Доступ запрещен' }, { status: 403 });
    }

    // Очистка старых демо-данных
    await prisma.application.deleteMany({ where: { isDemoData: true } });
    await prisma.bookingParticipant.deleteMany({ where: { booking: { isDemoData: true } } });
    await prisma.booking.deleteMany({ where: { isDemoData: true } });
    await prisma.project.deleteMany({ where: { isDemoData: true } });
    await prisma.club.deleteMany({ where: { isDemoData: true } });
    await prisma.space.deleteMany({ where: { isDemoData: true } });
    await prisma.news.deleteMany({ where: { isDemoData: true } });
    await prisma.user.deleteMany({ where: { isDemoData: true } });

    const passwordHash = await bcrypt.hash('demo_password_123', 10);

    // 1. Создаем пользователей (100)
    const timestamp = Date.now();
    const roles: ('USER' | 'MODERATOR')[] = ['USER', 'MODERATOR'];
    const usersData = Array.from({ length: 100 }).map((_, i) => ({
      name: faker.person.fullName(),
      email: `demo_${timestamp}_${i}_${faker.internet.email().toLowerCase()}`,
      phone: `+7900${String(i).padStart(3, '0')}${String(timestamp).slice(-4)}`,
      password: passwordHash,
      role: faker.helpers.arrayElement(roles),
      isDemoData: true,
      image: faker.image.avatar(),
    }));
    await prisma.user.createMany({ data: usersData });
    const users = await prisma.user.findMany({ where: { isDemoData: true } });

    // 2. Проекты (15) - Активные и Закрытые (status)
    const projectTemplates: ('DEFAULT' | 'GALLERY' | 'TEAM' | 'FAQ' | 'HERO' | 'FEATURES' | 'CONTACTS')[] = ['DEFAULT', 'GALLERY', 'TEAM', 'FAQ', 'HERO', 'FEATURES', 'CONTACTS'];
    const statuses: ('ACTIVE' | 'COMPLETED' | 'INACTIVE')[] = ['ACTIVE', 'COMPLETED', 'INACTIVE'];
    const generateGallery = () => JSON.stringify(Array.from({ length: faker.number.int({ min: 3, max: 6 }) }).map(() => faker.image.url({ width: 800, height: 600 })));

    for (let i = 0; i < 15; i++) {
      await prisma.project.create({
        data: {
          title: 'Проект: ' + faker.company.catchPhrase(),
          description: '<p>' + faker.lorem.paragraphs(3, '</p><p>') + '</p>',
          image: faker.image.url({ width: 800, height: 600 }),
          gallery: generateGallery(),
          template: faker.helpers.arrayElement(projectTemplates),
          status: faker.helpers.arrayElement(statuses),
          isDemoData: true,
        },
      });
    }
    const projects = await prisma.project.findMany({ where: { isDemoData: true } });

    // 3. Клубы (10)
    for (let i = 0; i < 10; i++) {
      await prisma.club.create({
        data: {
          title: 'Клуб: ' + faker.commerce.department(),
          description: '<p>' + faker.lorem.paragraphs(2, '</p><p>') + '</p>',
          image: faker.image.url({ width: 800, height: 600 }),
          gallery: generateGallery(),
          template: faker.helpers.arrayElement(projectTemplates),
          status: faker.helpers.arrayElement(statuses),
          isDemoData: true,
        },
      });
    }
    const clubs = await prisma.club.findMany({ where: { isDemoData: true } });

    // 4. Пространства (10)
    for (let i = 0; i < 10; i++) {
      await prisma.space.create({
        data: {
          title: 'Пространство: ' + faker.location.street(),
          description: '<p>' + faker.lorem.paragraphs(2, '</p><p>') + '</p>',
          address: faker.location.streetAddress(),
          capacity: faker.number.int({ min: 10, max: 300 }),
          image: faker.image.url({ width: 800, height: 600 }),
          gallery: generateGallery(),
          template: faker.helpers.arrayElement(projectTemplates),
          status: faker.helpers.arrayElement(statuses),
          isDemoData: true,
        },
      });
    }
    const spaces = await prisma.space.findMany({ where: { isDemoData: true } });

    // 5. Заявки (100) - Все возможные статусы
    for (let i = 0; i < 100; i++) {
      const isClub = faker.datatype.boolean();
      await prisma.application.create({
        data: {
          userId: faker.helpers.arrayElement(users).id,
          projectId: isClub ? null : faker.helpers.arrayElement(projects).id,
          clubId: isClub ? faker.helpers.arrayElement(clubs).id : null,
          status: faker.helpers.arrayElement(['PENDING', 'APPROVED', 'REJECTED'] as ('PENDING' | 'APPROVED' | 'REJECTED')[]),
          message: faker.lorem.sentence(),
          isDemoData: true,
        },
      });
    }

    // 6. Мероприятия/Бронирования (50) - Прошедшие, Текущие, Будущие
    for (let i = 0; i < 50; i++) {
      const space = faker.helpers.arrayElement(spaces);
      const isPast = faker.datatype.boolean();
      const startTime = isPast ? faker.date.recent({ days: 30 }) : faker.date.soon({ days: 30 });
      const endTime = new Date(startTime.getTime() + faker.number.int({ min: 1, max: 5 }) * 60 * 60 * 1000);

      const booking = await prisma.booking.create({
        data: {
          title: faker.commerce.productName() + ' Мероприятие',
          description: faker.lorem.sentences(2),
          startTime,
          endTime,
          spaceId: space.id,
          userId: faker.helpers.arrayElement(users).id,
          status: faker.helpers.arrayElement(['PENDING', 'APPROVED', 'REJECTED'] as ('PENDING' | 'APPROVED' | 'REJECTED')[]),
          isDemoData: true,
        },
      });

      // Добавляем участников для одобренных мероприятий
      if (booking.status === 'APPROVED') {
        const participantsCount = faker.number.int({ min: 0, max: 20 });
        const shuffledUsers = faker.helpers.shuffle(users).slice(0, participantsCount);
        
        for (const u of shuffledUsers) {
          try {
            await prisma.bookingParticipant.create({
              data: {
                bookingId: booking.id,
                userId: u.id
              }
            });
          } catch(e) {}
        }
      }
    }

    return NextResponse.json({ message: 'Демо-данные успешно сгенерированы! Пароль для пользователей: demo_password_123' }, { status: 200 });
  } catch (error) {
    console.error('Ошибка демо-сидирования:', error);
    return NextResponse.json({ message: 'Ошибка при создании демо-данных. Смотрите логи сервера.' }, { status: 500 });
  }
}
