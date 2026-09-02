# Настройка и эксплуатация VPS — young.idivles.ru (sochi-portal)

Документ актуален на **2026-08-08**. Описывает ОС, сервисы, безопасность, бэкапы и причины инцидента недоступности.

---

## 1. Сервер

| Параметр | Значение |
|----------|----------|
| Провайдер | AEZA |
| IP | `176.124.204.53` |
| Hostname | `vless.dikcn.online` |
| ОС | Debian GNU/Linux **12** (bookworm) |
| Диск | `/dev/vda2` — **30 GB** ext4 (~58% занято) |
| RAM | **~1.9 GB** |
| Swap | **2 GB** (`/swapfile2`, в `/etc/fstab`) |
| Uptime типичный | недели (ребуты — по OOM / панели) |

На том же хосте крутятся **другие сайты** (nginx): `max.idivles.ru`, `rtb.idivles.ru`, `xvideos.idivles.ru`, `xxxtik.idivles.ru` + контейнер `max-enhanced` (порт 5000).

---

## 2. Проект young.idivles.ru

| Путь | Назначение |
|------|------------|
| `/opt/sochi-portal` | Код Next.js, `docker-compose.yml`, `.env`, uploads |
| `/opt/sochi-portal/data/postgres` | Том PostgreSQL (на диске хоста) |
| `/opt/sochi-portal/public/uploads` | Загрузки пользователей |
| `/opt/sochi-portal/docs/` | Документация |
| `/opt/sochi-portal/scripts/` | `full-backup.sh`, `safe-rebuild-web.sh` |
| `/opt/young-portal` | Старые docs (частично устарели: SQLite) |
| `/var/backups/sochi-portal/` | Бэкапы кода + дампы БД |

**Домен:** https://young.idivles.ru  
**Health:** `GET /api/health` → `{ ok, db, maintenanceMode, siteName, uptimeSec }`

---

## 3. Docker-стек sochi-portal

Файл: `/opt/sochi-portal/docker-compose.yml`

| Контейнер | Образ / роль | Порты |
|-----------|--------------|-------|
| `sochi-portal_web_1` | Next.js production | `127.0.0.1:3000` (только localhost) |
| `sochi-portal_db_1` | PostgreSQL **16** alpine | внутренний |
| `sochi-portal_redis_1` | Redis **7**, maxmemory 64mb LRU | внутренний |

Переменные из `.env` (секреты не в git):

- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`
- `REDIS_URL`
- `CRON_SECRET`
- `EMAIL_SMTP_BLOCKED=1`, `EMAIL_PROVIDER=resend`, `RESEND_FROM`, `RESEND_API_KEY` (ключ может быть пуст)

### Деплой (безопасно)

```bash
/opt/sochi-portal/scripts/safe-rebuild-web.sh
# или вручную — ТОЛЬКО одна сборка:
cd /opt/sochi-portal && docker-compose up -d --build web
```

**Не запускайте параллельно** несколько `docker-compose build` — на 2 GB RAM это даёт OOM.

---

## 4. Nginx + TLS

| Файл | Роль |
|------|------|
| `/etc/nginx/sites-available/sochi-portal` | vhost `young.idivles.ru` |
| `/etc/nginx/conf.d/yp-limits.conf` | rate/conn zones |
| `/etc/letsencrypt/live/young.idivles.ru/` | сертификат |

Поведение:

- HTTP → 301 HTTPS
- Proxy → `http://127.0.0.1:3000`
- `/uploads/` с диска `/opt/sochi-portal/public/uploads/`
- `client_max_body_size 25m`
- Лимиты: general 25 r/s, API 12 r/s, auth 3 r/s, conn 40/IP

```bash
nginx -t && systemctl reload nginx
```

Обновление сертификатов: **acme.sh** cron `57 2 * * *`.

---

## 5. SSH и firewall

### SSH (`/etc/ssh/sshd_config`)

| Параметр | Значение |
|----------|----------|
| Port | **4488** |
| PermitRootLogin | yes |
| PasswordAuthentication | yes |
| PubkeyAuthentication | yes |

### UFW

- Default: deny incoming, allow outgoing
- IN: **80, 443, 4488**, **5000/tcp** (max-enhanced)
- OUT: SMTP 25/465/587/2525 разрешены в UFW, но **провайдер AEZA блокирует исходящий SMTP** на сети

### fail2ban (`/etc/fail2ban/jail.local`)

- Jail `sshd`, port 4488, bantime 86400, maxretry 5
- `ignoreip`: localhost + доверенные IP админов/агентов

```bash
fail2ban-client get sshd ignoreip
fail2ban-client set sshd unbanip X.X.X.X
```

---

## 6. Почта

AEZA блокирует исходящие порты **25/465/587** → Yandex SMTP не работает.

Использовать **Resend** (HTTPS):

```bash
# /opt/sochi-portal/.env
EMAIL_SMTP_BLOCKED=1
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=noreply@young.idivles.ru
```

См. также `/opt/sochi-portal/EMAIL_AND_AEZA.md`.

---

## 7. Бэкапы

### Расположение

`/var/backups/sochi-portal/`

| Файл | Содержание |
|------|------------|
| `full-YYYY-MM-DD_HHMMSS.tar.gz` | код + конфиги системы (без node_modules/.next/postgres data) |
| `db-YYYY-MM-DD_HHMMSS.dump` | `pg_dump -Fc` |
| `*.sha256` | контрольная сумма архива |
| `*.manifest.txt` | краткое описание (у полных бэкапов) |

### Расписание

```cron
15 3 * * * /opt/sochi-portal/scripts/full-backup.sh >> /var/log/sochi-backup.log 2>&1
```

Хранение: ~7 full-архивов, ~14 дампов БД.

### Ручной бэкап

```bash
/opt/sochi-portal/scripts/full-backup.sh
```

### Восстановление БД

```bash
docker exec -i sochi-portal_db_1 pg_restore -U sochi -d sochi_portal -c < /var/backups/sochi-portal/db-XXXX.dump
```

---

## 8. Скрипты

| Скрипт | Назначение |
|--------|------------|
| `/opt/sochi-portal/scripts/full-backup.sh` | Ежедневный/ручной бэкап |
| `/opt/sochi-portal/scripts/safe-rebuild-web.sh` | Сборка web с flock + prune + `NODE_OPTIONS` |

---

## 9. Мониторинг

```bash
curl -sS https://young.idivles.ru/api/health | jq .
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker logs sochi-portal_web_1 --tail 80
free -h && df -h / && swapon --show
```

Рекомендуется внешний uptime-check (UptimeRobot / Hetrix) на `/api/health`.

---

## 10. Инцидент 2026-08-08 (сайт и SSH «умерли»)

**Симптомы:** HTTPS timeout, SSH `Connection closed` на handshake, сканер недоступен.

**Причина:** несколько параллельных `docker-compose up --build web` на **2 GB RAM**. Этап `next build` / TypeScript → **OOM killer** → падение nginx/node/sshd.

**Восстановление:** reboot из панели AEZA → одна аккуратная сборка.

**Профилактика (сделано):**

1. Swap 2 GB + запись в fstab  
2. `safe-rebuild-web.sh` (lock, prune, max-old-space)  
3. Ежедневный бэкап  
4. fail2ban ignoreip для агентов  

**Ещё желательно:** тариф **4 GB RAM**, сборка образа в CI, `RESEND_API_KEY`, remote Git.

---

## 11. QA-аккаунты (для проверки ролей)

Пароль: `RolePass123!`  
Примеры: `qa-admin@sochi.ru`, `scanner@sochi.ru`, `user@sochi.ru`, `mod@sochi.ru`

Сканер: `/scanner` (роль SCANNER) или `/admin/scanner` (ADMIN/MOD).

---

## 12. Чеклист после изменений

1. `/opt/sochi-portal/scripts/full-backup.sh`  
2. `/opt/sochi-portal/scripts/safe-rebuild-web.sh`  
3. `curl -sS https://young.idivles.ru/api/health`  
4. Проверить `/scanner` и `/p/about`  
5. Обновить этот файл при смене портов/IP/таймингов

---

*Файл: `/opt/sochi-portal/docs/VPS-OS-SETUP.md`*
