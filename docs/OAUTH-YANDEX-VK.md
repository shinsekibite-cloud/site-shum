# OAuth: Яндекс ID и VK ID (план интеграции)

Портал уже на NextAuth (`src/lib/auth.ts`). Сейчас основной вход — email/пароль. Соц-вход добавляется провайдерами NextAuth без ломки согласий 152-ФЗ.

## 1. Общее

1. В кабинете разработчика создать приложения:
   - [Яндекс OAuth](https://oauth.yandex.ru/) — callback: `https://young.idivles.ru/api/auth/callback/yandex`
   - [VK ID](https://id.vk.com/) — callback: `https://young.idivles.ru/api/auth/callback/vk`
2. В `.env` на VPS:
   ```
   YANDEX_CLIENT_ID=...
   YANDEX_CLIENT_SECRET=...
   VK_CLIENT_ID=...
   VK_CLIENT_SECRET=...
   ```
3. В `authOptions.providers` добавить `YandexProvider` / `VkProvider` (или кастомный OIDC для VK ID).
4. Prisma `Account` уже есть (NextAuth adapter) — связать `provider` + `providerAccountId` с `User`.
5. При первом входе через соцсеть:
   - создать User, если нет email-матча;
   - **обязательно** показать экран согласий (Политика + Правила + `/terms` + ПДн), как при регистрации — без галочек аккаунт не активировать;
   - запросить недостающие поля (телефон, дата рождения 14+) если провайдер их не отдал.
6. Kill-switch `registration`: при `false` запретить создание новых User через OAuth (логин существующих — по решению оператора).
7. В Политике: получатель ПДн — ООО «Яндекс» / VK при авторизации; трансграничность — по ст. 12 152-ФЗ / перечень РКН.
8. Не хранить access_token дольше, чем нужно для refresh; не логировать токены.

## 2. UX

- Кнопки «Войти через Яндекс / VK» на `/login` и `/register` (если регистрация открыта).
- Связка аккаунтов: в профиле «Подключить Яндекс/VK» для уже зарегистрированных по email.

## 3. Безопасность

- `NEXTAUTH_URL` = production URL.
- State/nonce — штатно NextAuth.
- После OAuth — TrustedDevice flow как при парольном входе.

## 4. Не делать в первой итерации

- Не отключать email-регистрацию сразу.
- Не передавать ПДн друзей из соцсети на Портал.
- Не включать автопостинг в VK от имени пользователя.
