# Аудит кода y1.idivles.ru — 2026-08-13

Снимок исходников с прод-VPS `/opt/sochi-portal`, проверка live-сайта https://y1.idivles.ru, nginx, docker, логов и всего дерева `src/` (~612 файлов, ~134 API route).

Секреты, пароли VPS, `.env` и персональные загрузки **в репозиторий не попадали**.

## Прод на момент аудита

| Проверка | Результат |
|----------|-----------|
| `https://y1.idivles.ru` | HTTP/2 200, Next.js, HSTS, CSP nonce |
| `GET /api/health` | `{ ok: true, db: true, maintenanceMode: false }` |
| `GET /api/public/status` | все модули `true`, регистрация включена |
| Docker | `sochi-portal_web_1` / `_db_1` / `_redis_1` — healthy |
| TLS | Let’s Encrypt `y1.idivles.ru` |
| `young.idivles.ru` | 503, ссылка на y1 |
| Диск VPS | ~43% из 30 G |

Живые ошибки в логах web: `Server Reference ID did not match` (устаревшие Server Actions после rebuild — не утечка данных). Nginx ловит сканеры `.env` / `.git` лимитом `yp_conn`. Чужой vhost `max.idivles.ru` отвечает 111 на `:8010` — **не** этот сайт.

## Исправлено в этом снимке GitHub

| Приоритет | Проблема | Фикс |
|-----------|----------|------|
| CRITICAL | Stored XSS: `rulesHtml` конкурса без sanitize | `sanitizeCmsHtml` при записи и при GET/рендере |
| CRITICAL | Stored XSS: HTML описания вакансии | то же для vacancies |
| CRITICAL | Авто-повышение до TECH по совпадению email | удалено; TECH только bootstrap-паролем |
| HIGH | `javascript:` в ссылках работ конкурса | `safeHttpUrl()` на submit, GET и UI |
| HIGH | OTP verify только по IP | лимит на адрес `verifyEmailPerAddressLimiter` |
| HIGH | Сброс пароля без rate-limit | `resetPasswordRateLimiter` |
| HIGH | Статический fallback HMAC 2FA | в production без `NEXTAUTH_SECRET` — отказ |
| HIGH | CSRF: Origin/Referer необязательны | оба заголовка обязательны; CSRF на messages/friends/gallery/contest submit |
| MEDIUM | CSP `script-src … https:` обходил nonce | убран голый `https:` |
| MEDIUM | `next/image` тянул любой `http://` | только `https` remotePatterns |
| MEDIUM | Аватар — любой `http(s):` URL | `isSafeHttpUrl` |
| MEDIUM | `.env.example` без Redis-пароля | `REDIS_PASSWORD` + URL с паролем |
| LOW | Одноразовые SSH/X-UI скрипты в корне | удалены из репозитория |

## Что уже было сделано хорошо (не ломали)

- JWT `tokenVersion` не принимается с клиента; смена пароля инвалидирует сессии
- Регистрация через `PendingUser` + email OTP, возраст ≥ 14, captcha, fingerprint
- Magic bytes на картинках, WebP re-encode, `sanitizeCmsHtml` в CMS/legal
- ACL на admin API, гости не видят ПДн профилей
- HMAC-билеты, cron/`CRON_SECRET`, подпись webhooks Telegram/MAX
- Rate-limit Redis на login/register/messages/friends/bookings/upload
- Удаление аккаунта с grace 30 дней

## Остаётся (не блокер этого PR)

1. CSRF ещё не на всех mutating API (admin, bookings, applications) — SameSite=Lax снижает риск.
2. `TECH_BOOTSTRAP_PASSWORD` в plaintext env — лучше только `TECH_PASSWORD_HASH`, bootstrap выключить после первого входа.
3. OTP 8 цифр; при известном pending-email теоретический brute-force (теперь режется per-email).
4. Документы без magic-byte (PDF/DOCX) — полагаются на расширение + `nosniff`.
5. Org-wide check-in QR не привязан к площадке.
6. `POST /api/views` можно накручивать (геймификация).
7. `as any` в auth/admin — риск drift схемы Prisma.
8. На том же VPS живут другие vhost (не этот репозиторий); дефолтный server_name при запросе по IP попадает в чужой upstream.

## Что не копировалось с VPS

- `.env`, сертификаты, `data/postgres`
- `public/uploads/avatars`, `gallery`, `portfolio`, `lea`, `backups`
- `docs/accounts/`, ops-credentials
- `node_modules`, `.next`

Live-бэкап cutover описан в [`AUDIT-2026-08-13.md`](./AUDIT-2026-08-13.md).
