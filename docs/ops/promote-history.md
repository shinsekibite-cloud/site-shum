# История ручных promote (y1 → young)

Каждый успешный/неуспешный ручной запуск `scripts/manual-promote-to-young.sh` добавляет строку ниже.
Автоматические агенты **не** вызывают promote без вашей фразы «одобряю» / `CONFIRM=PROMOTE_YOUNG`.

| UTC | Оператор | Статус | Примечание |
|-----|----------|--------|------------|
| 2026-08-13T13:01:39Z | ubuntu | partial (script grep bug, young still 503) | первый прогон manual-promote; бэкап ok, nginx не переключён |
| 2026-08-13T13:10:00Z | ubuntu | ok | young включён: nginx → :3000, NEXTAUTH_URL=https://young.idivles.ru; y1 пока на том же стеке |
| 2026-08-13T15:55:21Z | ubuntu | ok (exit 0) | manual promote |
| 2026-08-14T10:21:31Z | ubuntu | ok (exit 0) | y1 approved: collectibles/eco storm hang fix (SW v21), auth/eco/games prior y1 fixes |
| 2026-08-15T02:58:16Z | ubuntu | ok (exit 0) | одобряю: профиль портфолио, окна настроек, рекорды в карточках игр, юр. тексты 1.5.1 |
| 2026-08-15T03:41:07Z | ubuntu | ok (exit 0) | одобряю после аудита: 1.5.2 портфолио/рамка/окна/гости |
| 2026-08-17T21:00:12Z | ubuntu | failed (exit 1) | static ISR public routes (cursor/static-routes-16b2) |
| 2026-08-17T21:07:00Z | ubuntu | ok (exit 0) | static ISR public routes (cursor/static-routes-16b2) |
| 2026-08-17T21:11:20Z | ubuntu | ok (exit 0) | static ISR public routes (retry after promote fix) |
