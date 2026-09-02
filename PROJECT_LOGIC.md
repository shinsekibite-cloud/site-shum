# Карта логики young.idivles.ru

Прод-путь на VPS: **`/opt/sochi-portal`**. Активный домен: **https://y1.idivles.ru**. Nginx: `/etc/nginx/sites-available/sochi-portal`.

## Стек и поток

Пользователь → Nginx:443 → Docker `sochi-portal_web_1:3000` → PostgreSQL + Redis.

Edge-гейт: `src/proxy.ts` (сессии, admin/ops/scanner, dashboard/friends/messages, maintenance, CSP).

## Публичные разделы (каталог)

| Путь | Назначение |
|------|------------|
| `/` | Главная: hero, афиша, галерея, пульс |
| `/projects`, `/clubs`, `/spaces` | Каталоги сущностей + заявки |
| `/events`, `/news` | Афиша и новости |
| `/grants`, `/dobro`, `/self-gov` | Программы |
| `/places`, `/gallery`, `/documents` | Гид / медиа / документы |
| `/p/[slug]` | CMS-страницы |
| `/contacts`, `/privacy`, `/rules`, `/terms` | Контакты и юр. страницы |

## Аккаунт и соцслой

| Путь / API | Логика |
|------------|--------|
| `/register` → `POST /api/register` | Zod, RU email/phone, age≥14, consent, captcha, fingerprint, rate-limit → PendingUser + email OTP (8 цифр / 1ч). В prod **без** skip-verify. |
| `/verify` → `POST /api/verify` | Подтверждение OTP → User |
| `/login` | NextAuth credentials (+ phone), captcha после фейлов |
| `/dashboard` | ЛК (auth) |
| `/u/[id]` + `GET /api/users/[id]/public` | Профиль. **Гость → gate, без ПДн.** Авторизованный: full при self/friend/PUBLIC. |
| `/friends`, `/messages` | Только с сессией |
| `/portfolio/[id]` | Только с сессией + visibility |

## Приватность (ключевые lib)

- `privacy-alias.ts` — `resolvePublicIdentity`: гости всегда получают сказочный псевдоним.
- `social.ts` — `canViewFullProfile(..., authenticated)`.
- `registration-guard.ts` — лимиты IP/fingerprint + алерт модераторам.
- `complete-registration.ts` — создание User (dev skip / admin path); `phoneVerified` не ставится от email.

## Админка `/admin/*`

CRUD: проекты, клубы, пространства, заявки, брони, новости, страницы, пользователи, pending-users, модерация, статистика, бэкапы, RKN, боты, настройки (SMTP/VK), сканер.

Роли: `USER` / `PARTICIPANT` / `MODERATOR` (+permissions) / `ADMIN` / `SCANNER` / tech.

## Важные API-группы

- Auth: `/api/auth/*`, register, verify, reset-password, recovery-phrase
- User self: `/api/user/*` (profile, gallery, bookings, security, eco, games…)
- Social: friends, messages, users/search (401 без сессии)
- Catalog actions: applications, bookings, contests, vacancies, places
- Admin: `/api/admin/*`
- Integrations: VK sync, Telegram/MAX webhooks, cron reminders

## Дизайн-стандарт

Токены в `globals.css` (`--primary` teal `#0d9488`, amber accent). Шрифты: Manrope + Unbounded. Классы `.yp-auth-*`, `.yp-surface`, `.yp-list-row`. Не копировать UI VK (синий `#0077FF`, их иконки/layout).
