/**
 * Seed official awards for QA.
 *   DATABASE_URL=… npx tsx scripts/seed-awards-demo.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { hash } from 'bcrypt';
import { issueOfficialDocument } from '../src/lib/issue-official-document';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const siteName = process.env.SITE_NAME || 'YoungPortal';

  await prisma.siteSettings.upsert({
    where: { id: '1' },
    update: { siteName },
    create: { id: '1', siteName },
  });

  const admin =
    (await prisma.user.findFirst({
      where: { role: 'ADMIN', deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })) || null;

  let user = await prisma.user.findUnique({ where: { email: 'demo.awards@example.com' } });
  if (!user) {
    const passwordHash = await hash('DemoUserPass1!', 10);
    user = await prisma.user.create({
      data: {
        email: 'demo.awards@example.com',
        name: 'Алексей Демо',
        password: passwordHash,
        role: 'USER',
        emailVerified: new Date(),
      },
    });
    console.log('Created demo.awards@example.com / DemoUserPass1!');
  }

  const samples = [
    {
      type: 'DIPLOMA' as const,
      title: 'За победу в конкурсе идей',
      subtitle: 'Сезон тестирования',
      body: 'За креативный подход и вклад в развитие сообщества портала',
    },
    {
      type: 'CERTIFICATE' as const,
      title: 'Прохождение инструктажа',
      subtitle: 'Обучение',
      body: 'Подтверждает освоение базовых разделов портала',
    },
    {
      type: 'GRATITUDE' as const,
      title: 'Благодарность волонтёру',
      subtitle: null,
      body: 'За помощь в организации мероприятий',
    },
    {
      type: 'HONORARY' as const,
      title: 'Почётная грамота активисту',
      subtitle: 'За особые заслуги',
      body: 'За поддержку инициатив на портале',
    },
    {
      type: 'AWARD' as const,
      title: 'Знак отличия «Надёжный участник»',
      subtitle: 'Рейтинг посещаемости',
      body: 'За регулярное посещение событий',
    },
  ];

  for (const s of samples) {
    const existing = await prisma.officialDocument.findFirst({
      where: { userId: user.id, type: s.type, title: s.title, status: 'ISSUED' },
    });
    if (existing) {
      console.log('skip', s.type, existing.serialNumber);
      continue;
    }
    const doc = await issueOfficialDocument({
      userId: user.id,
      type: s.type,
      title: s.title,
      subtitle: s.subtitle,
      body: s.body,
      recipientName: user.name,
      issuerName: siteName,
      issuedById: admin?.id || null,
      linkToPortfolio: true,
    });
    console.log('OK', doc.type, doc.serialNumber, doc.pdfPath);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
