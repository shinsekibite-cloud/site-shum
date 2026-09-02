# Исправления применены — 2026-08-02

## P0 выполнено

1. **Middleware активен**
   - `src/proxy.ts` скопирован в `src/middleware.ts`
   - Docker-образ пересобран
   - Проверка: `/admin` и `/dashboard` без сессии → **307** на `/login?callbackUrl=...`

2. **Бронирование**
   - Валидация дат (start < end, не в прошлом)
   - Глобальный конфликт PENDING/APPROVED на сервере
   - Клиентский календарь тоже учитывает PENDING

3. **PWA (базовый уровень)**
   - `/manifest.webmanifest`
   - `/sw.js` (shell cache)
   - `/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
   - metadata в layout: themeColor, appleWebApp, icons
   - регистрация SW в layout
   - safe-area CSS для iOS

4. **Инфра**
   - NEXTAUTH_URL=https://young.idivles.ru
   - Контейнер пересоздан на новом образе

## Ещё не сделано (нужно вручную)

- **SMTP** — настроить в /admin/settings (иначе регистрация не завершается письмом)
- Контент: проекты/клубы/пространства (после очистки демо пусто)
- Более продвинутый offline cache / update SW strategy
- Сменить дефолтный NEXTAUTH_SECRET при желании

## Проверки

- https://young.idivles.ru → 200
- https://young.idivles.ru/manifest.webmanifest → 200
- https://young.idivles.ru/sw.js → 200
- https://young.idivles.ru/admin → 307 → login
- https://young.idivles.ru/dashboard → 307 → login

## Админ

- Email: admin@sochi.ru
- Пароль: только в менеджере паролей / на VPS (не хранить в git)
