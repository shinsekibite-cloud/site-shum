# Артефакты Cloud Agent vs файлы на сайте

## `youngportal-full-backup-….tgz` в Artifacts

Это **полный бэкап исходников**, собранный скриптом `scripts/make-full-backup.sh` во время работы Cloud Agent и положенный в `/opt/cursor/artifacts/` на VM агента.

- Размер порядка **~14 МБ** — код без `node_modules` / тяжёлых медиа.
- Виден во вкладке **Artifacts** у прогона агента.
- **Не** равен деплою на `young.idivles.ru`.
- **Не** лежит в git и не скачивается с сайта, пока его явно не опубликуют.

## `youngportal-dev-kit-….tgz` — тест + прод

Полный developer-kit: исходники текущего состояния, установщик теста
(:3001) и прода (:3000), dual nginx, workflow-скрипты. Опционально —
живой снимок БД/uploads/образов (`--with-live`).

```bash
bash scripts/pack-dev-deploy-kit.sh
bash scripts/pack-dev-deploy-kit.sh --with-live
```

Инструкция: `docs/DEV-DEPLOY-KIT.md`. Секреты `.env` в архив не входят.

## Как сделать публичную ссылку на бэкап

На VPS (после копирования архива на сервер):

```bash
./scripts/publish-public-backup.sh /path/to/youngportal-full-backup-….tgz
# → https://young.idivles.ru/backups/<token>/<filename>
```

## Презентация (уже в репозитории)

См. `docs/PRESENTATION.md` — HTML + видео + `/downloads/youngportal-presentation-latest.tgz`.
