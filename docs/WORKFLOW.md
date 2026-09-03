# Рабочий цикл: GitHub → ty (тест) → py (прод)

Жёсткий порядок. Агент и люди работают только так.

**Стиль агента:** лучшие практики; все доступные инструменты — практично и по делу; повторяющиеся шаги — через умные скрипты (экономия токенов и времени). Сначала проверка на ty, promote на py только после явного одобрения.

```
1. Код и доки → GitHub (ветка + PR)
2. Деплой на ТЕСТ  → https://ty.idivles.ru
3. Вы смотрите ty и пишете явное одобрение
4. Бэкап ПРОДА     → py.idivles.ru (live snapshot)
5. Выкат на ПРОД   → https://py.idivles.ru из одобренного теста
```

Без фразы вроде **«одобряю» / «кати на py» / «promote»** шаг 4–5 **не выполняется**.

## Версии продукта

Перед пользовательским релизом на ty:

1. Поднять версию в `package.json` **и** `src/lib/app-version.ts` (одно значение).
2. Записать изменения в корневой `CHANGELOG.md` (секция `## [x.y.z] — YYYY-MM-DD`).
3. После деплоя проверить: футер «версия x.y.z» и `GET /api/health` → `"version":"x.y.z"`.

Не выкатывать несколько смысловых релизов под одной и той же версией.
## Роли доменов

| Домен | Роль | Порт upstream |
|-------|------|----------------|
| `ty.idivles.ru` | **ТЕСТ (staging)** | `127.0.0.1:3001` |
| `py.idivles.ru` | **ПРОД** | `127.0.0.1:3000` |

VPS: `root@77.110.125.241:22` (ключ `id_ed25519_yp`).

Каталоги на VPS:

| Путь | Назначение |
|------|------------|
| `/opt/sochi-portal` | прод-код + compose (py) |
| `/opt/sochi-portal-staging` | тестовый код + compose (ty) |
| `/var/backups/sochi-portal/` | live-снимки перед promote |

Секреты (`.env`) на сервере **не** перезаписываются из git.

Устаревшие имена `young.idivles.ru` / `y1.idivles.ru` / хост `176.124.204.53` **не использовать** как defaults.

## Состояние доменов

- **py.idivles.ru** — прод, `:3000`
- **ty.idivles.ru** — тест, `:3001`

Проверка без браузера:

```bash
bash scripts/smoke-sites.sh
# или только тест:
bash scripts/smoke-sites.sh --staging-only
```

## D. Promote на prod — ручной скрипт (шаги 4–5)

Только после явного одобрения человека («одобряю» / «кати на py»).

Интерактивно (спросит `PROMOTE_YOUNG`):

```bash
bash scripts/manual-promote-to-young.sh
```

Или явно:

```bash
CONFIRM=PROMOTE_YOUNG APPROVE=YES bash scripts/manual-promote-to-young.sh
```

Скрипт: пакет из git → rsync на staging-каталог → `safe-rebuild-web` / staging compose → smoke `https://ty.idivles.ru/api/health`.

После promote: `NEXTAUTH_URL` для прода = `https://py.idivles.ru`.

Полные детали скриптов — в `scripts/workflow-deploy-staging.sh`, `scripts/manual-promote-to-young.sh`, `scripts/lib/vps.sh`.
