# Презентация Young Portal

> Автоснимок модулей обновляется командой `npm run presentation:refresh`.

## Онлайн

- Страница: [`/presentation`](https://young.idivles.ru/presentation)
- Слайды: [`/presentation/deck/index.html`](https://young.idivles.ru/presentation/deck/index.html)
- Видео (~1 мин): [`/presentation/deck/tour.mp4`](https://young.idivles.ru/presentation/deck/tour.mp4)
- Скачать: [`/downloads/youngportal-presentation-latest.tgz`](https://young.idivles.ru/downloads/youngportal-presentation-latest.tgz)

## TECH: вкл/выкл

В `/ops` модуль **`presentation`**. OFF → `/presentation` и архив скачивания → `/unavailable`.

## Автообновление

```bash
npm run presentation:refresh
# вместе с QA:
QA_REFRESH_PRESENTATION=1 npm run qa:all
```

Тянет `GET /api/public/status`, пишет `public/presentation/deck/status.json`, обновляет ON/OFF в слайдах, пересобирает `.tgz`. Запускайте после деплоя или смены флагов в Ops.

## QA

```bash
npm run qa:modules   # kill-switch URL
npm run qa:roles     # роли
npm run qa:all       # полный пакет
```

См. также `docs/QA.md`.
