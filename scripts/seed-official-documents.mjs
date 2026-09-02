/**
 * Replace SiteDocument library with official CRM / VK-channel materials.
 * Removes test/demo docs, keeps (or recreates) #правилаДМ + signup memo,
 * and adds additional official memos for the portal.
 *
 * Run on VPS:
 *   docker-compose exec -T -e PUBLIC_DIR=/app/public web node /app/scripts/seed-official-documents.mjs
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

function writeTxt(id, body) {
  const dir = path.join(PUBLIC, 'uploads', 'documents');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${id}.txt`;
  const full = path.join(dir, fileName);
  const buf = Buffer.from(String(body).trim() + '\n', 'utf8');
  fs.writeFileSync(full, buf);
  return {
    url: `/uploads/documents/${fileName}`,
    fileName,
    mimeType: 'text/plain',
    sizeBytes: buf.length,
  };
}

const DOCS = [
  {
    id: 'doc_pravila_dm',
    title: 'Правила посещения Дома молодёжи',
    description: 'Памятка #правилаДМ из материалов группы VK / Telegram-закрепа',
    category: 'Правила',
    body: `Правила посещения Дома молодёжи (памятка)
Центр развития молодёжи Сочи · ул. Навагинская, 9

Актуальная версия в Telegram: https://t.me/crm_sochi/26243
Хештег в VK: #правилаДМ
Группа: https://vk.ru/crm.sochi

1. Посещение клубов и занятий — по записи из афиши недели.
2. Соблюдайте распорядок площадки и требования сотрудников.
3. Вопросы администратору ДМ в MAX: +7 988 236-50-22.
4. Анонсы мероприятий — #анонс; расписание недели — #афишанедели.

Документ загружен из официальных материалов канала/группы CRM Sochi.
Дальнейшие правки — в админке портала → Документы.`,
  },
  {
    id: 'doc_kak_zapisatsya',
    title: 'Памятка: как записаться в клубы',
    description: 'Контакты записи из афиши недели #афишанедели',
    category: 'Правила',
    body: `Памятка: как записаться
Центр развития молодёжи Сочи

• Гимнастика — телефон +7 918 304-85-88
• Клуб «Молодая семья» (ОВЗ, Тимирязева) — +7 963 164-23-97 (Наталья)
• «Новое время», «Нити», «Амплитуда» — Telegram-бот @crm_molodsochi_bot
• ММА / рукопашный бой — https://t.me/+QMfAe7ELGrcyZDZi
• Обсуждение фильма — анкета в афише недели
• Вокал / гитара — https://t.me/+cmHtvAv0Zm82MGZi

Афиша недели обновляется по понедельникам (#афишанедели).
FAQ на портале: /faq
Контакты центра: /contacts`,
  },
  {
    id: 'doc_reglament_bron',
    title: 'Регламент бронирования пространств',
    description: 'Официальный порядок подачи и согласования брони на портале',
    category: 'Регламенты',
    body: `Регламент бронирования молодёжных пространств
Центр развития молодёжи Сочи

1. Бронь доступна авторизованным участникам портала.
2. Рабочие часы площадок по умолчанию: 09:00–21:00 (МСК), если иное не указано в карточке пространства.
3. Заявка рассматривается администрацией / модераторами. Статус видно в личном кабинете.
4. Отмена — не менее чем за 3 часа до начала, через кабинет или обращение к администратору.
5. Организатор отвечает за порядок, сохранность имущества и соблюдение правил площадки.
6. При конфликте слотов приоритет у мероприятий Центра и ранее одобренных броней.

Подробнее: раздел «Пространства» и правила сайта /rules.`,
  },
  {
    id: 'doc_polozhenie_spaces',
    title: 'Положение об использовании пространств',
    description: 'Порядок использования Дома молодёжи и Молодёжного центра',
    category: 'Положения',
    body: `Положение об использовании молодёжных пространств
Центр развития молодёжи Сочи

Площадки (в т.ч. Дом молодёжи, ул. Навагинская, 9; Молодёжный центр, ул. Тимирязева, 6)
предоставляются для мероприятий, обучения, клубов и творческих встреч молодёжи Сочи.

1. Использование — по согласованию администрации и/или через бронь на портале.
2. Запрещены действия, нарушающие законодательство РФ, правила площадки и права других участников.
3. Фото- и видеосъёмка на мероприятиях может вестись организаторами для отчётов и медиа Центра.
4. Материальный ущерб возмещается в установленном порядке.

См. также: Правила посещения ДМ (#правилаДМ) и раздел «Документы».`,
  },
  {
    id: 'doc_pamyatka_meropriyatie',
    title: 'Памятка участника мероприятия',
    description: 'Что нужно знать перед визитом на событие Центра',
    category: 'Памятки',
    body: `Памятка участника мероприятия
Центр развития молодёжи Сочи

• Запись / билет — через портал (афиша, QR) или контакты из анонса.
• Приходите заранее; при входе может понадобиться QR или список участников.
• Соблюдайте правила площадки и указания волонтёров / сотрудников.
• При плохом самочувствии оставайтесь дома и предупредите организаторов.
• Вопросы по конкретному событию — куратору из карточки мероприятия или MAX +7 988 236-50-22.

Анонсы: #анонс в VK crm.sochi и раздел «Новости» / «Афиша» на портале.`,
  },
  {
    id: 'doc_privacy_short',
    title: 'Краткая памятка по персональным данным',
    description: 'Сжатая выдержка; полная политика — на странице /privacy',
    category: 'Правовые',
    body: `Памятка по обработке персональных данных
Центр развития молодёжи Сочи

Портал обрабатывает персональные данные участников в соответствии с законодательством РФ
(в т.ч. 152-ФЗ). Полная актуальная политика: https://y1.idivles.ru/privacy
(на проде — страница /privacy вашего домена).

• Согласия фиксируются при регистрации и при обновлении политики.
• Можно запросить доступ, уточнение или удаление данных через контакты оператора.
• Для входа через сторонние сервисы (при подключении) действуют их политики.

Контакты оператора указаны на странице /contacts.`,
  },
  {
    id: 'doc_code_of_conduct',
    title: 'Кодекс участника сообщества',
    description: 'Нормы общения и поведения в проектах, клубах и на площадках',
    category: 'Правила',
    body: `Кодекс участника сообщества
Центр развития молодёжи Сочи

1. Уважайте друг друга: без травли, дискриминации и оскорблений.
2. Соблюдайте правила площадок и требования сотрудников.
3. Не распространяйте персональные данные других участников без согласия.
4. Контент и материалы мероприятий используйте с указанием источника / по правилам организаторов.
5. Нарушения могут привести к ограничению доступа к порталу и площадкам.

Полные правила сайта: /rules · Пользовательское соглашение: /terms`,
  },
];

async function upsertDoc(meta) {
  const file = writeTxt(meta.id, meta.body);
  const existing = await prisma.siteDocument.findUnique({ where: { id: meta.id } });
  const data = {
    title: meta.title,
    description: meta.description,
    category: meta.category,
    fileUrl: file.url,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    status: 'PUBLISHED',
    publishedAt: existing?.publishedAt || new Date(),
    isDemoData: false,
  };
  if (existing) {
    await prisma.siteDocument.update({ where: { id: meta.id }, data });
  } else {
    await prisma.siteDocument.create({ data: { id: meta.id, ...data } });
  }
  console.log('upsert', meta.id);
}

async function main() {
  // Remove ad-hoc tests and old demo drafts
  const removed = await prisma.siteDocument.deleteMany({
    where: {
      OR: [
        { isDemoData: true },
        { title: { equals: 'Тест', mode: 'insensitive' } },
        { id: { in: ['doc_form_apply', 'doc_privacy_excerpt', 'doc_rules_booking'] } },
      ],
    },
  });
  console.log('removed', removed.count);

  for (const d of DOCS) {
    await upsertDoc(d);
  }
  console.log('Done official documents:', DOCS.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
