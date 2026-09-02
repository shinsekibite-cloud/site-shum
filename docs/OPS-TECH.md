# TECH / Ops

Учётка техслужбы для `/ops` (не `/admin` и не `/api/admin/*`).

## Вход

1. Откройте `/login?callbackUrl=/ops`.
2. Email: `TECH_EMAIL` из `.env`.
3. Пароль:
   - **Первый вход** (аккаунта ещё нет): `TECH_BOOTSTRAP_PASSWORD` или bcrypt в `TECH_PASSWORD_HASH`.
   - **Далее / восстановление**: только пароль из БД, либо `TECH_PASSWORD_HASH` (plaintext bootstrap **не** сбрасывает существующий аккаунт).
4. После успеха — `/ops`.

## Env (VPS `.env`)

```bash
TECH_EMAIL=tech@young.idivles.ru
# только для первого создания TECH (затем лучше убрать):
TECH_BOOTSTRAP_PASSWORD=<сгенерировать>
# для recovery без plaintext bootstrap:
# TECH_PASSWORD_HASH=<bcrypt hash>
```

После первого успешного входа **удалите** `TECH_BOOTSTRAP_PASSWORD` из `.env` и пересоздайте web-контейнер.

## Поведение

- Нет пользователя с `TECH_EMAIL` → создаётся роль `TECH`.
- Пользователь есть → вход по хешу в БД; env `TECH_PASSWORD_HASH` может обновить хеш/роль.
- `TECH_BOOTSTRAP_PASSWORD` **не** разблокирует уже существующий аккаунт (защита от постоянного бэкдора).
- UI: только `/ops`. API `/api/admin/*` — только роль `ADMIN`.

## Если «не пускает»

1. Сверьте `TECH_EMAIL` / hash в `.env` и `docker exec … printenv`.
2. Пересоздайте контейнер web после правки `.env`.
3. Rate-limit / откройте `/login?callbackUrl=/ops`.
