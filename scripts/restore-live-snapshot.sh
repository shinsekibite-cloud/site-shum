#!/usr/bin/env bash
# Restore YoungPortal from a LIVE snapshot archive produced by snapshot-live-site.sh.
# Run ON the VPS as root.
#
# Usage:
#   bash scripts/restore-live-snapshot.sh [/var/backups/sochi-portal/live-latest.tar.gz]
#   DOMAIN=y1.idivles.ru bash scripts/restore-live-snapshot.sh
#
# Steps: extract → docker load → uploads → pg_restore → optional NEXTAUTH_URL → compose up
set -euo pipefail

APP="${APP_DIR:-/opt/sochi-portal}"
ARCHIVE="${1:-/var/backups/sochi-portal/live-latest.tar.gz}"
DOMAIN="${DOMAIN:-y1.idivles.ru}"
STAGE="${RESTORE_STAGE:-/tmp/yp-live-restore-$$}"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Missing archive: $ARCHIVE" >&2
  exit 1
fi
if [[ ! -d "$APP" ]]; then
  echo "Missing APP_DIR: $APP" >&2
  exit 1
fi

echo "==> Restore from $ARCHIVE"
echo "    APP=$APP  DOMAIN=$DOMAIN"
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"
SNAP_DIR="$(find "$STAGE" -maxdepth 1 -type d -name 'live-snap-*' | head -1)"
if [[ -z "$SNAP_DIR" || ! -d "$SNAP_DIR" ]]; then
  echo "Archive has no live-snap-* directory" >&2
  exit 1
fi
echo "    snap: $SNAP_DIR"
ls -lh "$SNAP_DIR"

cd "$APP"
echo "[1/6] Stop web…"
docker-compose stop web >/dev/null 2>&1 || true
docker ps -aq --filter name=sochi-portal_web | xargs -r docker rm -f >/dev/null 2>&1 || true

echo "[2/6] Load docker image…"
if [[ -f "$SNAP_DIR/sochi-portal_web-image.tar.gz" ]]; then
  gunzip -c "$SNAP_DIR/sochi-portal_web-image.tar.gz" | docker load
else
  echo "WARN: no docker image in snapshot — keeping current sochi-portal_web:latest"
fi

echo "[3/6] Restore uploads…"
if [[ -f "$SNAP_DIR/uploads.tgz" ]]; then
  mkdir -p "$APP/public"
  tar -xzf "$SNAP_DIR/uploads.tgz" -C "$APP/public"
fi

echo "[4/6] Sync host tree from snapshot (preserve .env / data / uploads)…"
if [[ -f "$SNAP_DIR/host-app.tgz" ]]; then
  TMP_HOST="$STAGE/host-extract"
  mkdir -p "$TMP_HOST"
  tar -xzf "$SNAP_DIR/host-app.tgz" -C "$TMP_HOST"
  rsync -a \
    --exclude data/ \
    --exclude public/uploads/ \
    --exclude public/backups/ \
    --exclude .env \
    --exclude node_modules/ \
    --exclude .next/ \
    "$TMP_HOST/sochi-portal/" "$APP/"
fi

echo "[5/6] Restore Postgres…"
# ensure db is up
docker-compose up -d db redis >/dev/null 2>&1 || true
sleep 3
if [[ -f "$SNAP_DIR/db.dump" ]]; then
  # drop connections then restore cleanly into sochi_portal
  docker exec sochi-portal_db_1 psql -U sochi -d postgres -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='sochi_portal' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  docker exec -i sochi-portal_db_1 pg_restore -U sochi -d sochi_portal --clean --if-exists --no-owner \
    < "$SNAP_DIR/db.dump" || true
fi

echo "[6/6] Point app URL at $DOMAIN and start web…"
if [[ -f "$APP/.env" ]]; then
  if grep -q '^NEXTAUTH_URL=' "$APP/.env"; then
    sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|" "$APP/.env"
  else
    echo "NEXTAUTH_URL=https://${DOMAIN}" >> "$APP/.env"
  fi
fi
# compose default also
if grep -q 'NEXTAUTH_URL' "$APP/docker-compose.yml" 2>/dev/null; then
  sed -i "s|NEXTAUTH_URL=\${NEXTAUTH_URL:-https://[^}]*}|NEXTAUTH_URL=\${NEXTAUTH_URL:-https://${DOMAIN}}|" \
    "$APP/docker-compose.yml" || true
fi

docker-compose up -d --no-build web
sleep 12
curl -sS --max-time 20 http://127.0.0.1:3000/api/health || true
echo
echo "Restore complete. Next: install nginx for ${DOMAIN} (deploy/nginx-y1-idivles.conf) and issue TLS if needed."
rm -rf "$STAGE"
