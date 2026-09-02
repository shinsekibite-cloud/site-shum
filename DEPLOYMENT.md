# Развёртывание

## Схема
Nginx (80/443) -> 127.0.0.1:3000 -> Docker `sochi-portal_web_1`
PostgreSQL: Docker `sochi-portal_db_1` (порт только внутри сети compose)

Volumes:
- `./data/postgres` -> Postgres data
- `./data` -> `/app/data` (legacy SQLite `dev.db` kept for one-shot migration; `data/private/` for encrypted archives)
- `./public/uploads` -> `/app/public/uploads`

## Команды
```bash
cd /opt/sochi-portal
docker-compose ps
docker-compose logs -f web
SSHPASS=... ./scripts/deploy-vps.sh
./scripts/backup-postgres.sh
./scripts/restore-postgres.sh /var/backups/sochi-portal/sochi-portal-YYYYMMDD-HHMMSS.tgz
```

## Бэкап / импорт (DR)

**Источник истины для восстановления:** архив `sochi-portal-*.tgz` из `scripts/backup-postgres.sh`
(внутри: `sochi_portal.sql` + `uploads.tgz`). Админский `.ypenc` — это снимок настроек, не полный DR.

### Создать бэкап
```bash
cd /opt/sochi-portal && ./scripts/backup-postgres.sh
# архивы: /var/backups/sochi-portal/sochi-portal-*.tgz
```

### Импорт (restore)
```bash
# Проверка без изменений:
DRY_RUN=1 ./scripts/restore-postgres.sh /var/backups/sochi-portal/sochi-portal-….tgz

# Полный restore (останавливает web, делает pre-backup, заливает SQL + uploads, стартует web):
./scripts/restore-postgres.sh /var/backups/sochi-portal/sochi-portal-….tgz
```

Правила безопасности restore:
1. Скрипт **не** перезаписывает `.env` — `env.backup` только вручную после diff.
2. После restore **не** запускайте полный deploy с seed/VK-скриптами — они перетрут контент.
3. Схема должна совпадать с дампом; `prisma db push --accept-data-loss` сразу после restore опасен.
4. Админские `.ypenc` лежат в `data/private/` и скачиваются только через ACL API.

Расшифровка offline:
```bash
node scripts/decrypt-backup.mjs backup.ypenc --key <64-hex> --out payload.json
```

## Env (`.env` на VPS)
```
POSTGRES_USER=sochi
POSTGRES_PASSWORD=<secret>
POSTGRES_DB=sochi_portal
DATABASE_URL=postgresql://sochi:<secret>@db:5432/sochi_portal?schema=public
NEXTAUTH_URL=https://young.idivles.ru
NEXTAUTH_SECRET=...
NODE_ENV=production
```

Deploy script generates `POSTGRES_*` and rewrites sqlite `DATABASE_URL` automatically.
First deploy after switch: `prisma db push` + `migrate-sqlite-to-pg.mjs` if `data/dev.db` exists and PG is empty.
