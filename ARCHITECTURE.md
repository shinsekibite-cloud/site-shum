# Архитектура y1.idivles.ru

## Стек

- Next.js 16.2 (App Router, `output: 'standalone'`)
- React 19 + TypeScript
- Prisma 7 + PostgreSQL 16 (`@prisma/adapter-pg`)
- Redis 7 (rate-limit, короткие сессии)
- NextAuth v4 + bcrypt (+ опционально TOTP 2FA)
- TipTap, Framer Motion, Lucide, Recharts, Zod
- Docker (`node:22-alpine`) + docker-compose (`web` + `db` + `redis`)
- Nginx + Let’s Encrypt (`y1.idivles.ru`)

## Поток запроса

```
Клиент
  → Nginx :443 (TLS, rate-limit, static /brand /uploads)
    → Next.js :3000
      → src/proxy.ts (CSP, maintenance, module flags, роль)
      → App Router pages / Route Handlers
        → Prisma → PostgreSQL
        → Redis (лимиты)
```

Edge-гейт **не** закрывает `/api/*` по роли — каждый API сам вызывает `getServerSession` / `requireAdmin` / `requirePermission`.

## Разделы

| Путь | Назначение |
|------|------------|
| `/` | Главная: hero, афиша, галерея, пульс |
| `/projects`, `/clubs`, `/spaces` | Каталоги + заявки / брони |
| `/events`, `/news` | Афиша и новости (в т.ч. VK-sync) |
| `/grants`, `/dobro`, `/self-gov` | Программы |
| `/places`, `/gallery`, `/documents` | Гид, медиа, файлы |
| `/vacancies`, `/contests` | Вакансии и конкурсы |
| `/p/[slug]` | CMS-страницы |
| `/games` | Мини-игры |
| `/dashboard`, `/friends`, `/messages` | Кабинет (нужна сессия) |
| `/admin/*` | Админка |
| `/ops` | Kill-switch модулей (TECH) |
| `/scanner` | QR check-in |
| `/api/*` | REST handlers |

## Данные

- Postgres: `./data/postgres` (volume)
- Uploads: `./public/uploads` (volume, Nginx отдаёт напрямую кроме `/uploads/lea` и `/uploads/backups`)
- Redis: без persist (`--save ''`), пароль обязателен (`REDIS_PASSWORD`)

## Конфиги

| Файл | Роль |
|------|------|
| `docker-compose.yml` | web + db + redis, RAM-лимиты |
| `Dockerfile` / `Dockerfile.prebuilt` | multi-stage / runtime-only |
| `deploy/nginx-y1-idivles.conf` | активный vhost y1 |
| `deploy/nginx-sochi-portal.conf` | legacy young.idivles.ru |
| `deploy/nginx-yp-limits.conf` | зоны `yp_general` / `yp_api` / `yp_auth` / `yp_conn` |
| `.env.example` | шаблон секретов |

Бэкап: `scripts/backup-postgres.sh`, `scripts/full-backup.sh`, ежедневный TG: `scripts/daily-tg-backup.sh`.
