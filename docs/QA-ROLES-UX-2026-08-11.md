# QA / UX: полная имитация ролей — young.idivles.ru

**Дата:** 2026-08-11  
**Стенд:** production `https://young.idivles.ru`  
**Сайт:** Центр развития молодежи Сочи (Young Portal)  
**Методы:** HTTP/API матрица (`scripts/qa-deep-roles-ux.mjs`, `qa-modules-toggle.mjs`), ручной браузерный обход гостя (скриншоты), точечные сессии по ролям.

**Контекст модулей на момент теста**

| Состояние | Модули |
|-----------|--------|
| **ON** | events, projects, clubs, spaces, programs, news, tickets_scan, maintenance(штат) |
| **OFF** | registration, messaging, places, gallery, vacancies, contests, friends, games, portfolio, eco, achievements, ratings, club_chat, faq, server_status, bots |

Kill-switch маршрутов: **25/25 OK** (OFF → `/unavailable?m=…&mode=soon|hide`).

**Учётки QA**

| Роль | Email | Примечание |
|------|-------|------------|
| USER | `friends@sochi.ru` | `user@sochi.ru` на проде = **PARTICIPANT** |
| PARTICIPANT | `part@sochi.ru`, `user@sochi.ru` | |
| MODERATOR | `mod@sochi.ru` | ACL: projects,clubs,spaces,bookings,applications,pages,programs,news,stats,scanner — **без moderation** |
| ADMIN | `qa-admin@sochi.ru` | |
| SCANNER | `scanner@sochi.ru` | |
| TECH | `tech@young.idivles.ru` | bootstrap из env |
| Пароль QA | `RolePass123!` | кроме TECH |

Артефакты: `/opt/cursor/artifacts/qa/` (JSON-лог, скриншоты `screens/`).

---

## 1. GUEST (неавторизованный)

### Сценарии
- Главная, афиша, проекты, клубы, пространства, новости, гранты/добро/самоуправление, контакты, privacy/rules/terms/documents  
- OFF-разделы: register, places, gallery, vacancies, contests, games, friends, messages, faq, portfolio  
- Попытки `/dashboard`, `/admin`, `/scanner`, `/ops`, `/messages`  
- `/login`, `/forgot-password`, `/more`, `/change-password`  
- PWA: `manifest.webmanifest`, `sw.js`  
- Мобильный вид ~390px (hero)

### Работает корректно
- Публичные ON-страницы отдают 200, тексты на русском, навигация и футер читаемы  
- OFF-URL → `/unavailable` с понятными текстами («Раздел временно отключён» / «в разработке») + кнопка «На главную»  
- `/dashboard`, `/admin`, `/scanner` → редирект на `/login`  
- Защищённые API (`/api/user/profile`, `/api/admin/stats`) → 401/403  
- Неверный пароль не создаёт сессию  
- Форма входа: «Вход», Email/телефон, Пароль, «Забыли пароль?»  
- PWA manifest + service worker доступны (200)  
- Health/страницы ~0.8–1.2 с — приемлемо

### Проблемы

| # | Проблема | Шаги | Критичность | Рекомендация |
|---|----------|------|-------------|--------------|
| G1 | В шапке всегда видна кнопка **«Регистрация»**, хотя модуль `registration` OFF → ведёт на `/unavailable` | Открыть любую страницу → клик «Регистрация» | **Высокая (UX)** | Скрывать пункт при `modules.registration === false` (и на `/login`, `/more`) |
| G2 | Пункт **«Куда сходить»** в навбаре не обёрнут в `modOn('places')` — ссылка жива при OFF | Главная → «Куда сходить» | **Средняя** | Как у gallery/vacancies: `modOn(siteSettings,'places')` |
| G3 | Футер **не фильтрует** выключенные модули: Вакансии, Конкурсы, Игры, FAQ, Куда сходить | Проскроллить футер | **Средняя** | Фильтровать `PRIMARY_NAV` по `moduleFlagsJson` / public status |
| G4 | На `/login` ссылка «Зарегистрироваться» при выключенной регистрации | `/login` | **Средняя** | Скрывать или вести на `/unavailable` с пояснением |
| G5 | `/more` для гостя показывает кнопку «Регистрация» | `/more` без сессии | **Средняя** | То же, что G1 |
| G6 | `/change-password` отдаёт 200 HTML гостю; редирект только client-side | Открыть URL | **Низкая** | Proxy/SSR redirect на login (API уже защищён) |
| G7 | `/ops` для гостя → `/` (не login) | Открыть `/ops` | **Низкая** | Ок для скрытности; либо login с staff-флагом |
| G8 | API OFF-модулей → **503** + JSON (не 403) | `GET /api/friends` | **Низкая** | Допустимо; унифицировать код/статус в клиентах |

### UX-впечатление
Чистый публичный портал, понятный русский UI. Главный минус — **меню врёт**: предлагает разделы, которые TECH выключил.

---

## 2. USER (`friends@sochi.ru`)

### Сценарии
- Логин → сессия role=USER  
- `/dashboard` 200, `GET/PATCH /api/user/profile`  
- Заявки/брони API, попытка apply в клуб  
- Запрет `/admin`, `/scanner`, `/ops`, `/api/admin/stats`  
- Friends/messages/eco при OFF  
- Уведомления `/api/user/notifications` (канон), не `/api/notifications`

### Работает корректно
- Логин, кабинет, профиль (PATCH → «Профиль успешно сохранен!»)  
- Admin/scanner/ops закрыты (307 на `/dashboard` или `/`, API 403 «Недостаточно прав»)  
- OFF-модули API: 503 с русским `message` / `MODULE_SOON` | `MODULE_DISABLED`

### Проблемы

| # | Проблема | Шаги | Критичность | Рекомендация |
|---|----------|------|-------------|--------------|
| U1 | QA-аккаунт `user@sochi.ru` назван USER, фактически **PARTICIPANT** | Логин user@… | **Низкая (тест-данные)** | Поправить сид/документацию |
| U2 | Apply в `qa_club_it` → 400 «Клуб недоступен для заявок» | POST `/api/applications` | **Средняя (контент/QA)** | Открыть демо-клуб для заявок или обновить fixture id |
| U3 | Кабинетные разделы eco/achievements/friends/portfolio выключены — часть плиток `/more` должна скрываться (код уже module-aware) | UI `/more` | **Инфо** | После включения модулей — регресс |
| U4 | На `/dashboard` при `eco`/`achievements`/`ratings` OFF всё ещё видны кольца Level/Reliability/Community/**Eco (49)**, блок достижений и рефералка «эко/соц баллы» | Логин → `/dashboard` | **Средняя (UX)** | Прятать/задизейблить виджеты по `moduleFlags`, как в `/more` |

### UX-впечатление
Базовый кабинет стабилен. При текущем kill-switch много «пустых» ожиданий участия (друзья, сообщения, эко) — это ожидаемо, если модули OFF, но навигация снаружи всё ещё манит на OFF-разделы (см. G1–G3).

---

## 3. PARTICIPANT (`part@sochi.ru`, `user@sochi.ru`)

### Сценарии
- Логин, профиль, applications/bookings, запрет admin/ops  
- Те же OFF API, что у USER

### Работает корректно
- Сессия PARTICIPANT, кабинет 200, staff API deny  
- Поведение почти идентично USER на уровне API

### Проблемы
- Те же U2/U3 и влияние G1–G3  
- Отличий UX USER↔PARTICIPANT на API-уровне не выявлено (роль скорее продуктовая/семантическая)

### UX-впечатление
Как у USER: надёжный вход и кабинет, ограничения модулей согласованы на API.

---

## 4. MODERATOR (`mod@sochi.ru`)

### Сценарии
- Логин → `/admin` 200  
- ADMIN_ONLY: users, settings, rkn, backup → `/admin?denied=1`  
- Разрешённые: `/admin/news` 200, `/scanner` 200 (есть право scanner)  
- `/admin/moderation` → denied (в permissions **нет** `moderation`)  
- `/ops` → `/`

### Работает корректно
- ACL работает: admin-only закрыто редиректом `?denied=1`  
- Сканер доступен по праву  
- Контентные разделы по выданным permissions открываются

### Проблемы

| # | Проблема | Шаги | Критичность | Рекомендация |
|---|----------|------|-------------|--------------|
| M1 | Редирект `?denied=1` без явного баннера может быть неочевиден | MOD → `/admin/users` | **Средняя (UX)** | Toast/баннер «Недостаточно прав для раздела» |
| M2 | У QA-мода нет `moderation` — модерация недоступна | `/admin/moderation` | **Инфо** | Добавить permission в сид, если нужен полный QA мода |
| M3 | `/ops` недоступен (ожидаемо) | `/ops` | OK | — |

### UX-впечатление
Роль staff ощущается правильно; отказ в admin-only лучше сделать заметнее.

---

## 5. ADMIN (`qa-admin@sochi.ru`)

### Сценарии
- Логин, обход `/admin/*`  
- API stats, nav-counts, users  
- `/admin/system` при `server_status=OFF`  
- `/admin/online`, `/admin/awards` (новые фичи веток)  
- `/ops` запрещён

### Работает корректно
- Большинство admin-страниц 200  
- API админки 200  
- TECH `/ops` закрыт (307 `/`)  
- Scanner доступен

### Проблемы

| # | Проблема | Шаги | Критичность | Рекомендация |
|---|----------|------|-------------|--------------|
| A1 | `/admin/system` → `/unavailable?m=server_status` при выключенном флаге — админ «выключается» своим же kill-switch | Admin → Система | **Средняя** | Исключение: ADMIN всегда видит system **или** явная подпись в Ops «это скроет system у админов» |
| A2 | `/admin/online`, `/admin/awards`, `/api/admin/online` → **404** на проде | Открыть URL | **Средняя** | Не задеплоены с feature-веток (PR #9/#10) — задеплоить |
| A3 | Создание новости через API зависит от контракта endpoint (в матрице 200/201/400/404) | POST news | **Низкая** | Уточнить канон API после деплоя |

### UX-впечатление
Админка живая; путаница из‑за `server_status` OFF и отсутствующих новых экранов на проде.

---

## 6. SCANNER (`scanner@sochi.ru`)

### Сценарии
- Логин → доступ `/scanner`, API `/api/scanner/events`  
- Запрет `/admin`, запрет подачи заявок  
- Невалидный QR/код

### Работает корректно
- Узкая роль соблюдена: сканер есть, админка/заявки закрыты  
- Невалидный код → 4xx (не 500)

### Проблемы
- Критичных не найдено на API-уровне

### UX-впечатление
Хорошая изоляция «только вход».

---

## 7. TECH (`tech@young.idivles.ru`)

### Сценарии
- Логин → `/ops` 200, `GET /api/ops/flags` 200  
- `/admin` → `/ops`, `/dashboard` → `/ops`

### Работает корректно
- Полный ops-контур, админка закрыта, редиректы в `/ops` последовательны  
- Публичный `/api/public/status` отражает флаги

### Проблемы
- Критичных нет  
- Риск ops: выключение `server_status` бьёт по ADMIN (A1)

### UX-впечатление
Чёткий «пульт аварийный»; для гостя `/ops` маскируется на главную.

---

## 8. Спец. случаи / кросс-срез

| Тема | Результат |
|------|-----------|
| Регистрация | OFF — нельзя создать новый аккаунт с сайта (ожидаемо) |
| Восстановление пароля | Страница `/forgot-password` доступна (зависит от почтового провайдера на проде) |
| PWA | Manifest + SW 200; install/offline UI — частично visually (mobile + Application tab) |
| Двойной submit заявки | Без 500, повтор → 400 |
| Сессия | Стабильна между запросами; bad login → null session |
| Язык ошибок API | Русский (`Недостаточно прав`, `Раздел в разработке`, …) |
| Мобильный hero | Адаптив ок (~390px), CTAs «Проекты» / «Бронь пространства» |

---

## Сводная таблица

| Роль | Доступ к своему контуру | Изоляция чужого | UX-оценка | Блокеры |
|------|-------------------------|-----------------|-----------|---------|
| GUEST | Хорошо (ON-разделы) | Хорошо (API/кабинет) | 3.5/5 | Меню/футер/CTA на OFF-модули |
| USER | Хорошо | Хорошо | 4/5 | Мало live-контента для apply; модули OFF |
| PARTICIPANT | Хорошо | Хорошо | 4/5 | Как USER |
| MODERATOR | Хорошо по ACL | Хорошо | 4/5 | Тихий deny; нет moderation в сиде |
| ADMIN | Хорошо | Хорошо vs TECH | 3.5/5 | system через kill-switch; 404 online/awards |
| SCANNER | Отлично | Отлично | 4.5/5 | — |
| TECH | Отлично | Отлично | 4.5/5 | Побочный эффект флагов на ADMIN |

---

## Общий вывод

**Безопасность ролей в целом здоровая:** гости не лезут в API staff, USER/PARTICIPANT отрезаны от admin/ops/scanner, SCANNER узкий, TECH изолирован в `/ops`, MOD видит только выданные разделы.

**Главный UX-провал:** kill-switch модулей работает на URL/API, но **шапка, футер и CTA регистрации продолжают рекламировать выключенное**. Пользователь кликает «Регистрация» / «Куда сходить» / «Игры» и получает заглушку — ощущение «сломанного» сайта, хотя механизм штатный.

**Прод отстаёт от feature-веток:** `/admin/online`, awards — 404; имеет смысл задеплоить после merge PR.

**Приоритет фиксов:** G1+G3+G4 (навигация под флаги) → A1 (system для ADMIN) → M1 (баннер denied) → деплой online/awards → обновить QA-сиды (роли/клубы).

---

## Приложения

- JSON: `docs/perf/qa-deep-roles-ux-*.json`, `/opt/cursor/artifacts/qa/qa-deep-roles-ux.json`  
- Модули: `docs/perf/qa-modules-toggle-*.json` (25/25)  
- Скрины гостя: `/opt/cursor/artifacts/qa/screens/guest-*.png`  
- Скрипт повтора: `node scripts/qa-deep-roles-ux.mjs https://young.idivles.ru`
