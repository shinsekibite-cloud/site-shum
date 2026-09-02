# Быстрое удалённое развёртывание YoungPortal

Цель: поднять портал на VPS организации **одной-двумя командами**, с выбором модулей и готовым ADMIN.

Домены в примерах замените на свои. Эталон хранения китов: **py.idivles.ru** / IP `77.110.125.241`.

---

## 1. Что нужно заранее

- VPS: Debian 12+ / Ubuntu 22.04+, root, ≥2 GB RAM (лучше 4), ≥20 GB диск
- Два домена (прод + тест) с A-записью на IP
- Email для Let's Encrypt
- Email/пароль первого администратора (или генерация на сервере)

---

## 2. Вариант A — с машины разработчика (рекомендуется)

```bash
# 1) Скачать орг-кит (с контентом) ИЛИ source/client
KIT_PROFILE=org bash scripts/download-kit.sh /tmp/yp-org.tgz
# либо: KIT_PROFILE=source …  (только код)
# либо: KIT_PROFILE=client …  (slim)

tar -xzf /tmp/yp-org.tgz -C /tmp
cd /tmp/youngportal-org-kit-*   # имя каталога смотрите в архиве

# 2) Установка на УДАЛЁННЫЙ VPS с выбором модулей
SSHPASS='root-password' bash install-remote.sh root@НОВЫЙ_IP \
  --client \
  --prod-domain portal.example.ru \
  --staging-domain test.example.ru \
  --le-email ops@example.ru \
  --admin-email admin@example.ru \
  --admin-password 'StrongPass1!' \
  --site-name 'Молодёжный портал' \
  --modules=core \
  --modules-off=games,eco
```

### Presets `--modules`

| Значение | Смысл |
|----------|--------|
| `all` / `full` | Все модули включены (по умолчанию) |
| `core` | База: регистрация, новости, афиша, проекты/клубы/пространства, заявки, сообщения, документы, FAQ… |
| `content` | core + места, гранты/добро/самоуправление, вакансии, конкурсы |
| `events,news,projects,clubs` | Явный список **включённых**; остальные публичные — выкл. |

Дополнительно: `--modules-off=games,eco` — выключить поверх пресета.  
`--off-mode=soon` — страница «в разработке» вместо «отключён».

После установки на сервере:

- ADMIN: `/etc/yp-portal/admin-credentials.txt`
- Модули уже применены (`apply-module-selection.mjs`)
- Демо-контент: `seed-org-starter.mjs` (для client/demo/clean)

---

## 3. Вариант B — прямо на VPS организации

```bash
curl -fL -o kit.tgz 'https://py.idivles.ru/backups/<token>/youngportal-….tgz'
tar -xzf kit.tgz && cd youngportal-*-kit-*
sudo bash START.sh --client --yes \
  --prod-domain portal.example.ru \
  --staging-domain test.example.ru \
  --le-email ops@example.ru \
  --admin-email admin@example.ru \
  --modules=content \
  --modules-off=games
```

Или через env-файл: `scripts/yp-install.env.example` → `bash scripts/yp-install.sh`.

---

## 4. Варианты данных

| Флаг | Результат |
|------|-----------|
| `--client` / `--clean` | Пустая БД + ADMIN + стартовый демо-контент + модули |
| `--demo` | + учётки ролей (`InstallSeed1!` / ваш `--seed-password`) |
| `--full` | Восстановление снимка из kit (если есть `snapshot/`) — **без** затирания демо-сидом |

---

## 5. Проверка после установки

```bash
curl -sS https://portal.example.ru/api/health
curl -sS https://portal.example.ru/api/public/status | jq '.modules'
bash /opt/sochi-portal/scripts/smoke-sites.sh   # если скрипты на месте
```

Дальше: `docs/ORG-ADMIN-GUIDE.md` (первый вход, модули, контент).

---

## 6. Смена модулей после запуска

Без переустановки:

1. TECH → `/ops` или ADMIN → Настройки → Модули  
2. Или на сервере:

```bash
docker exec -e MODULES=core -e MODULES_OFF=games \
  sochi-portal-web-1 node /app/scripts/apply-module-selection.mjs
```

---

## 7. Безопасность при развёртывании

Установщик включает UFW (22/80/443), fail2ban, генерирует `NEXTAUTH_SECRET`, не копирует чужие `.env`.  
После передачи: сменить ADMIN/TECH пароли, ротировать токены ботов, проверить `docs/ORG-HANDOFF.md` §3.
