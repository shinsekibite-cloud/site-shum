#!/usr/bin/env bash
# Deploy current git tree to STAGING (ty.idivles.ru) for testing.
# Does NOT touch py.idivles.ru production promotion.
#
# Usage:
#   bash scripts/workflow-deploy-staging.sh
#   HOST=root@77.110.125.241 PORT=22 bash scripts/workflow-deploy-staging.sh
#
# Env:
#   STAGING_APP_DIR  default /opt/sochi-portal-staging if exists, else /opt/sochi-portal
#   STAGING_DOMAIN   default ty.idivles.ru
#   SKIP_BUILD=1     sync only, no docker rebuild
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/vps.sh"
STAGING_DOMAIN="${STAGING_DOMAIN:-ty.idivles.ru}"
ARCHIVE="/tmp/yp-staging-$(date +%Y%m%d%H%M%S).tgz"

yp_init_ssh

echo "==> [staging] package $ROOT_DIR"
tar -czf "$ARCHIVE" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.next \
  --exclude='*.zip' \
  --exclude=data \
  --exclude=artifacts \
  --exclude=prisma/dev.db \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='qa-screenshots-*' \
  -C "$ROOT_DIR" .

echo "==> [staging] upload"
# Prefer /var/tmp: /tmp is often a small tmpfs on 2GB VPS
REMOTE_TGZ="/var/tmp/yp-staging-deploy.tgz"
yp_scp "$ARCHIVE" "$HOST:$REMOTE_TGZ"

echo "==> [staging] sync + rebuild on VPS"
EXPECTED_VER="$(python3 -c "import json; print(json.load(open('$ROOT_DIR/package.json'))['version'])")"
REMOTE_SCRIPT="/tmp/yp-staging-remote-$$.sh"
cat > "$REMOTE_SCRIPT" <<REMOTE
set -euo pipefail
SKIP_BUILD="${SKIP_BUILD:-0}"
STAGING_DOMAIN="${STAGING_DOMAIN}"

# Prefer dedicated staging web if it is actually running on :3001.
# Names: sochi-staging-web-1, sochi-staging_web_*, sochi-portal-staging_web_*
if [[ -d /opt/sochi-portal-staging ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -Eq 'sochi-portal-staging[-_]web|sochi-staging[-_]web'; then
  APP=/opt/sochi-portal-staging
  MODE=dual
else
  APP=/opt/sochi-portal
  MODE=shared
fi
echo "APP=\$APP MODE=\$MODE"

mkdir -p /tmp/yp-staging-extract
rm -rf /tmp/yp-staging-extract/*
REMOTE_TGZ="/var/tmp/yp-staging-deploy.tgz"
if [[ ! -f "\$REMOTE_TGZ" ]]; then
  REMOTE_TGZ="/tmp/yp-staging-deploy.tgz"
fi
tar -xzf "\$REMOTE_TGZ" -C /tmp/yp-staging-extract
rm -f "\$REMOTE_TGZ"
command -v rsync >/dev/null || { apt-get update -qq && apt-get install -y -qq rsync; }

rsync -a --delete \
  --exclude data/ \
  --exclude public/uploads/ \
  --exclude public/backups/ \
  --exclude .env \
  --exclude node_modules/ \
  --exclude .next/ \
  /tmp/yp-staging-extract/ "\$APP/"

cd "\$APP"
bash scripts/ensure-russian-ca.sh "\$APP/certs" || echo "WARN: russian CA not installed"

if [[ ! -f .env ]]; then
  echo "ERROR: missing \$APP/.env — copy from prod or create from .env.example" >&2
  exit 1
fi

# Point auth URL at staging domain (do not touch prod tree's .env when dual)
if grep -q '^NEXTAUTH_URL=' .env; then
  sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://\${STAGING_DOMAIN}|" .env
else
  echo "NEXTAUTH_URL=https://\${STAGING_DOMAIN}" >> .env
fi

if [[ "\$SKIP_BUILD" == "1" ]]; then
  echo "SKIP_BUILD=1 — sync only"
else
  yp_compose() {
    if command -v docker-compose >/dev/null 2>&1; then docker-compose "\$@"; else docker compose "\$@"; fi
  }
  if [[ "\$MODE" == "dual" ]]; then
    if [[ -f docker-compose.staging.yml ]]; then
      # Existing dual stack was created as project "sochi-staging"
      COMPOSE_PROJECT_NAME="\${COMPOSE_PROJECT_NAME:-sochi-staging}"
      export COMPOSE_PROJECT_NAME
      yp_compose -f docker-compose.staging.yml up -d --build web
      yp_compose -f docker-compose.staging.yml exec -T web npx prisma db push --accept-data-loss || echo "WARN: prisma db push failed"
    else
      if grep -q "3001:3000" docker-compose.yml 2>/dev/null; then
        yp_compose up -d --build web
      else
        bash scripts/safe-rebuild-web.sh
      fi
    fi
  else
    bash scripts/safe-rebuild-web.sh
  fi
fi

sleep 5
echo "==> health localhost"
curl -sS --max-time 20 http://127.0.0.1:3000/api/health || true
echo
if curl -sS --max-time 5 http://127.0.0.1:3001/api/health >/tmp/yp-stg-h.json 2>/dev/null; then
  echo "staging :3001 => \$(cat /tmp/yp-stg-h.json)"
fi
echo "==> public https://\${STAGING_DOMAIN}/api/health"
curl -sS --max-time 25 "https://\${STAGING_DOMAIN}/api/health" || true
echo
# Guest crawlers should not see x-yp-env: staging
if grep -Rql 'X-YP-Env "staging"' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null; then
  echo "==> strip X-YP-Env staging from live nginx"
  grep -Rl 'X-YP-Env "staging"' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | while read -r f; do
    sed -i 's/add_header X-YP-Env "staging" always;/# X-YP-Env staging removed/' "\$f" || true
  done
  nginx -t && systemctl reload nginx || echo "WARN: nginx reload skipped"
fi
echo "STAGING_READY domain=\${STAGING_DOMAIN} app=\$APP mode=\$MODE"
REMOTE
# Fail hard: do not retry empty stdin (heredoc consumed). Upload script once, run once with retries on SSH only.
yp_scp "$REMOTE_SCRIPT" "$HOST:/var/tmp/yp-staging-remote.sh"
rm -f "$REMOTE_SCRIPT"
yp_ssh "bash /var/tmp/yp-staging-remote.sh; ec=\$?; rm -f /var/tmp/yp-staging-remote.sh; exit \$ec"

rm -f "$ARCHIVE"

# Verify public health reports the package version we just shipped (skip on sync-only).
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> verify public version == $EXPECTED_VER"
  ok=0
  for i in 1 2 3 4 5; do
    body="$(curl -fsS --max-time 25 "https://${STAGING_DOMAIN}/api/health" || true)"
    echo "  try $i: $body"
    if echo "$body" | grep -q "\"version\":\"${EXPECTED_VER}\""; then
      ok=1
      break
    fi
    sleep 3
  done
  if [[ "$ok" != "1" ]]; then
    echo "ERROR: staging health version mismatch (expected $EXPECTED_VER). Deploy NOT confirmed." >&2
    exit 1
  fi
fi

echo "==> done. Test https://${STAGING_DOMAIN}/ — wait for human approval before promote."
