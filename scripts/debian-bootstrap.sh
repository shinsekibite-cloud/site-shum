#!/usr/bin/env bash
# Quick deploy YoungPortal on a fresh Debian 12+ server.
# Usage (as root):
#   curl -fsSL ... | bash   OR
#   sudo bash scripts/debian-bootstrap.sh /opt/youngportal
set -euo pipefail

APP_DIR="${1:-/opt/youngportal}"
DOMAIN="${DOMAIN:-young.example.ru}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"

export DEBIAN_FRONTEND=noninteractive

echo "==> System packages"
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git ufw openssl

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Install Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi

COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [[ ! -f docker-compose.yml ]]; then
  echo "ERROR: unpack the YoungPortal archive into $APP_DIR first (need docker-compose.yml)."
  echo "Example: tar -xzf youngportal-backup-*.tgz -C $APP_DIR --strip-components=1"
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "==> Creating .env"
  NEXTAUTH_SECRET="$(openssl rand -hex 32)"
  POSTGRES_PASSWORD="$(openssl rand -hex 16)"
  REDIS_PASSWORD="$(openssl rand -hex 16)"
  VAPID_PUBLIC=""
  VAPID_PRIVATE=""
  if command -v node >/dev/null 2>&1; then
    VAPID_JSON="$(node -e "try{console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))}catch(e){}" 2>/dev/null || true)"
    if [[ -n "$VAPID_JSON" ]]; then
      VAPID_PUBLIC="$(node -e "const k=JSON.parse(process.argv[1]); process.stdout.write(k.publicKey||'')" "$VAPID_JSON")"
      VAPID_PRIVATE="$(node -e "const k=JSON.parse(process.argv[1]); process.stdout.write(k.privateKey||'')" "$VAPID_JSON")"
    fi
  fi
  cat > .env <<EOF
POSTGRES_USER=sochi
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=sochi_portal
DATABASE_URL=postgresql://sochi:${POSTGRES_PASSWORD}@db:5432/sochi_portal?schema=public
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
NEXTAUTH_URL=https://${DOMAIN}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
UPLOAD_DIR=/app/uploads
NODE_ENV=production
VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_SUBJECT=mailto:noreply@${DOMAIN}
EOF
  chmod 600 .env
  echo "Wrote $APP_DIR/.env — edit NEXTAUTH_URL / SMTP before go-live."
fi

mkdir -p uploads data backups
chmod 755 uploads

echo "==> Firewall (22, 80, 443)"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo "==> Starting stack"
$COMPOSE pull || true
$COMPOSE up -d --build

echo "==> Waiting for web health"
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "Web is up."
    break
  fi
  sleep 3
done

echo "==> Prisma schema push"
$COMPOSE exec -T web npx prisma db push --accept-data-loss || true

cat <<MSG

============================================================
YoungPortal bootstrap finished.

App dir:   $APP_DIR
Domain:    $DOMAIN
Health:    curl -s http://127.0.0.1:3000/api/health

Next steps:
  1. Point DNS A-record of $DOMAIN to this server
  2. Install nginx + certbot (see deploy/nginx-sochi-portal.conf)
  3. Edit $APP_DIR/.env (SMTP, public URL)
  4. Restart:  cd $APP_DIR && $COMPOSE up -d
  5. Backup:   ./scripts/backup-postgres.sh

RKN / legal: fill /admin/rkn and SiteSettings operator fields.
============================================================
MSG
