#!/usr/bin/env bash
# Assign default cover images to news rows that have no imageUrl.
# Safe to re-run. Uses files under public/media/news (deployed with the app).
set -euo pipefail
echo "Patching News.imageUrl defaults…"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE "News"
SET "imageUrl" = '/media/news/news-portal-launch.jpg',
    "updatedAt" = NOW()
WHERE id = 'news_1' AND (COALESCE("imageUrl", '') = '');

UPDATE "News"
SET "imageUrl" = '/media/news/news-clubs-recruit.jpg',
    "updatedAt" = NOW()
WHERE id = 'news_2' AND (COALESCE("imageUrl", '') = '');

UPDATE "News"
SET "imageUrl" = '/media/news/news-default.jpg',
    "updatedAt" = NOW()
WHERE (COALESCE("imageUrl", '') = '')
  AND id NOT IN ('news_1', 'news_2');

SELECT id, title, left("imageUrl", 60) AS img FROM "News" ORDER BY "createdAt" DESC LIMIT 10;
SQL
