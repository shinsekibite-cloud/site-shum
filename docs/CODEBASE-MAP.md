# Карта кодовой базы sochi-portal / y1.idivles.ru

Снимок 2026-08-13. Имена путей от корня репозитория.

## Корневые файлы

| Файл | Назначение |
|------|------------|
| `package.json` | Next 16.2.12, React 19, Prisma 7, скрипты `dev`/`build`/`test`/`qa` |
| `next.config.ts` | standalone, redirects `/about`→`/p/about`, security headers |
| `docker-compose.yml` | postgres 16, redis 7 (requirepass), web :3000 localhost |
| `Dockerfile` | multi-stage Alpine, `prisma generate` + `next build` |
| `Dockerfile.prebuilt` | runtime из готового `.next/standalone` (мало RAM) |
| `.env.example` | шаблон секретов (без прод-значений) |
| `src/proxy.ts` | Next.js 16 proxy: CSP, maintenance, модули, роли |
| `prisma/schema.prisma` | 58 моделей, роли USER/PARTICIPANT/MODERATOR/ADMIN/SCANNER/TECH |
| `dev-runner.js` | `npm run dev` — перезапуск next при падении |
| `eslint.config.mjs` | ESLint |

## `src/app` — страницы

**Публичные:** `/`, `/news`, `/news/[id]`, `/projects`, `/clubs`, `/spaces`, `/events`, `/places`, `/gallery`, `/documents`, `/grants`, `/dobro`, `/self-gov`, `/vacancies`, `/contests`, `/p/[slug]`, `/contacts`, `/faq`, `/privacy`, `/rules`, `/terms`, `/about`, `/search`, `/games/*`, `/presentation`, `/u/[id]`, `/portfolio/[id]`, `/awards/[id]`, `/unavailable`, `/maintenance`, `/more`.

**Auth:** `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/change-password`.

**Кабинет (сессия):** `/dashboard` (+ edit/settings/applications/portfolio/achievements/awards/games/guides/referrals/shop/showcase), `/friends`, `/messages`, `/tickets`, `/spaces/[id]/book`.

**Staff:** `/admin/*` (users, pending-users, news, pages, projects, clubs, spaces, programs, places, vacancies, contests, awards, moderation, stats, system, security, online, activity, audit-log, bots, backup, rkn, scanner, about-team), `/ops`, `/scanner`.

## `src/app/api` — группы

- Auth: `auth/[...nextauth]`, register, verify, captcha, forgot/reset/change-password, recovery-phrase
- User: `user/profile`, gallery, upload, 2fa, security, account/delete, bookings, applications, notifications, eco, games, portfolio, push, presence, messenger-link
- Social: friends, messages, group-chat, entity-invites, users/search, users/[id]/public
- Catalog: applications, bookings, contests, vacancies, places, events, documents
- Admin: `admin/*` (stats, users, moderation, contests, vacancies, backup, lea-export, bots, replica, demo-seed)
- Ops: `ops/flags`, `ops/presentation`
- Scanner: `scanner/check`, `scanner/events`
- Cron/integrations: `cron/reminders`, `cron/replica-sync`, `vk-sync`, telegram/max webhooks
- Public: health, public/status, public/bots, media, maps, calendar/ics, avatar fairy/myth

Полный список route.ts — 134 файла.

## `src/lib` (важное)

| Модуль | Роль |
|--------|------|
| `auth.ts` | NextAuth credentials + optional OAuth + 2FA challenge |
| `acl.ts` / `acl-shared.ts` | requireAdmin / requirePermission / роли |
| `prisma.ts` | пул PostgreSQL |
| `rateLimit.ts` | Redis INCR + in-memory fallback |
| `csrf-origin.ts` | same-origin для mutating API |
| `sanitize-html.ts` | DOMPurify для CMS HTML |
| `safe-url.ts` | http(s) / `/uploads/` only |
| `uploads.ts` / `image-optimize.ts` / `image-magic.ts` | загрузки |
| `tickets.ts` | HMAC QR |
| `module-flags.ts` | kill-switch разделов |
| `privacy-alias.ts` | псевдонимы для гостей |
| `email.ts` | Resend HTTPS (SMTP на AEZA закрыт) |
| `censor.ts` | мат/небезопасный текст |
| `replica-sync.ts` | HA standby |

Остальные ~160 модулей: эко-баллы, достижения, рефералы, VK, Telegram/MAX, презентация, 152-ФЗ согласия, LEA-экспорт.

## `src/components`

- Shell: Navbar, BottomNav, Footer, Providers, StaffChrome
- Home/catalog: HomeHero, UpcomingEvents, FilterBar, QuickAccess
- CMS: CmsPage, ContentRenderer, LegalDocShell, DocumentViewer
- Cabinet: DashboardClient, PortfolioEditor, AchievementsPanel, TotpSetupPanel
- Contests/vacancies: ContestDetailClient, VacancyDetailClient
- Games: Snake/Tetris/Checkers/Breakout/Memory/Fifteen
- Admin: AdminSidebar + *Client панели
- Entity/places/programs: команда, чат, каталог программ, места Сочи

## Prisma — модели (кратко)

User, PendingUser, Session, Account, Project, Club, Space, PortalProgram, Application, Booking (+ Participant/Waitlist/TicketCheckIn), News, PageContent, SiteDocument, SiteSettings, Friendship, Conversation, DirectMessage, UserPortfolio, Place (+ Favorite/Rating/Review), Vacancy/Employer/VacancyApplication, Contest (+ Submission/Vote/Raffle/Winner), Referral, AdminAuditLog, UserActionLog, GameScore, OfficialDocument, LeaDataExport, ProjectBackup, …

## `scripts/`

Деплой и VPS: `deploy-vps.sh`, `safe-rebuild-web.sh`, `debian-bootstrap.sh`, `install-fresh-vps.sh`, `vps-secure-harden.sh`, `cutover-to-y1.sh`.  
Бэкапы: `backup-postgres.sh`, `full-backup.sh`, `daily-tg-backup.sh`.  
QA: `qa-all.mjs`, `qa-role-matrix.mjs`, `qa-site-audit.mjs`, `uptime-check.mjs`.  
Сиды: `seed-demo.mjs`, `seed-content-live.mjs`, `seed-bootstrap-admin.mjs`.  
Миграции: `migrate-sqlite-to-pg.mjs`, `ensure-schema-columns.js`.

## `deploy/`

- `nginx-y1-idivles.conf` — прод y1
- `nginx-sochi-portal.conf` — legacy young
- `nginx-yp-limits.conf` — зоны лимитов → `/etc/nginx/conf.d/yp-limits.conf`

## `tests/`

`core.test.mjs`, `booking-hours.test.mjs`, `device-fingerprint.test.mjs`, `image-optimize.test.mjs`, `recovery-phrase.test.mjs`, `safe-url.test.mjs`.

## `docs/`

Пользовательские и ops-гайды: `docs/README.md`. Этот файл — карта кода. Аудит: `CODE-AUDIT-GITHUB-2026-08-13.md`. Cutover y1: `AUDIT-2026-08-13.md`, `Y1-CUTOVER-BACKUP.md`.
