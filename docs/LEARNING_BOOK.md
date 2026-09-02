# Книга обучения: Young Portal (young.idivles.ru)

Практическое руководство, чтобы понять архитектуру портала и научиться развивать его как прод-инженер.

## 1. Карта системы

```
Браузер / PWA
  → Nginx (TLS, rate limit)
    → Docker `sochi-portal_web_1` (Next.js App Router)
      → PostgreSQL + Redis
      → Telegram / MAX webhooks
```

Ключевые каталоги:

| Путь | Зачем |
|------|--------|
| `src/app/` | Страницы и API routes |
| `src/components/` | UI |
| `src/lib/` | Доменные правила (эко, ACL, боты) |
| `prisma/schema.prisma` | Модель данных |
| `scripts/deploy-vps.sh` | Деплой на VPS (SSH **4488**) |
| `docs/` | Операционные гайды |

Прод: `/opt/sochi-portal` · https://young.idivles.ru

## 2. Стек и лучшие практики

1. **Server Components по умолчанию**, `'use client'` только для интерактива.
2. **Zod** на входе API — не доверять телу запроса.
3. **Prisma** + `db push` (аддитивные поля). Транзакции для списаний (`ecoPoints >= cost`).
4. **Один источник правды UI** — не дублировать магазин/рейтинги в модалке и профиле.
5. **Секреты только в `.env`**, не в git.
6. **Идемпотентный деплой**: rsync без удаления `data/`, `uploads/`, `.env`.

## 3. Роли и TECH

| Роль | Доступ |
|------|--------|
| USER / PARTICIPANT | Кабинет, события |
| MODERATOR | `/admin` по permissions |
| ADMIN | Полный `/admin` |
| TECH | Только `/ops` (kill-switch) |
| SCANNER | QR |

### Как войти в TECH

1. В `.env` на сервере:
   ```
   TECH_EMAIL=tech@young.idivles.ru
   TECH_BOOTSTRAP_PASSWORD=...сильный пароль...
   ```
2. Откройте https://young.idivles.ru/login
3. Войдите этим email/паролем — учётка создаётся с ролью `TECH`.
4. Попадёте на `/ops`. `/admin` для TECH закрыт.

После первого входа пароль хранится как bcrypt; bootstrap нужен только для создания.

## 4. Профиль — единое место

Канон: `/dashboard?tab=profile`

- **Обзор** — герой (аватар, значки, рейтинги), эко-магазин, карточки/витрина, рефералка, инструктаж.
- **Редактировать** — поля профиля.
- **Настройки** — приватность, пароль, prefs уведомлений, мессенджеры.

Публичный вид: `/u/[code]`. Не плодить второй «профиль» в `/more`.

### Значки под аватаром

`showcaseBadges` в User. Редактор в `ProfileHeroCard`: черновик → «Сохранить».  
Пустой массив = сняты все значки (не автозаполнять).

### Карточная витрина

Отдельно от значков: `collectiblesJson.showcase` через `POST /api/user/collectibles`.

## 5. Эко-баллы

- Начисление: `bumpEcoPoints` / пул.
- Покупка: атомарный `spendEcoPoints`.
- Эффекты: `VoiceProvider.applyDomEffects` + CSS `data-eco-*`.
- Магазин только в обзоре профиля (не в модалке рейтингов).

## 6. Уведомления

- Inbox: `UserNotification`, колокольчик, SSE `/api/user/notifications/stream`.
- Prefs: `notificationPrefsJson` + `/api/user/notification-prefs`.
- Создание: `createUserNotification` уважает muted/push.

## 7. Боты

Deep-link: `/start link_<token>` (`src/lib/messenger-link.ts`).  
Webhook Telegram/MAX вызывает `tryBindMessengerFromStart`.

## 8. Деплой и бэкап

```bash
SSHPASS='…' ./scripts/deploy-vps.sh root@176.124.204.53 4488
```

Бэкап: `scripts/backup-postgres.sh` / полный tar проекта с VPS.  
Схему после новых полей: `docker-compose exec web npx prisma db push`.

## 9. Как добавить фичу (чеклист)

1. Поле в Prisma → `db push`.
2. Zod + API route с сессией и ACL.
3. UI в каноническом месте (без дублей).
4. Лог действия / уведомление при необходимости.
5. Деплой + smoke `https://young.idivles.ru/api/health`.
6. Короткий абзац в `docs/`.

## 10. Антипаттерны

- Два магазина эко на одной странице.
- `resolveShowcaseCodes` перезаписывает пустой выбор дефолтами.
- Тяжёлый `/api/user/achievements` на каждый рендер героя → используйте `?lite=1`.
- SSH на порт 22 вместо **4488**.
- Коммит `.env` и паролей.

## 11. Упражнения

1. Добавьте косметику `frame_pearl` с CSS и покупкой.
2. Сделайте mute категории в prefs и проверьте, что `createUserNotification` молчит.
3. Привяжите Telegram через deep-link без ручного ID.
4. Выкатите патч через `deploy-vps.sh` и проверьте health.

Успехов — пишите код так, будто его будут читать через год.
