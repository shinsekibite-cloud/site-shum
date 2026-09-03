# YoungPortal — руководство разработчика

Актуально: **2026-08-17**. Стек: **Next.js 16** + React 19 + Prisma 7 + PostgreSQL + Redis + Docker.  
Домены эталона: **py.idivles.ru** (прод), **ty.idivles.ru** (тест).

Связанные документы: `ARCHITECTURE.md`, `docs/CODEBASE-MAP.md`, `docs/WORKFLOW.md`, `docs/ops-modules.md`, `docs/ORG-HANDOFF.md`.

---

## 1. Архитектура

```
Browser → nginx (TLS, rate-limit, CSP) → Next.js web (:3000/:3001)
                                         ↳ Prisma → PostgreSQL
                                         ↳ Redis (rate-limit, module flags cache)
                                         ↳ MAX / Telegram bots (webhooks)
```

- **Edge-guard**: `src/proxy.ts` (Next Proxy) — auth session, maintenance, module kill-switch.
- **Модули**: `src/lib/module-flags.ts` + edge twin `module-flags-edge.ts`.
- **Роли**: USER, PARTICIPANT, MODERATOR, ADMIN, SCANNER; TECH — env (`TECH_EMAIL`), не в БД.

---

## 2. Структура каталогов

| Путь | Назначение |
|------|------------|
| `src/app/` | App Router: страницы + `api/` |
| `src/components/` | UI (admin, layout, bots…) |
| `src/lib/` | Бизнес-логика, security, bots, modules |
| `prisma/` | schema + migrations |
| `scripts/` | install, seed, QA, deploy, pack kits |
| `deploy/` | nginx/fail2ban templates |
| `docs/` | документация продукта |
| `tests/` | node:test unit/smoke |

---

## 3. Локальный запуск с нуля

```bash
# Требования: Node 22+, Docker (Postgres+Redis) или внешняя БД
cp .env.example .env   # заполните DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
npm ci
npx prisma db push
npm run db:seed        # опционально: демо-контент
npm run dev
```

Docker dual (как на VPS): см. `docker-compose.yml` + `docker-compose.staging.yml`, entrypoint `scripts/docker-entrypoint.sh`.

---

## 4. Система модулей

Источник правды: `SiteSettings.moduleFlagsJson`. Нет ключа = **включён**.

| Поверхность | Как |
|-------------|-----|
| TECH `/ops` | `OpsFlagsClient` → `/api/ops/flags` |
| ADMIN `/admin/settings?tab=modules` | тот же UI → `/api/admin/modules` |
| Публично | `GET /api/public/status` → `modules`, `offModes` |
| Установка | `--modules=all\|core\|content\|key1,key2` + `--modules-off=` |

Добавить модуль:

1. Ключ в `MODULE_FLAG_KEYS` + `MODULE_FLAG_META`.
2. Правило пути в `PATH_MODULE_RULES` (**и** в `module-flags-edge.ts`).
3. `requireModulePage` / `rejectIfModuleDisabled` где нужно сверх proxy.
4. Navbar/Footer/`modOn` при необходимости.
5. Обновить `scripts/qa-modules-toggle.mjs` и `docs/ops-modules.md`.

Presets установки: `scripts/apply-module-selection.mjs`.

---

## 5. Миграции и обновления

```bash
# Схема
npx prisma migrate dev --name describe_change   # dev
npx prisma migrate deploy                       # prod/staging container

# Деплой эталона
git push
bash scripts/workflow-deploy-staging.sh
bash scripts/smoke-sites.sh --staging-only
# после «одобряю»:
CONFIRM=PROMOTE_YOUNG APPROVE=YES bash scripts/manual-promote-to-young.sh
```

Не коммитить `.env`, uploads, TLS private keys.

---

## 6. Отладка, логи, тесты

```bash
npm run lint
npm test
npm run qa:modules -- https://ty.idivles.ru
bash scripts/smoke-sites.sh
bash scripts/verify-kit-scripts.sh
```

Логи web: `docker logs sochi-portal-web-1` / `sochi-staging-web-1`.  
Аудит флагов: `LoginEvent` kind `OPS_FLAGS`.

---

## 7. Переменные окружения

См. `.env.example`. Критичные:

| Var | Назначение |
|-----|------------|
| `DATABASE_URL` | Postgres |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | сессии |
| `REDIS_URL` | лимиты / кэш флагов |
| `CRON_SECRET` | vk-sync / cron HTTP |
| `TECH_EMAIL` / `TECH_BOOTSTRAP_PASSWORD` | TECH ops |
| `MODULE_FLAGS_FORCE_ON` | аварийно всё on |
| `NODE_EXTRA_CA_CERTS` | CA Минцифры для MAX |

---

## 8. Известные ограничения / долг

- Админ-каталоги часто доступны staff при выкл. публичного модуля (by design).
- Дублирующие тумблеры registration/messaging в `/admin/settings` vs Ops — обратная запись в JSON неполная.
- `PATH_MODULE_RULES` дублируется edge/server — держать синхронно.
- Имена скриптов promote всё ещё содержат «young» (домен уже py).
- Часть старых QA-доков ссылается на y1/young — ориентир: ORG-HANDOFF / этот handbook.

---

## 9. Защита кода

См. `docs/CODE-PROTECTION.txt`, `docs/CODE-CHANGE-PROCESS.md`, `CODEOWNERS`, kit `INTEGRITY.json`.
