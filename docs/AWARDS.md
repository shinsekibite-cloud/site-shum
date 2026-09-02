# Награды, дипломы и сертификаты

Администрация выдаёт официальные документы участникам. PDF хранится на сайте, просматривается и скачивается, попадает в портфолио и открывает достижения.

## Типы

| Тип | Назначение |
|-----|------------|
| `DIPLOMA` | Диплом |
| `CERTIFICATE` | Сертификат |
| `GRATITUDE` | Благодарность |
| `HONORARY` | Почётная грамота |
| `AWARD` | Награда / знак отличия |

## Где в UI

- Админ: `/admin/awards` — поиск участника, бланк, выдача PDF
- Участник: `/dashboard/awards`, просмотр `/awards/[id]`, PDF `/api/awards/[id]/pdf`
- Портфолио: запись в «Грамоты, сертификаты, дипломы»
- Достижения: `FIRST_OFFICIAL_DOC`, `OFFICIAL_DIPLOMA`, …

## Миграция / seed

```bash
npx prisma db push
DATABASE_URL=… SITE_NAME="YoungPortal" npx tsx scripts/seed-awards-demo.ts
# demo.awards@example.com / DemoUserPass1!
```

Шрифты кириллицы: `public/fonts/DejaVuSans*.ttf`.
