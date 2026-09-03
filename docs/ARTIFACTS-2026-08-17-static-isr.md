# Artifacts — 2026-08-17 (static ISR promote + handoff)

Ветка: `cursor/static-routes-16b2` @ `461a404` (+ follow-ups).  
Прод: https://py.idivles.ru · тест: https://ty.idivles.ru

Собрано через `bash scripts/post-request-handoff.sh`.

## 1. Org kit (DR / другой VPS)

- Файл: `youngportal-org-kit-20260817-211320.tgz`
- SHA-256: `203f0e7944f1e5626375bf5e035595c5446baef1a8be3ac4c68e5cf5baf35358`
- URL: https://py.idivles.ru/backups/c8ec5dd215bc938a287a7ae05246d249/youngportal-org-kit-20260817-211320.tgz
- VPS: `/var/backups/sochi-portal/youngportal-org-kit-latest.tgz`
- Содержит: код + live snapshot (БД/uploads/образ) + docs/ORG-HANDOFF.md

```bash
KIT_PROFILE=org bash scripts/download-kit.sh
tar -xzf youngportal-org-kit-*.tgz && cd youngportal-org-kit-*
sudo bash START.sh --help
```

## 2. Sale source

- Файл: `youngportal-sale-source-20260817-211320.tgz`
- SHA-256: `73816894af6007355bccdeb46e875638e71d3ab80773010247674ce869d510f8`
- URL: https://py.idivles.ru/backups/aca20aaaaa0fd596b15ea52626a6ebab/youngportal-sale-source-20260817-211320.tgz

```bash
KIT_PROFILE=sale bash scripts/download-kit.sh
tar -xzf youngportal-sale-source-*.tgz && cd youngportal-sale-source-*
```

## 3. Portable / full source backup

- Portable: `youngportal-portable-dev-20260817-211320.tgz`  
  SHA-256 `748d7b6ac1f6b8bf9b476c1845c7db2fe934b848a2556d9e4a7186b669dcaa5a`  
  URL: https://py.idivles.ru/backups/9d15d24e9260ed7d2833a94a6392b010/youngportal-portable-dev-20260817-211320.tgz

## 4. VPS backups (скачать)

| Что | Путь на VPS | SHA-256 | Скачать |
|-----|-------------|---------|---------|
| Full host (`/opt/sochi-portal` без node_modules/.next + pg_dump рядом в каталоге бэкапов) | `/var/backups/sochi-portal/full-latest.tar.gz` | `aa7fb3cf457ebe6c00658a564a432db8688e07fa527b3eab197248aac3236395` | https://py.idivles.ru/backups/798aed53c527308941d69fcd11356051/full-2026-08-17_211908.tar.gz |
| Live snapshot (БД + uploads + docker image + host-app) | `/var/backups/sochi-portal/live-latest.tar.gz` | `52a2b06776d97e82263574c0d5cf9ec4ab9e4cc6e691a731f887e6830be4ba69` | https://py.idivles.ru/backups/75326331317fcd51e7099fa099b84c86/live-2026-08-17_211125.tar.gz |

Стабильные алиасы:

- https://py.idivles.ru/backups/full-latest.tar.gz
- https://py.idivles.ru/backups/live-latest.tar.gz

```bash
curl -fL -o full-latest.tar.gz \
  'https://py.idivles.ru/backups/798aed53c527308941d69fcd11356051/full-2026-08-17_211908.tar.gz'
curl -fL -o live-latest.tar.gz \
  'https://py.idivles.ru/backups/75326331317fcd51e7099fa099b84c86/live-2026-08-17_211125.tar.gz'
echo 'aa7fb3cf457ebe6c00658a564a432db8688e07fa527b3eab197248aac3236395  full-latest.tar.gz' | sha256sum -c
echo '52a2b06776d97e82263574c0d5cf9ec4ab9e4cc6e691a731f887e6830be4ba69  live-latest.tar.gz' | sha256sum -c
```

Локально у агента также: `/workspace/artifacts/youngportal-full-backup-latest.tgz` (source-only, без live DB).

## Проверка

```bash
bash scripts/smoke-sites.sh
# Public ISR on prod:
curl -sI https://py.idivles.ru/projects | grep -i cache-control
```
