# YoungPortal — развёртывание для организации и модернизация

Актуально на **2026-08-17**. Домены эталона: **py.idivles.ru** (прод), **ty.idivles.ru** (тест).  
VPS эталона: `root@77.110.125.241`.

Этот документ — единая инструкция: что лежит в архивах, как поставить на VPS,
как защитить сервер, как работать с сайтом и как пересобрать под другую организацию.

---

## 1. Какие архивы нужны

| Архив | Для кого | Содержимое |
|-------|----------|------------|
| `youngportal-source-full-*.tgz` | Разработчик / модернизация | Полное дерево кода (без `.env`, `node_modules`, uploads) |
| `youngportal-org-kit-*.tgz` | Установка организации | Код + скрипты установки + снимок БД/uploads/образов (контент) |
| `youngportal-*-kit-*-source.tgz` / `pack-dev-deploy-kit.sh` без `--with-live` | Чистая установка | Только код и установщик, пустая БД + роли по флагу |

### Скачать актуальные (2026-08-17, после static ISR / promote)

После каждого завершённого запроса агент обновляет киты через `bash scripts/post-request-handoff.sh`.

| Назначение | Файл | SHA-256 | URL |
|------------|------|---------|-----|
| Org kit + контент (~864 МБ) | `youngportal-org-kit-20260817-211320.tgz` | `203f0e7944f1e5626375bf5e035595c5446baef1a8be3ac4c68e5cf5baf35358` | https://py.idivles.ru/backups/c8ec5dd215bc938a287a7ae05246d249/youngportal-org-kit-20260817-211320.tgz |
| Sale source (~39 МБ) | `youngportal-sale-source-20260817-211320.tgz` | `73816894af6007355bccdeb46e875638e71d3ab80773010247674ce869d510f8` | https://py.idivles.ru/backups/aca20aaaaa0fd596b15ea52626a6ebab/youngportal-sale-source-20260817-211320.tgz |
| Portable dev (~39 МБ) | `youngportal-portable-dev-20260817-211320.tgz` | `748d7b6ac1f6b8bf9b476c1845c7db2fe934b848a2556d9e4a7186b669dcaa5a` | https://py.idivles.ru/backups/9d15d24e9260ed7d2833a94a6392b010/youngportal-portable-dev-20260817-211320.tgz |
| Full host backup (~65 МБ) | `full-2026-08-17_211908.tar.gz` | `aa7fb3cf457ebe6c00658a564a432db8688e07fa527b3eab197248aac3236395` | https://py.idivles.ru/backups/798aed53c527308941d69fcd11356051/full-2026-08-17_211908.tar.gz |
| Live snapshot DR (~810 МБ) | `live-2026-08-17_211125.tar.gz` | `52a2b06776d97e82263574c0d5cf9ec4ab9e4cc6e691a731f887e6830be4ba69` | https://py.idivles.ru/backups/75326331317fcd51e7099fa099b84c86/live-2026-08-17_211125.tar.gz |

Стабильные алиасы (тоже публичные):

- Full latest: https://py.idivles.ru/backups/full-latest.tar.gz
- Live latest: https://py.idivles.ru/backups/live-latest.tar.gz

```bash
# Org kit
curl -fL -o youngportal-org-kit.tgz \
  'https://py.idivles.ru/backups/c8ec5dd215bc938a287a7ae05246d249/youngportal-org-kit-20260817-211320.tgz'
echo '203f0e7944f1e5626375bf5e035595c5446baef1a8be3ac4c68e5cf5baf35358  youngportal-org-kit.tgz' | sha256sum -c

# Sale / portable
KIT_PROFILE=sale bash scripts/download-kit.sh
KIT_PROFILE=portable bash scripts/download-kit.sh

# VPS host full + live snapshot
curl -fL -o full-latest.tar.gz 'https://py.idivles.ru/backups/798aed53c527308941d69fcd11356051/full-2026-08-17_211908.tar.gz'
curl -fL -o live-latest.tar.gz 'https://py.idivles.ru/backups/75326331317fcd51e7099fa099b84c86/live-2026-08-17_211125.tar.gz'
echo 'aa7fb3cf457ebe6c00658a564a432db8688e07fa527b3eab197248aac3236395  full-latest.tar.gz' | sha256sum -c
echo '52a2b06776d97e82263574c0d5cf9ec4ab9e4cc6e691a731f887e6830be4ba69  live-latest.tar.gz' | sha256sum -c
```

Секреты (`.env`, TLS-ключи, токены ботов) **никогда** не входят в архив.  
Полный kit с БД содержит персональные данные — не публикуйте без токена/доступа.

Собрать заново с машины, у которой есть SSH на эталон:

```bash
# 1) Полный исходник (модернизация)
bash scripts/pack-dev-deploy-kit.sh --out-dir /opt/cursor/artifacts

# 2) Организационный kit с живым контентом
KIT_PREFIX=youngportal-org-kit bash scripts/pack-dev-deploy-kit.sh --with-live --out-dir /opt/cursor/artifacts

# 3) Клиентский slim (без чужой БД, только образы) — опционально
bash scripts/pack-dev-deploy-kit.sh --client --with-live --out-dir /opt/cursor/artifacts
```

Перед упаковкой с контентом: дедуп заявок

```bash
docker exec sochi-portal-web-1 node /app/scripts/dedupe-applications.mjs
```

---

## 2. Быстрая установка на новый VPS (организация)

Требования: **Debian 12+ / Ubuntu 22.04+**, root, **≥ 2 GB RAM** (лучше 4), **≥ 20 GB** диска, A-запись домена на IP.

```bash
# На целевом сервере
tar -xzf youngportal-org-kit-*.tgz
cd youngportal-org-kit-*   # или youngportal-*-kit-*
sudo bash START.sh
```

В меню / флагах:

| Цель | Команда |
|------|---------|
| Прод + тест, данные из снимка | `sudo bash INSTALL.sh --full` |
| Прод + тест, пустая БД + демо-роли | `sudo bash INSTALL.sh --demo` |
| Прод + тест, совсем пусто | `sudo bash INSTALL.sh --clean` |
| Переустановка с нуля | `sudo bash INSTALL.sh --reinstall --full` |

Неинтерактивно с другого хоста:

```bash
cd youngportal-org-kit-*
bash install-remote.sh root@НОВЫЙ_IP --full \
  --prod-domain portal.example.ru \
  --staging-domain test.example.ru \
  --le-email ops@example.ru \
  --admin-email admin@example.ru \
  --admin-password 'StrongPass1!'
```

После установки:

- Прод: `https://portal.example.ru/api/health`
- Тест: `https://test.example.ru/api/health`
- Админ: `/etc/yp-portal/admin-credentials.txt` (если создавался установщиком)

Каталоги на сервере:

| Путь | Назначение |
|------|------------|
| `/opt/sochi-portal` | Прод |
| `/opt/sochi-portal-staging` | Тест (dual) |
| `/etc/yp-portal/` | Учётные данные, INTEGRITY |
| `/var/backups/sochi-portal/` | Бэкапы |

---

## 3. Безопасность VPS (обязательный минимум)

Выполняется установщиком (`START` / `INSTALL`) и/или вручную.

### 3.1 SSH

- Только ключи: `PasswordAuthentication no`, `PermitRootLogin prohibit-password`
- Нестандартный порт (по желанию) + UFW allow
- fail2ban jail `sshd`

```bash
# Пример (после добавления своего ключа в authorized_keys!)
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
```

### 3.2 Firewall (UFW)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH    # или ваш порт
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 3.3 Nginx

- Шаблоны: `deploy/nginx-dual-site.conf.tpl`, `deploy/nginx-yp-limits.conf`
- Rate-limit зон (как на эталоне / `strict`)
- HSTS после проверки TLS
- Web только на `127.0.0.1:3000` / `:3001` — снаружи только nginx

### 3.4 fail2ban

- `deploy/fail2ban-yp-nginx.local` — nginx 4xx/лимиты
- sshd jail включён

### 3.5 Docker / приложение

- Не публиковать порты Postgres/Redis наружу
- Секреты только в `/opt/sochi-portal/.env` (права `600`)
- Ежедневный бэкап: cron → `/var/backups/sochi-portal/`
- Обновления ОС: `unattended-upgrades` (опционально в установщике)
- CA Минцифры для MAX API: `certs/russian_trusted_ca.pem` + `NODE_EXTRA_CA_CERTS` в entrypoint

### 3.6 После установки — чеклист

1. Сменить пароль ADMIN  
2. Включить 2FA у ADMIN  
3. Прописать ботов MAX/Telegram в Admin → Боты, зарегистрировать webhook  
4. Режим работы (Контакты и часы) — от него зависит тихая доставка уведомлений  
5. `curl -sS https://ДОМЕН/api/health` → `"ok":true,"db":true`  
6. Бэкап: `bash /opt/sochi-portal/scripts/full-backup.sh` (или cron)

Подробнее по старым инцидентам: `docs/VPS-OS-SETUP.md`, `docs/related/hardening-ops.md`, `docs/related/security-plan.md`.

---

## 4. Как работать с сайтом (операционка)

### Dual: тест → прод

1. Правки → git push  
2. Staging: `bash scripts/workflow-deploy-staging.sh` → проверка на **ty** / вашем тест-домене  
3. Smoke: `bash scripts/smoke-sites.sh --staging-only`  
4. Человек: «одобряю» / «кати на prod»  
5. Promote: `CONFIRM=PROMOTE_YOUNG APPROVE=YES bash scripts/manual-promote-to-young.sh`  
6. Smoke prod  

Документ: `docs/WORKFLOW.md`.

### Модули и боты

- Admin → Модули — kill-switch разделов  
- Admin → Боты — MAX/Telegram, получатели, webhook  
- Вне рабочих часов (режим организации) уведомления приходят **тихо** (без звука/web-push)

### Контент

- Новости, клубы, проекты, пространства, афиша (брони), документы — через админку  
- Загрузки: `/opt/sochi-portal/public/uploads` (в бэкапе)

---

## 5. Модернизация под другую организацию

Исходник: `youngportal-source-full-*.tgz` или `source/app.tgz` внутри kit.

### 5.1 Брендинг и контакты

1. Admin → Контакты и часы: название, адрес, телефон, режим работы  
2. Admin → Соцсети / внешний вид: логотип, цвета (если заданы в настройках)  
3. `SiteSettings.publicSiteUrl` / `NEXTAUTH_URL` = ваш домен  
4. Юр. блок: Admin → Legal (оператор, ИНН, ОГРН)

### 5.2 Код (если нужна глубокая кастомизация)

| Область | Где смотреть |
|---------|--------------|
| Карта кода | `docs/CODEBASE-MAP.md`, `ARCHITECTURE.md` |
| Схема БД | `prisma/schema.prisma` |
| Деплой Docker | `docker-compose.yml`, `Dockerfile` |
| Nginx | `deploy/*.tpl` |
| Сиды контента | `scripts/seed-*.mjs` |
| Клиентский harden | `scripts/client-harden.sh` |

Чистая установка без чужих пользователей:

```bash
sudo bash INSTALL.sh --clean
# или --demo для тестовых ролей
```

Затем наполнить контент вручную или `node scripts/seed-crm-content.mjs` (осторожно — под ваш сценарий).

### 5.3 Лицензия и защита кода

- `LICENSE` в корне  
- Клиентский профиль снимает `docs/tests` и ставит src read-only: `scripts/client-harden.sh`  
- `docs/CODE-PROTECTION.txt`

---

## 6. Проверка скриптов kit

```bash
bash scripts/verify-kit-scripts.sh
bash scripts/qa-install-ha-scripts.sh   # если HA/replica
```

Smoke после деплоя:

```bash
bash scripts/smoke-sites.sh
bash scripts/smoke-sites.sh --staging-only
```

---

## 7. Контакты эталона (для справки)

| Роль | URL |
|------|-----|
| Прод | https://py.idivles.ru |
| Тест | https://ty.idivles.ru |
| Health | `/api/health` |
| Админ ботов | `/admin/bots` |

Не использовать устаревшие `young.idivles.ru` / `y1.idivles.ru` / `176.124.204.53` как умолчания.
