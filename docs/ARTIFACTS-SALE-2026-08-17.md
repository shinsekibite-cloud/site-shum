# Архивы к продаже / передаче — 2026-08-17

Ветка: `cursor/sale-ready-audit-16b2` @ `06381b5` (+ follow-ups).  
Полный отчёт: [`SALE-READY-AUDIT.md`](./SALE-READY-AUDIT.md).  
Установка: [`REMOTE-DEPLOY.md`](./REMOTE-DEPLOY.md).

## 1. Portable development (~39 МБ)

Код + docs + install scripts **без** живой БД. Для продолжения разработки на другом ПК/VPS.

- Файл: `youngportal-portable-dev-20260817-165533.tgz`
- SHA-256: `563e7ecade94c213c871d44899b526e230790f4b2da4ba47b6f1c70e9966e334`
- URL: https://py.idivles.ru/backups/7c4c40956079940759d66f0fa16ec76f/youngportal-portable-dev-20260817-165533.tgz
- Локально: `/workspace/artifacts/` · `/opt/cursor/artifacts/`

```bash
tar -xzf youngportal-portable-dev-*.tgz && cd youngportal-portable-dev-*
sudo bash START.sh --developer --demo --yes \
  --prod-domain a.example.ru --staging-domain b.example.ru \
  --modules=all
```

## 2. Sale source (~39 МБ)

Чистый презентабельный исходник с документацией, без секретов и без чужой БД.

- Файл: `youngportal-sale-source-20260817-165533.tgz`
- SHA-256: `226c83af846975431c904a5b611d1d42a3b89954681ff7e6caf681f886a96639`
- URL: https://py.idivles.ru/backups/ee04eda05dd68fd4a4d81194ff441464/youngportal-sale-source-20260817-165533.tgz

```bash
tar -xzf youngportal-sale-source-*.tgz && cd youngportal-sale-source-*
sudo bash START.sh --client --yes \
  --prod-domain portal.example.ru --staging-domain test.example.ru \
  --admin-email admin@example.ru --modules=core
```

## 3. Org kit with cleaned content (~1.6 ГБ)

Код + снимок БД/uploads/образов (дедуп заявок 0). Содержит персональные данные эталона — **только по договору**.

- Файл: `youngportal-org-kit-20260817-165559.tgz`
- SHA-256: `425e7ecbe385fc080d549a062013ce37c6788a6bb722bd7c0de83093c37f9840`
- URL: https://py.idivles.ru/backups/66a69bef75be334d95c7d0d6b0f046f9/youngportal-org-kit-20260817-165559.tgz
- Локально: `/workspace/artifacts/youngportal-org-kit-20260817-165559.tgz`
- VPS: `/var/backups/sochi-portal/youngportal-org-kit-latest.tgz`

```bash
KIT_PROFILE=org bash scripts/download-kit.sh   # после обновления URL в download-kit
# или curl по URL выше
tar -xzf youngportal-org-kit-*.tgz && cd youngportal-org-kit-*
sudo bash START.sh --full --yes \
  --prod-domain portal.example.ru --staging-domain test.example.ru
```

Для чистой установки без чужих пользователей из того же комплекта: `--client --modules=content` (не `--full`).

## Скрипт скачивания

```bash
KIT_PROFILE=org|source|client bash scripts/download-kit.sh ./kit.tgz
```

После обновления профилей `portable` / `sale` в `scripts/download-kit.sh` (см. коммит ветки).
