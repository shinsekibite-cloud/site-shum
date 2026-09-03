#!/usr/bin/env bash
# Snapshot that matches the LIVE site (not just stale host src).
# Includes: DB dump, uploads, prebuilt bundle (if present), docker image, host tree.
# Usage: bash scripts/snapshot-live-site.sh
set -euo pipefail
APP="${APP_DIR:-/opt/sochi-portal}"
D="${BACKUP_DIR:-/var/backups/sochi-portal}"
STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
STAGE="$D/live-snap-${STAMP}"
mkdir -p "$STAGE" "$D"

# Compose v2 names use hyphens (sochi-portal-db-1); older scripts used underscores.
resolve_db_container() {
  local c
  for c in sochi-portal-db-1 sochi-portal_db_1; do
    if docker inspect "$c" >/dev/null 2>&1; then
      echo "$c"
      return 0
    fi
  done
  # Last resort: any running postgres from this stack
  c="$(docker ps --format '{{.Names}}' | grep -E 'sochi-portal.*db' | head -1 || true)"
  [[ -n "$c" ]] || return 1
  echo "$c"
}

resolve_web_image() {
  if docker image inspect sochi-portal_web:latest >/dev/null 2>&1; then
    echo sochi-portal_web:latest
    return 0
  fi
  if docker image inspect sochi-portal-web:latest >/dev/null 2>&1; then
    echo sochi-portal-web:latest
    return 0
  fi
  local c img
  for c in sochi-portal-web-1 sochi-portal_web_1; do
    if docker inspect "$c" >/dev/null 2>&1; then
      img="$(docker inspect "$c" --format '{{.Image}}')"
      echo "$img"
      return 0
    fi
  done
  return 1
}

echo "[1/5] DB dump…"
DB_CTR="$(resolve_db_container)" || {
  echo "ERROR: postgres container not found (expected sochi-portal-db-1)" >&2
  exit 1
}
echo "    using $DB_CTR"
docker exec "$DB_CTR" pg_dump -U sochi -Fc sochi_portal > "$STAGE/db.dump"

echo "[2/5] Uploads…"
if [[ -d "$APP/public/uploads" ]]; then
  tar -czf "$STAGE/uploads.tgz" -C "$APP/public" uploads
fi

echo "[3/5] Prebuilt bundle (exact deploy artifact)…"
if [[ -f "$APP/backup-deploy/out/youngportal-prebuilt-latest.tgz" ]]; then
  cp -f "$APP/backup-deploy/out/youngportal-prebuilt-latest.tgz" "$STAGE/youngportal-prebuilt.tgz"
fi

echo "[4/5] Docker web image…"
if WEB_IMG="$(resolve_web_image)"; then
  echo "    saving $WEB_IMG"
  docker save "$WEB_IMG" | gzip -c > "$STAGE/sochi-portal_web-image.tar.gz"
else
  echo "WARN: no prod web image to save — skip"
fi

echo "[5/5] Host app tree (src/scripts/compose; no node_modules/.next/data)…"
tar -czf "$STAGE/host-app.tgz" -C /opt \
  --exclude='sochi-portal/node_modules' \
  --exclude='sochi-portal/.next' \
  --exclude='sochi-portal/data/postgres' \
  --exclude='sochi-portal/public/uploads' \
  sochi-portal

cat > "$STAGE/MANIFEST.txt" <<EOF
YoungPortal LIVE snapshot ${STAMP}
=================================
Created on the VPS to match what Docker actually serves (domain may be ty/py).

Contents:
  db.dump                      — Postgres custom-format dump (pg_restore)
  uploads.tgz                  — public/uploads
  youngportal-prebuilt.tgz     — exact prebuilt deploy bundle (if available)
  sochi-portal_web-image.tar.gz — docker prod web image
  host-app.tgz                 — /opt/sochi-portal without node_modules/.next/uploads/db

Restore sketch:
  1) docker load < sochi-portal_web-image.tar.gz
  2) pg_restore -U sochi -d sochi_portal --clean --if-exists db.dump
  3) tar -xzf uploads.tgz -C /opt/sochi-portal/public
  4) docker compose up -d
EOF

ARCHIVE="$D/live-${STAMP}.tar.gz"
tar -czf "$ARCHIVE" -C "$D" "live-snap-${STAMP}"
sha256sum "$ARCHIVE" > "$D/live-${STAMP}.sha256"
# keep last 5 live snapshots
ls -1t "$D"/live-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
ls -1t "$D"/live-*.sha256 2>/dev/null | tail -n +6 | xargs -r rm -f
rm -rf "$STAGE"
ln -sfn "$ARCHIVE" "$D/live-latest.tar.gz"
echo "LIVE snapshot done: $ARCHIVE"
ls -lh "$ARCHIVE"
