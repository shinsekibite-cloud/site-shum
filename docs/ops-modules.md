# Модули сайта (Ops kill-switch)

Управление: TECH → `/ops` или `POST /api/ops/flags`.

Публичный статус (без секретов): `GET /api/public/status` → поля `modules`, `offModes`.

## Правила

- Нет ключа в JSON = модуль **включён** (fail-open для отсутствующих ключей).  
- TECH всегда проходит.  
- `MODULE_FLAGS_FORCE_ON=1` — аварийно включает всё.  
- Сборка сайта должна показывать `ƒ Proxy (Middleware)` (`next build --webpack`).
- Выключенный публичный модуль может иметь режим `__offModes[key]`:
  - `hide` (по умолчанию) → `/unavailable` «Раздел временно отключён»
  - `soon` → `/unavailable?mode=soon` «Раздел в разработке»
- Семантика `maintenance`: `true` = сайт в штатном режиме; `false` = техработы (зеркало `SiteSettings.maintenanceMode`).
- После сохранения флагов сбрасывается кэш Redis + теги `yp-site-chrome` / `yp-home-catalog` (шапка/футер/главная).
- Legacy JSON с ключом `programs: boolean` мапится на `grants` / `dobro` / `self_gov`, если этих ключей ещё нет.

## Что реально режется при выкл

| Модуль | Страницы | API / кабинет | Побочные эффекты |
|--------|----------|---------------|------------------|
| `registration` | `/register` | `/api/register` | — |
| `messaging` | `/messages` | `/api/messages`, `/api/dm`, кабинет/шапка | — |
| `events` | `/events`, `/tickets`, `/check-in` | `/api/events`, bookings, check-in, user/bookings | — |
| `tickets_scan` | `/scanner`, `/admin/scanner` | `/api/scanner` | — |
| `places` | `/places` | `/api/places`, `/api/user/places` | — |
| `gallery` | `/gallery` | `/api/user/gallery` | секция галереи на главной |
| `projects` / `clubs` / `spaces` | каталоги | proxy + заявки на эти сущности | секции на главной |
| `grants` / `dobro` / `self_gov` | `/grants`, `/dobro`, `/self-gov` | заявки на программы соответствующего kind | — |
| `applications` | `/dashboard/applications` | `/api/applications`, `/api/user/applications` | общий kill заявок |
| `notifications` | `/dashboard/notifications` | notifications/prefs/push API | `createUserNotification` no-op; колокольчик скрыт |
| `documents` | `/documents` | `/api/documents` | CTA/ссылки в футере и на главной |
| `referrals` | `/dashboard/referrals` | `/api/referrals` | `ref=` при регистрации игнорируется |
| `vacancies` / `contests` | публичные + admin | API | — |
| `friends` | `/friends` | `/api/friends` | — |
| `games` | `/games`, `/dashboard/games` | `/api/games`, `/api/user/games` | — |
| `news` | `/news` | `/api/news` | секция на главной |
| `portfolio` | `/portfolio`, `/dashboard/portfolio` | portfolio APIs | — |
| `eco` | `/dashboard/shop` | eco/collectibles/admin eco | **начисление eco останавливается** |
| `achievements` | `/dashboard/achievements|awards` | achievements/awards APIs | **unlock/evaluate останавливаются** |
| `ratings` | UI профиля | `/api/user/reputation` | — |
| `club_chat` | вкладки Клубы/Проекты в `/messages` | `/api/group-chat` | — |
| `faq` / `presentation` | страницы | downloads | — |
| `bots` | `/admin/bots` | admin bots + public bots + webhooks TG/MAX | outbound `botNotifyAllowed` = false |
| `server_status` | `/admin/system` | `/api/admin/system` | — |
| `maintenance` | весь сайт | отдельный механизм | — |

## Известные ограничения

1. **Админ-контент** (проекты/клубы/новости/программы) обычно остаётся доступен staff — kill-switch публичный.  
2. **ACL permission `programs`** в админке ≠ модульные флаги `grants`/`dobro`/`self_gov`.  
3. **Режим тишины** в настройках админа ≠ модуль `messaging` (тишина режет только user↔user POST).  
4. **Дублирующие тумблеры** в `/admin/settings` (registration/messaging/gallery) синхронизируются из Ops, но обратная запись из админки в `moduleFlagsJson` неполная.

## Быстрые команды проверки

```bash
curl -sS https://ty.idivles.ru/api/public/status | jq '.modules,.offModes'

# после выключения events TECH-ом:
curl -sSI https://ty.idivles.ru/events | head
# 307 Location: /unavailable?m=events&mode=hide

curl -sS https://ty.idivles.ru/api/events
# 503 MODULE_DISABLED
```

## Синхронизация с legacy-полями SiteSettings

При сохранении флагов также обновляются:

- `maintenanceMode` из `maintenance`
- часть legacy boolean-полей (registration/messaging/gallery), если они есть в схеме
