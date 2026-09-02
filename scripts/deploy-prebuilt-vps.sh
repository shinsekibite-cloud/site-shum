#!/usr/bin/env bash
# Deploy prebuilt Next standalone to VPS (avoids OOM during next build).
# Usage: SSHPASS=… ./scripts/deploy-prebuilt-vps.sh [user@host] [port]
set -euo pipefail
HOST="${1:-root@176.124.204.53}"
PORT="${2:-4488}"
APP_DIR="${APP_DIR:-/opt/sochi-portal}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d%H%M%S)"
BUNDLE="/tmp/youngportal-prebuilt-${STAMP}.tgz"

if [[ -z "${SSHPASS:-}" ]]; then
  echo "Set SSHPASS"
  exit 1
fi
if [[ ! -f "$ROOT/.next/standalone/server.js" ]]; then
  echo "Missing .next/standalone — run: npm run build"
  exit 1
fi

SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -p "$PORT" "$HOST")
SCP=(sshpass -e scp -o StrictHostKeyChecking=accept-new -P "$PORT")

echo "[1/3] Packing prebuilt bundle…"
tar -czf "$BUNDLE" \
  -C "$ROOT" \
  Dockerfile.prebuilt \
  docker-compose.yml \
  package.json \
  package-lock.json \
  prisma \
  prisma.config.ts \
  scripts \
  public \
  src \
  .next/standalone \
  .next/static

echo "[2/3] Upload $(du -h "$BUNDLE" | awk '{print $1}')…"
"${SCP[@]}" "$BUNDLE" "$HOST:/tmp/youngportal-prebuilt.tgz"

echo "[3/3] Install + restart web…"
"${SSH[@]}" "bash -s" <<REMOTE
set -euo pipefail
APP="$APP_DIR"
EXTRACT=/tmp/yp-pre-extract
BUILDCTX=/tmp/yp-pre-buildctx
rm -rf "\$EXTRACT" "\$BUILDCTX"
mkdir -p "\$EXTRACT" "\$BUILDCTX"
tar -xzf /tmp/youngportal-prebuilt.tgz -C "\$EXTRACT"
# Sync source + scripts into app dir so host tree matches what runs in Docker
# (nightly full-backup.sh archives /opt/sochi-portal — without this, backups drift).
rsync -a \
  --exclude data/ \
  --exclude public/uploads/ \
  --exclude public/backups/ \
  --exclude .env \
  --exclude node_modules/ \
  --exclude .next/ \
  "\$EXTRACT/" "\$APP/"
# Also keep a copy of the exact prebuilt that was deployed (for restore)
mkdir -p "\$APP/backup-deploy/out"
cp -f /tmp/youngportal-prebuilt.tgz "\$APP/backup-deploy/out/youngportal-prebuilt-latest.tgz"
# Build context WITHOUT .dockerignore (standalone must be visible)
mkdir -p "\$BUILDCTX/.next"
cp "\$EXTRACT/Dockerfile.prebuilt" "\$BUILDCTX/Dockerfile.prebuilt"
cp -a "\$EXTRACT/.next/standalone" "\$BUILDCTX/.next/standalone"
cp -a "\$EXTRACT/.next/static" "\$BUILDCTX/.next/static"
cp -a "\$EXTRACT/public" "\$BUILDCTX/public"
cp -a "\$EXTRACT/prisma" "\$BUILDCTX/prisma"
cp "\$EXTRACT/prisma.config.ts" "\$BUILDCTX/prisma.config.ts"
cp -a "\$EXTRACT/scripts" "\$BUILDCTX/scripts"
cd "\$APP"
docker-compose stop web >/dev/null 2>&1 || true
# Drop stale web containers that may hold :3000 (compose project name drift)
docker ps -aq --filter name=sochi-portal_web | xargs -r docker rm -f >/dev/null 2>&1 || true
docker build -f "\$BUILDCTX/Dockerfile.prebuilt" -t sochi-portal_web "\$BUILDCTX"
docker-compose up -d --no-build web
sleep 10
curl -sS --max-time 20 http://127.0.0.1:3000/api/health || true
echo
curl -sS -m 15 -o /dev/null -w "faq %{http_code}\\n" https://young.idivles.ru/faq || true
curl -sS -m 15 -o /dev/null -w "home %{http_code}\\n" https://young.idivles.ru/ || true
REMOTE

echo "Deploy prebuilt done."
