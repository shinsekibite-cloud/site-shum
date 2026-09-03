#!/usr/bin/env bash
# Deploy YoungPortal to VPS over SSH (default port 4488).
# Usage:
#   SSHPASS='your-root-password' ./scripts/deploy-vps.sh
#   ./scripts/deploy-vps.sh user@host 4488
set -euo pipefail

HOST="${1:-root@176.124.204.53}"
PORT="${2:-4488}"
APP_DIR="${APP_DIR:-/opt/sochi-portal}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="/tmp/youngportal-deploy-$(date +%Y%m%d%H%M%S).tgz"

if [[ -z "${SSHPASS:-}" ]]; then
  echo "Set SSHPASS env var with the SSH password, or configure SSH keys."
  exit 1
fi

SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -p "$PORT" "$HOST")
SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new -P "$PORT")

echo "[1/4] Packaging $ROOT_DIR ..."
tar -czf "$ARCHIVE" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.next \
  --exclude='*.zip' \
  --exclude=data \
  --exclude=prisma/dev.db \
  --exclude='.env' \
  --exclude='tsconfig.tsbuildinfo' \
  -C "$ROOT_DIR" .

echo "[2/4] Uploading archive ..."
"${SCP[@]}" "$ARCHIVE" "$HOST:/tmp/youngportal-deploy.tgz"

echo "[3/4] Syncing code (preserving data/, uploads/, .env) and rebuilding ..."
# shellcheck disable=SC2087
"${SSH[@]}" "bash -s" <<REMOTE
set -euo pipefail
APP="$APP_DIR"
mkdir -p /tmp/yp-extract
rm -rf /tmp/yp-extract/*
tar -xzf /tmp/youngportal-deploy.tgz -C /tmp/yp-extract
command -v rsync >/dev/null || { apt-get update && apt-get install -y rsync; }
rsync -a --delete \
  --exclude data/ \
  --exclude public/uploads/ \
  --exclude public/backups/ \
  --exclude .env \
  --exclude node_modules/ \
  --exclude .next/ \
  /tmp/yp-extract/ "\$APP/"
cd "\$APP"

touch .env
if ! grep -qE '^POSTGRES_USER=' .env; then
  echo 'POSTGRES_USER=sochi' >> .env
  echo 'Added POSTGRES_USER'
fi
if ! grep -qE '^POSTGRES_DB=' .env; then
  echo 'POSTGRES_DB=sochi_portal' >> .env
  echo 'Added POSTGRES_DB'
fi
if ! grep -qE '^POSTGRES_PASSWORD=' .env; then
  echo "POSTGRES_PASSWORD=\$(openssl rand -hex 16)" >> .env
  echo 'Generated POSTGRES_PASSWORD'
fi

# Force DATABASE_URL to Postgres service if still sqlite / missing
if grep -qE '^DATABASE_URL=.*file:' .env || ! grep -qE '^DATABASE_URL=' .env; then
  PW=\$(grep -E '^POSTGRES_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '"')
  PG_USER=\$(grep -E '^POSTGRES_USER=' .env | head -1 | cut -d= -f2- | tr -d '"')
  PG_DB=\$(grep -E '^POSTGRES_DB=' .env | head -1 | cut -d= -f2- | tr -d '"')
  grep -vE '^DATABASE_URL=' .env > .env.tmp || true
  echo "DATABASE_URL=postgresql://\${PG_USER}:\${PW}@db:5432/\${PG_DB}?schema=public" >> .env.tmp
  mv .env.tmp .env
  echo 'Updated DATABASE_URL for PostgreSQL'
fi

# Web Push VAPID keys (browser notifications)
if ! grep -qE '^VAPID_PUBLIC_KEY=' .env || ! grep -qE '^VAPID_PRIVATE_KEY=' .env; then
  echo 'Generating VAPID keys for Web Push...'
  KEYS=\$(node -e "const w=require('web-push'); const k=w.generateVAPIDKeys(); process.stdout.write(JSON.stringify(k))" 2>/dev/null || true)
  if [[ -n "\$KEYS" ]]; then
    PUB=\$(node -e "const k=JSON.parse(process.argv[1]); process.stdout.write(k.publicKey)" "\$KEYS")
    PRIV=\$(node -e "const k=JSON.parse(process.argv[1]); process.stdout.write(k.privateKey)" "\$KEYS")
    grep -vE '^VAPID_PUBLIC_KEY=|^VAPID_PRIVATE_KEY=|^VAPID_SUBJECT=' .env > .env.tmp || true
    echo "VAPID_PUBLIC_KEY=\$PUB" >> .env.tmp
    echo "VAPID_PRIVATE_KEY=\$PRIV" >> .env.tmp
    echo "VAPID_SUBJECT=mailto:noreply@young.idivles.ru" >> .env.tmp
    mv .env.tmp .env
    echo 'Added VAPID_* to .env'
  else
    echo 'WARN: web-push not available yet; keys will auto-generate into uploads/.vapid-keys.json on first request'
  fi
fi

chmod +x scripts/backup-postgres.sh scripts/backup-sqlite.sh 2>/dev/null || true
if [[ -n "\$(docker-compose ps -q db 2>/dev/null || true)" ]]; then
  bash scripts/backup-postgres.sh || true
elif [[ -f data/dev.db ]]; then
  bash scripts/backup-sqlite.sh || true
fi

docker-compose up -d db redis </dev/null
echo 'Waiting for Postgres...'
for i in \$(seq 1 60); do
  if docker-compose exec -T db pg_isready </dev/null >/dev/null 2>&1; then
    echo "Postgres ready (\$i)"
    break
  fi
  sleep 2
done
echo 'Waiting for Redis...'
for i in \$(seq 1 30); do
  if docker-compose exec -T redis redis-cli ping </dev/null 2>/dev/null | grep -q PONG; then
    echo "Redis ready (\$i)"
    break
  fi
  sleep 1
done

# Free dangling layers before image build (VPS disk is tight).
# Always divert stdin — docker CLI can consume the SSH heredoc otherwise.
docker image prune -f </dev/null >/dev/null 2>&1 || true
# Drop stopped containers leftover from failed builds
docker container prune -f </dev/null >/dev/null 2>&1 || true

echo 'Building web image...'
# Stop running web during build — VPS ~2Gi RAM OOMs next build otherwise.
docker-compose stop web </dev/null || true
sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
# Older docker-compose rejects --pull=false; omit pull flags for compatibility.
docker-compose build web </dev/null
echo 'Recreating web (keeping db)...'
docker-compose up -d --force-recreate --no-deps web </dev/null

# Drop superseded images after successful recreate
docker image prune -f </dev/null >/dev/null 2>&1 || true
# Keep only last 5 portal backups
find /var/backups/sochi-portal -type f -name 'sochi-portal-*.tgz' 2>/dev/null \
  | sort -r | tail -n +6 | xargs -r rm -f || true

echo 'Deduping application rows...'
docker-compose exec -T web node /app/scripts/dedupe-applications.mjs </dev/null || true

echo 'prisma db push...'
docker-compose exec -T web npx prisma db push --accept-data-loss </dev/null

echo 'Seeding CRM Sochi content from VK scrape…'
docker-compose exec -T web node /app/scripts/seed-from-vk-crm.mjs </dev/null || true

echo 'Seeding CRM projects/spaces/about + repairing news images…'
docker-compose exec -T web node /app/scripts/seed-crm-content.mjs </dev/null || true

echo 'Migrating Cyrillic project ids → latin…'
docker-compose exec -T web node /app/scripts/migrate-cyrillic-project-ids.mjs </dev/null || true

echo 'One-shot VK fill: afisha, FAQ, docs, club schedules, galleries…'
docker-compose exec -T web node /app/scripts/seed-vk-fill.mjs </dev/null || true

echo 'Purging test/junk bookings…'
docker-compose exec -T web node /app/scripts/purge-test-bookings.mjs </dev/null || true

echo 'Installing VK weekday cron (12:00 & 18:00 MSK)…'
bash scripts/install-vk-cron.sh </dev/null || true

echo 'Assigning unique covers…'
docker-compose exec -T web node /app/scripts/generate-unique-covers.mjs --assign </dev/null || true

echo 'Assigning unique PHOTO covers (no SVG duplicates)…'
docker-compose exec -T web node /app/scripts/assign-unique-photo-covers.mjs </dev/null || true

echo 'Generating thematic page/afisha templates…'
docker-compose exec -T web node /app/scripts/generate-theme-templates.mjs </dev/null || true

echo 'Prefer mark-only logo (name is HTML text)…'
docker-compose exec -T db psql -U sochi -d sochi_portal -c \
  "UPDATE \"SiteSettings\" SET \"logoUrl\" = '/brand/logo-mark.png', \"updatedAt\" = NOW() WHERE id = '1' AND (COALESCE(\"logoUrl\", '') = '' OR \"logoUrl\" LIKE '%logo-crm-sochi%' OR \"logoUrl\" = '/brand/logo.png');" \
  </dev/null || true

echo 'Healing club signup URLs from descriptions…'
docker-compose exec -T web node /app/scripts/heal-club-signup-urls.mjs </dev/null || true

echo 'Patching empty / legacy News covers…'
# Clear broken legacy placeholders so photo-assign / VK heal can fill real images
docker-compose exec -T db psql -U sochi -d sochi_portal -c \
  "UPDATE \"News\" SET \"imageUrl\" = NULL, \"updatedAt\" = NOW() WHERE COALESCE(\"imageUrl\", '') = '' OR \"imageUrl\" LIKE '/media/news/%' OR \"imageUrl\" = '/hero-bg.jpg' OR \"imageUrl\" LIKE '%/covers/news-%' OR \"imageUrl\" LIKE '%/section-news%' OR \"imageUrl\" LIKE '%.svg';" \
  </dev/null || true

if [[ -f data/dev.db ]]; then
  echo 'Checking SQLite → PostgreSQL migration...'
  docker-compose exec -T \
    -e SQLITE_PATH=/app/data/dev.db \
    -e BETTER_SQLITE3_PATH=/app/node_modules/better-sqlite3 \
    web node /app/scripts/migrate-sqlite-to-pg.mjs </dev/null || true
fi

for i in \$(seq 1 40); do
  code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health || true)
  echo "health \$i: \$code"
  if [[ "\$code" == "200" ]]; then
    break
  fi
  sleep 2
done
docker-compose ps </dev/null
curl -sS http://127.0.0.1:3000/api/health || true
echo

echo 'Migrate private archives / VAPID off public uploads…'
docker-compose exec -T web node /app/scripts/migrate-private-archives.mjs </dev/null || true

echo 'Heal VK news covers from cached wall snapshot (no API token needed)…'
docker-compose exec -T web node /app/scripts/heal-vk-news-from-cache.mjs </dev/null || true

echo 'Seeding places (Куда сходить)…'
docker-compose exec -T web node /app/scripts/seed-places.mjs </dev/null || true

echo 'Applying nginx rate limits + upload size…'
if [[ -f "\$APP/deploy/nginx-yp-limits.conf" ]]; then
  cp "\$APP/deploy/nginx-yp-limits.conf" /etc/nginx/conf.d/yp-limits.conf
  echo 'installed /etc/nginx/conf.d/yp-limits.conf'
fi
if [[ -f "\$APP/deploy/nginx-sochi-portal.conf" ]]; then
  NGINX_TARGET=""
  if [[ -f /etc/nginx/sites-available/sochi-portal ]]; then
    NGINX_TARGET=/etc/nginx/sites-available/sochi-portal
  elif [[ -f /etc/nginx/conf.d/sochi-portal.conf ]]; then
    NGINX_TARGET=/etc/nginx/conf.d/sochi-portal.conf
  fi
  if [[ -n "\$NGINX_TARGET" ]]; then
    cp "\$APP/deploy/nginx-sochi-portal.conf" "\$NGINX_TARGET"
    if nginx -t </dev/null; then
      systemctl reload nginx </dev/null || true
      echo "nginx reloaded (\$NGINX_TARGET)"
    else
      echo 'nginx -t failed — left previous config; check SSL paths / limit zones'
    fi
  else
    echo 'nginx site file not found — skip'
  fi
fi

# VK sync last — can be slow; must not block seed/nginx
echo 'Re-sync VK wall media (covers + videos)…'
SECRET=\$(docker-compose exec -T web printenv CRON_SECRET 2>/dev/null | tr -d '\r' || true)
if [[ -z "\$SECRET" && -f .env ]]; then
  SECRET=\$(grep -E '^CRON_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '\r' || true)
fi
if [[ -n "\$SECRET" ]]; then
  curl -fsS --max-time 90 "http://127.0.0.1:3000/api/vk-sync?secret=\${SECRET}" || true
  echo
else
  echo 'CRON_SECRET missing — skip vk-sync heal'
fi
REMOTE

echo "[4/4] Public smoke ..."
curl -sS -m 15 -o /dev/null -w "https://young.idivles.ru -> %{http_code}\n" https://young.idivles.ru/
curl -sS -m 15 https://young.idivles.ru/api/health || true
echo
echo "Done."
