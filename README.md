# YoungPortal — молодёжный портал

Продуктовое имя: **YoungPortal**. Эталонный контент: «Молодёжь Сочи».

**Прод:** https://py.idivles.ru  
**Тест:** https://ty.idivles.ru  
**Код на сервере:** `/opt/sochi-portal` (прод), `/opt/sochi-portal-staging` (тест)

Стек: **Next.js 16** (App Router, standalone) · **React 19** · **Prisma 7** · **PostgreSQL 16** · **Redis 7** · **NextAuth v4** · Docker Compose · Nginx + Let’s Encrypt.

| Документ | Назначение |
|----------|------------|
| [`docs/SALE-READY-AUDIT.md`](docs/SALE-READY-AUDIT.md) | Итоговый аудит к продаже / передаче |
| [`docs/DEV-HANDBOOK.md`](docs/DEV-HANDBOOK.md) | Руководство разработчика |
| [`docs/ORG-ADMIN-GUIDE.md`](docs/ORG-ADMIN-GUIDE.md) | Руководство организации |
| [`docs/REMOTE-DEPLOY.md`](docs/REMOTE-DEPLOY.md) | Быстрое удалённое развёртывание + модули |
| [`docs/ORG-HANDOFF.md`](docs/ORG-HANDOFF.md) | Handoff, VPS security, архивы |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Архитектура |
| [`docs/CODEBASE-MAP.md`](docs/CODEBASE-MAP.md) | Карта кода |
| [`docs/README.md`](docs/README.md) | Оглавление docs |

## Что умеет портал

| Раздел | Путь | Для кого |
|--------|------|----------|
| Главная, афиша, новости | `/`, `/events`, `/news` | все |
| Каталоги | `/projects`, `/clubs`, `/spaces`, `/places` | все |
| Программы | `/grants`, `/dobro`, `/self-gov` | все |
| Вакансии и конкурсы | `/vacancies`, `/contests` | все / участники |
| Документы, FAQ, юр. страницы | `/documents`, `/faq`, `/privacy`, `/rules`, `/terms` | все |
| Игры | `/games` | гости и участники |
| Регистрация / вход | `/register`, `/login`, `/verify` | гости |
| Кабинет | `/dashboard`, `/friends`, `/messages`, `/tickets` | авторизованные |
| Админка | `/admin` | ADMIN / MODERATOR |
| Сканер QR | `/scanner` | SCANNER / staff |
| Техслужба | `/ops` | TECH |

Роли: `USER` → `PARTICIPANT` → `MODERATOR` → `ADMIN`, отдельно `SCANNER` и `TECH`.  
Модули включаются/выключаются в Admin → Настройки → Модули или TECH `/ops`.

## Рабочий цикл (обязательный)

```
GitHub → тест ty.idivles.ru → ваше «одобряю» → бэкап → прод py.idivles.ru
```

```bash
bash scripts/workflow-deploy-staging.sh
bash scripts/smoke-sites.sh --staging-only
# только после «одобряю»:
CONFIRM=PROMOTE_YOUNG APPROVE=YES bash scripts/manual-promote-to-young.sh
```

Подробно: [`docs/WORKFLOW.md`](docs/WORKFLOW.md) · агентам: [`AGENTS.md`](AGENTS.md)

## Быстрый старт (разработка)

```bash
cp .env.example .env   # заполните секреты
npm ci
npx prisma db push
npm run db:seed
npm run dev
```

Docker (как на проде): `docker compose up --build` — web на `127.0.0.1:3000`, снаружи TLS у Nginx.

Установка на VPS организации: [`docs/REMOTE-DEPLOY.md`](docs/REMOTE-DEPLOY.md).

## Продакшен

Поток: браузер → Nginx `:443` → Docker web `:3000` → PostgreSQL + Redis.

- Health: `GET /api/health`
- Edge-гейт: `src/proxy.ts` (CSP nonce, maintenance, модули, роли)
- Compose: `docker-compose.yml` + `docker-compose.staging.yml`

## Что не коммитится

`.env`, TLS private keys, дампы БД, аватары/галереи/портфолио пользователей. Шаблон: [`.env.example`](.env.example).

## Тесты

```bash
npm test
npm run lint
npm run qa:modules -- https://ty.idivles.ru
```

## Лицензия

Proprietary — см. [`LICENSE`](LICENSE) и [`docs/CODE-PROTECTION.txt`](docs/CODE-PROTECTION.txt). Реквизиты оператора задаются в админке, не в git.
