# Полный клон young.idivles.ru — kit установки

Нужны **тест и прод на одном сервере** (как y1 + young) — смотрите
[DEV-DEPLOY-KIT.md](./DEV-DEPLOY-KIT.md). Этот документ — про
**однодоменный** клон только прода.

Скрипты собирают **готовый архив прода** (код + Docker-образ + Postgres +
загрузки) и ставят его на новый сервер с **вашими** названием, доменом,
сертификатами и политикой защиты.

## Собрать архив (с машины, у которой SSH на прод)

```bash
bash scripts/pack-full-clone-kit.sh
```

На VPS появится:

- `/var/backups/sochi-portal/youngportal-full-kit-<stamp>.tgz`
- токенизированная ссылка `https://young.idivles.ru/backups/<token>/…`

Локально (если не `--skip-download`): `ARTIFACTS_DIR/youngportal-full-kit-*.tgz`.

Секреты `.env` и TLS-ключи **не** пакуются. Дамп БД и uploads — да
(персональные данные; ссылка с токеном, не публиковать).

## Поставить на новый VPS

```bash
tar -xzf youngportal-full-kit-*.tgz
cd youngportal-full-kit-*
sudo bash INSTALL.sh
```

Мастер спрашивает: название, домен, TLS (Let's Encrypt / свои файлы /
self-signed / HTTP), UFW, fail2ban, порт SSH, rate-limit, HSTS, клон БД.

Неинтерактивно:

```bash
SITE_NAME="Мой портал" DOMAIN=portal.example.ru \
TLS_MODE=letsencrypt LE_EMAIL=ops@example.ru \
bash INSTALL.sh --yes
```

Перенастройка:

```bash
sudo bash /opt/sochi-portal/scripts/install-full-clone.sh --reconfigure
```

## Файлы в репозитории

| Файл | Назначение |
|------|------------|
| `scripts/pack-full-clone-kit.sh` | Собрать архив с живого young |
| `scripts/install-full-clone.sh` | Установщик / перенастройка (`INSTALL.sh` в архиве) |
| `deploy/nginx-clone-site.conf.tpl` | Nginx одного домена (как прод :3000) |
| `deploy/fail2ban-yp-nginx.local` | Jails nginx |
| `docs/README-INSTALL-FULL-KIT.txt` | Инструкция внутри архива |
