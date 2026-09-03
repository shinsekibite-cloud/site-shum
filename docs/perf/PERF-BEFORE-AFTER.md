# Производительность: до / после

Базовый замер прод `https://young.idivles.ru` — **до** деплоя оптимизаций (2026-08-11).

## До (baseline)

См. `docs/perf/baseline-before.txt`.

| Путь | TTFB | Total | Размер |
|------|------|-------|--------|
| `/` | ~0.64–0.87 s | ~1.13–1.33 s | ~143 KB |
| `/api/health` | ~0.47–0.50 s | ~0.50 s | 143 B |
| `/projects` | ~0.57 s | ~0.99 s | ~125 KB |
| `/news` | ~0.53 s | ~0.88 s | ~105 KB |
| `/privacy` | ~0.56 s | ~0.98 s | ~111 KB |
| `/rules` | ~0.73 s | ~1.13 s | ~92 KB |
| `/api/public/status` | ~0.50 s | ~0.50 s | ~1 KB |

Среднее по 3 запросам главной (TTFB): ~0.59 / 1.10 / 0.55 s.

## Что оптимизировано в коде

1. Кэш каталога главной `unstable_cache` 30 с (`src/lib/home-catalog.ts`).
2. Prefetch CTA на главной.
3. `Cache-Control` для `/api/public/status` (5/15 s + SWR).
4. Уже существующий in-memory/redis кэш module flags.

## После деплоя

```bash
node scripts/perf-bench.mjs https://young.idivles.ru after
# сравнить с docs/perf/baseline-before.txt
```

Ожидание: повторные запросы главной и status быстрее за счёт кэша (особенно TTFB при тёплом кэше).

Полный бэкап исходников: артефакт `youngportal-full-backup-20260811-072301.tgz`.
