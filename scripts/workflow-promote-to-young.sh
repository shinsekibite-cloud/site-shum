#!/usr/bin/env bash
# Promote approved STAGING (y1) → PRODUCTION (py.idivles.ru).
#
# HARD GATE: requires APPROVE=YES
#   APPROVE=YES bash scripts/workflow-promote-to-young.sh
#
# Steps:
#   1) refuse unless APPROVE=YES
#   2) live snapshot backup
#   3) ensure prod tree /opt/sochi-portal has approved code
#   4) first-time: clone staging tree to /opt/sochi-portal-staging (:3001)
#   5) nginx dual (young→:3000, y1→:3001), NEXTAUTH_URL for prod
#   6) smoke young + y1
set -euo pipefail

if [[ "${APPROVE:-}" != "YES" ]]; then
  cat >&2 <<'EOF'
REFUSED: production promote requires explicit approval.

  APPROVE=YES bash scripts/workflow-promote-to-young.sh

Do not run this until the human approved the build on https://ty.idivles.ru
EOF
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/vps.sh"
PROD_DOMAIN="${PROD_DOMAIN:-py.idivles.ru}"
STAGING_DOMAIN="${STAGING_DOMAIN:-ty.idivles.ru}"

yp_init_ssh

echo "==> [promote] APPROVE=YES — packaging approved tree"
# Prefer /var/tmp: /tmp is often a small tmpfs on 2GB VPS (same as staging deploy)
ARCHIVE="/var/tmp/yp-promote-$(date +%Y%m%d%H%M%S).tgz"
tar -czf "$ARCHIVE" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.next \
  --exclude='*.zip' \
  --exclude='*.tgz' \
  --exclude='*.tar.gz' \
  --exclude=data \
  --exclude=artifacts \
  --exclude=prisma/dev.db \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='qa-screenshots-*' \
  -C "$ROOT_DIR" .

REMOTE_TGZ="/var/tmp/yp-promote-deploy.tgz"
yp_scp "$ARCHIVE" "$HOST:$REMOTE_TGZ"
# also ensure dual nginx + staging compose + fixed snapshot helper are on the server
yp_scp \
  "$ROOT_DIR/deploy/nginx-py-ty-dual.conf" \
  "$ROOT_DIR/docker-compose.staging.yml" \
  "$ROOT_DIR/scripts/snapshot-live-site.sh" \
  "$ROOT_DIR/scripts/full-backup.sh" \
  "$HOST:/var/tmp/"

# Write remote steps to a file first — never pipe a heredoc into yp_ssh/yp_retry
# (retries would re-run with empty stdin and falsely exit 0).
REMOTE_SCRIPT="/var/tmp/yp-promote-remote-$(date +%Y%m%d%H%M%S).sh"
cat > "$REMOTE_SCRIPT" <<REMOTE
set -euo pipefail
PROD=/opt/sochi-portal
STAGING=/opt/sochi-portal-staging
PROD_DOMAIN="${PROD_DOMAIN}"
STAGING_DOMAIN="${STAGING_DOMAIN}"
BACKUP_DIR=/var/backups/sochi-portal
REMOTE_TGZ="/var/tmp/yp-promote-deploy.tgz"
EXTRACT=/var/tmp/yp-promote-extract

echo "==> [1/6] Extract approved code (before live backup so helpers are current)"
mkdir -p "\$EXTRACT"
rm -rf "\$EXTRACT"/*
tar -xzf "\$REMOTE_TGZ" -C "\$EXTRACT"
rm -f "\$REMOTE_TGZ"
install -m 0755 /var/tmp/snapshot-live-site.sh "\$PROD/scripts/snapshot-live-site.sh"
install -m 0755 /var/tmp/full-backup.sh "\$PROD/scripts/full-backup.sh"
cp -f /var/tmp/nginx-py-ty-dual.conf "\$PROD/deploy/nginx-py-ty-dual.conf"
cp -f /var/tmp/docker-compose.staging.yml "\$PROD/docker-compose.staging.yml"

echo "==> [2/6] LIVE backup before cutting over"
cd "\$PROD"
APP_DIR="\$PROD" bash scripts/snapshot-live-site.sh
ls -lh "\$BACKUP_DIR"/live-latest.tar.gz
sha256sum "\$BACKUP_DIR"/live-latest.tar.gz || true

echo "==> [3/6] Sync into PROD tree (preserve .env / data / uploads)"
rsync -a --delete \
  --exclude data/ \
  --exclude public/uploads/ \
  --exclude public/backups/ \
  --exclude .env \
  --exclude node_modules/ \
  --exclude .next/ \
  "\$EXTRACT/" "\$PROD/"

# Prod auth URL
if grep -q '^NEXTAUTH_URL=' "\$PROD/.env"; then
  sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://\${PROD_DOMAIN}|" "\$PROD/.env"
else
  echo "NEXTAUTH_URL=https://\${PROD_DOMAIN}" >> "\$PROD/.env"
fi

echo "==> [4/6] Ensure STAGING tree on :3001"
if [[ ! -d "\$STAGING" ]]; then
  mkdir -p "\$STAGING"
  rsync -a \
    --exclude data/postgres \
    --exclude node_modules/ \
    --exclude .next/ \
    "\$PROD/" "\$STAGING/"
  if [[ -f "\$PROD/.env" ]]; then
    cp -a "\$PROD/.env" "\$STAGING/.env"
  fi
fi
rsync -a --delete \
  --exclude data/ \
  --exclude public/uploads/ \
  --exclude public/backups/ \
  --exclude .env \
  --exclude node_modules/ \
  --exclude .next/ \
  "\$EXTRACT/" "\$STAGING/"
rm -rf "\$EXTRACT"

if [[ -f "\$STAGING/.env" ]]; then
  chown root:root "\$STAGING/.env" 2>/dev/null || true
  chmod 640 "\$STAGING/.env" 2>/dev/null || true
  sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://\${STAGING_DOMAIN}|" "\$STAGING/.env" || true
  if grep -qE '^DATABASE_URL=.*@db:' "\$STAGING/.env"; then
    sed -i 's|@db:5432|@sochi-portal-db-1:5432|g' "\$STAGING/.env" || true
  fi
  if grep -qE '^REDIS_URL=.*@redis:' "\$STAGING/.env"; then
    sed -i 's|@redis:|@sochi-portal-redis-1:|g' "\$STAGING/.env" || true
  elif grep -qE '^REDIS_URL=redis://:.*@127.0.0.1' "\$STAGING/.env"; then
    RPW=\$(grep -E '^REDIS_PASSWORD=' "\$STAGING/.env" | head -1 | cut -d= -f2- | tr -d '"')
    if [[ -n "\$RPW" ]]; then
      grep -vE '^REDIS_URL=' "\$STAGING/.env" > "\$STAGING/.env.tmp" || true
      echo "REDIS_URL=redis://:\${RPW}@sochi-portal-redis-1:6379" >> "\$STAGING/.env.tmp"
      mv "\$STAGING/.env.tmp" "\$STAGING/.env"
    fi
  fi
fi
cp -f "\$PROD/docker-compose.staging.yml" "\$STAGING/docker-compose.staging.yml"

echo "==> [5/6] Recreate PROD web on :3000 from approved STAGING image + keep STAGING on :3001"
cd "\$PROD"
yp_compose() {
  if command -v docker-compose >/dev/null 2>&1; then docker-compose "\$@"; else docker compose "\$@"; fi
}
# Prefer staging image tag; also accept hyphenated image names from compose v2.
if docker image inspect sochi-staging_web:latest >/dev/null 2>&1; then
  echo "Retag sochi-staging_web:latest → sochi-portal_web / sochi-portal-web"
  docker tag sochi-staging_web:latest sochi-portal_web:latest
  docker tag sochi-staging_web:latest sochi-portal-web:latest 2>/dev/null || true
elif docker image inspect sochi-staging-web:latest >/dev/null 2>&1; then
  echo "Retag sochi-staging-web:latest → sochi-portal_web / sochi-portal-web"
  docker tag sochi-staging-web:latest sochi-portal_web:latest
  docker tag sochi-staging-web:latest sochi-portal-web:latest 2>/dev/null || true
fi
if ! yp_compose up -d --force-recreate --no-build web; then
  echo "WARN: recreate failed — falling back to safe-rebuild-web.sh"
  bash scripts/safe-rebuild-web.sh
fi
sleep 5
curl -sS --max-time 20 http://127.0.0.1:3000/api/health || true
echo

cd "\$STAGING"
if docker network ls | grep -q sochi-portal_default; then
  yp_compose -p sochi-staging -f docker-compose.staging.yml up -d --no-build web || {
    echo "WARN: staging recreate failed — trying build (may need free RAM)"
    yp_compose -p sochi-staging -f docker-compose.staging.yml up -d --build web || {
      echo "WARN: staging compose build failed — check RAM / network; staging needs :3001"
    }
  }
else
  echo "WARN: docker network sochi-portal_default missing — start prod compose first"
fi

echo "==> [6/6] Nginx dual + reload"
cp -f "\$PROD/deploy/nginx-py-ty-dual.conf" /etc/nginx/sites-available/sochi-portal
ln -sfn /etc/nginx/sites-available/sochi-portal /etc/nginx/sites-enabled/sochi-portal
nginx -t
systemctl reload nginx

sleep 8
echo "==> smoke PROD \${PROD_DOMAIN}"
curl -sS --max-time 25 "https://\${PROD_DOMAIN}/api/health" || true
echo
echo "==> smoke STAGING \${STAGING_DOMAIN}"
curl -sS --max-time 25 "https://\${STAGING_DOMAIN}/api/health" || true
echo
echo "PROMOTE_DONE prod=\${PROD_DOMAIN} staging=\${STAGING_DOMAIN}"
echo "Rollback: DOMAIN=\${PROD_DOMAIN} bash \$PROD/scripts/restore-live-snapshot.sh \$BACKUP_DIR/live-latest.tar.gz"
REMOTE

# Upload remote script as a file so SSH retries do not consume an empty heredoc stdin.
yp_scp "$REMOTE_SCRIPT" "$HOST:/var/tmp/yp-promote-remote.sh"
yp_ssh "bash /var/tmp/yp-promote-remote.sh; rc=\$?; rm -f /var/tmp/yp-promote-remote.sh; exit \$rc"
rm -f "$ARCHIVE" "$REMOTE_SCRIPT"
echo "==> promote finished."
