# Y1 cutover + live backup restore proof (2026-08-13)

## Цель
1. Снять **полный LIVE-бэкап** того, что реально крутится в Docker на VPS.
2. **Поднять сайт из этого бэкапа** на `https://y1.idivles.ru`.
3. **Отключить** `https://young.idivles.ru` (HTTP 503 + ссылка на y1).
4. Зафиксировать процедуру в репозитории, чтобы cutover был повторяемым.

## Что считается «полным» бэкапом
Скрипт `scripts/snapshot-live-site.sh` пишет архив
`/var/backups/sochi-portal/live-<stamp>.tar.gz` (+ `.sha256`, symlink `live-latest.tar.gz`):

| Файл в архиве | Содержание |
|---|---|
| `db.dump` | Postgres `pg_dump -Fc` |
| `uploads.tgz` | `public/uploads` |
| `youngportal-prebuilt.tgz` | точный prebuilt-бандл последнего деплоя (если есть) |
| `sochi-portal_web-image.tar.gz` | `docker save sochi-portal_web:latest` |
| `host-app.tgz` | `/opt/sochi-portal` без `node_modules` / `.next` / postgres data / uploads |
| `MANIFEST.txt` | описание |

> Nightly `full-backup.sh` **не** равен live-сайту: он архивирует host tree без Docker image и часто без свежего `src`. Для восстановления прода используйте **live-***.

## Восстановление
На VPS:

```bash
cd /opt/sochi-portal
DOMAIN=y1.idivles.ru bash scripts/restore-live-snapshot.sh /var/backups/sochi-portal/live-latest.tar.gz
```

Полный cutover (snapshot → restore → certbot → nginx):

```bash
cd /opt/sochi-portal
bash scripts/cutover-to-y1.sh
```

Nginx-конфиг: `deploy/nginx-y1-idivles.conf`
- `y1.idivles.ru` → upstream `127.0.0.1:3000`
- `young.idivles.ru` → **503** (отключён)

## DNS
Оба имени должны указывать на VPS `176.124.204.53` (уже так на момент cutover).

## Проверка после cutover
```bash
curl -sS https://y1.idivles.ru/api/health
curl -sS -o /dev/null -w "%{http_code}\n" https://y1.idivles.ru/
curl -sS -o /dev/null -w "%{http_code}\n" https://y1.idivles.ru/faq
curl -sS -o /dev/null -w "%{http_code}\n" https://young.idivles.ru/   # ожидаем 503
```

Ожидание: y1 = 200 + `ok:true`; young = 503.

## Фактический restore proof (2026-08-13)
Выполнено на VPS `176.124.204.53`:

| | |
|--|--|
| Архив | `/var/backups/sochi-portal/live-2026-08-13_041542.tar.gz` |
| SHA256 | `c2d0826a68572613a0ba9025a6c1579e1b58e604da9a66157b2003b594e39aff` |
| Результат | `docker load` → `pg_restore` → uploads → web up → nginx y1 |
| y1 | home/faq/health/login/games/news/places → **200** |
| young | **503** |
| Proof file | `/var/backups/sochi-portal/RESTORE-PROOF-2026-08-13.txt` |

## Откат на young
1. Вернуть `deploy/nginx-sochi-portal.conf` в `/etc/nginx/sites-available/sochi-portal`
2. В `.env`: `NEXTAUTH_URL=https://young.idivles.ru`
3. `docker-compose up -d --force-recreate web`
4. `nginx -t && systemctl reload nginx`

## Связанные скрипты
- `scripts/snapshot-live-site.sh` — снять live-бэкап
- `scripts/restore-live-snapshot.sh` — поднять из live-бэкапа
- `scripts/cutover-to-y1.sh` — snapshot + restore + TLS + nginx
- `scripts/deploy-prebuilt-vps.sh` — обычный деплой кода (не путать с restore)
