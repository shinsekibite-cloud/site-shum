# YoungPortal — архив заказчика (org kit)

Сайт наполнялся под конкретного заказчика. Этот комплект поднимает **тот же контент** на другом VPS с заменой доменов/названия и выбором функций.

## Что в архиве

| Путь | Содержимое |
|------|------------|
| `source/app.tgz` | Код портала |
| `snapshot/db.dump` | БД с контентом заказчика |
| `snapshot/uploads.tgz` | Загрузки (аватары, галерея…) |
| `snapshot/images.tar.gz` | Docker-образы (если pack с `--with-live`) |
| `INSTALL.sh` / `START.sh` | Установщик |
| `scripts/apply-site-identity.mjs` | Перепись названия/доменов в политиках и правилах |
| `scripts/verify-site-identity.mjs` | Проверка, что старые домены ушли |

Секреты (`.env`) **не** входят — генерируются при установке.

## Собрать архив (на машине разработчика)

```bash
# Полный клон с живого стенда (ty/py) + код текущей ветки
KIT_PREFIX=youngportal-customer-org-kit \
  bash scripts/pack-dev-deploy-kit.sh --customer --with-live --out-dir /opt/cursor/artifacts

# Только код (без БД) — если контент заведёте на месте
KIT_PREFIX=youngportal-customer-org-kit \
  bash scripts/pack-dev-deploy-kit.sh --customer --source-only --out-dir /opt/cursor/artifacts
```

## Установка на VPS заказчика

```bash
tar -xzf youngportal-customer-org-kit-*.tgz
cd youngportal-customer-org-kit-*

# Интерактивно: домены → название → выбор модулей
sudo bash START.sh --developer --full

# Или одной командой:
sudo bash START.sh --developer --full --yes \
  --site-name 'Молодёжный портал X' \
  --prod-domain portal.example.ru \
  --staging-domain test.example.ru \
  --le-email ops@example.ru \
  --modules=content \
  --modules-off=games,eco
```

При установке автоматически:

1. Восстанавливается БД/uploads из `snapshot/`
2. В `SiteSettings` пишутся новое имя и `https://prod-domain`
3. `apply-site-identity` правит CMS-страницы **privacy / rules / terms / about** (старые хосты и названия → плейсхолдеры / новое имя)
4. `apply-module-selection` включает выбранные функции
5. `verify-site-identity` проверяет политики

## Выбор функций (модули)

| Значение | Что включает |
|----------|----------------|
| `all` | Все разделы |
| `core` | Афиша, проекты, клубы, пространства, друзья, новости, кабинет… |
| `content` | core + места, гранты, добро, самоуправление, вакансии, конкурсы, рефералы |
| `--modules-off=games,eco` | Доп. выключения поверх пресета |

В меню `START.sh` / `INSTALL.sh` (без `--yes`) есть пункт «Функции сайта».

После установки модули можно менять в админке: **Настройки → Модули**.

## Проверка после установки

```bash
curl -sS https://PORTAL/api/health
curl -sS https://PORTAL/api/public/status   # флаги модулей

docker exec sochi-portal-web-1 \
  env SITE_NAME='Молодёжный портал X' PUBLIC_URL=https://PORTAL \
  node /app/scripts/verify-site-identity.mjs

# В браузере: /privacy /rules /terms /about — нет ty.idivles.ru / py.idivles.ru,
# везде актуальное название и блок «Актуальные параметры».
```

Повторная смена доменов на уже установленном сервере:

```bash
docker exec -e SITE_NAME='…' -e PUBLIC_URL=https://NEW.ru \
  sochi-portal-web-1 node /app/scripts/apply-site-identity.mjs
docker exec -e SITE_NAME='…' -e PUBLIC_URL=https://NEW.ru \
  sochi-portal-web-1 node /app/scripts/verify-site-identity.mjs
# + обновить NEXTAUTH_URL в .env и nginx
```

## Важно

- Архив с `db.dump` содержит **персональные данные** — передавать только по договору / защищённому каналу.
- Не публикуйте `live-latest` / org-kit на открытый URL без токена.
- Прод (py) не промоутить без явного «одобряю».
