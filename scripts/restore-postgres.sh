#!/usr/bin/env bash
# Restore YoungPortal from a sochi-portal-*.tgz produced by backup-postgres.sh.
#
# Usage (on VPS):
#   ./scripts/restore-postgres.sh /var/backups/sochi-portal/sochi-portal-YYYYMMDD-HHMMSS.tgz
#   SKIP_UPLOADS=1 ./scripts/restore-postgres.sh ./sochi-portal-….tgz   # DB only
#   DRY_RUN=1 ./scripts/restore-postgres.sh ./sochi-portal-….tgz
#
# Safety:
#   - Stops web before restore (keeps db up)
#   - Takes a pre-restore backup of current DB+uploads
#   - Does NOT overwrite .env (use env.backup manually after review)
#   - Does NOT run seed/VK scripts
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/sochi-portal}"
COMPOSE_DIR="${COMPOSE_DIR:-$APP_DIR}"
DB_SERVICE="${DB_SERVICE:-db}"
WEB_SERVICE="${WEB_SERVICE:-web}"
ARCHIVE="${1:-}"
DRY_RUN="${DRY_RUN:-0}"
SKIP_UPLOADS="${SKIP_UPLOADS:-0}"
SKIP_PRE_BACKUP="${SKIP_PRE_BACKUP:-0}"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 /path/to/sochi-portal-YYYYMMDD-HHMMSS.tgz"
  exit 1
fi

ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
WORKDIR="$(mktemp -d /tmp/yp-restore-XXXXXX)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "[1/7] Verifying archive: $ARCHIVE"
tar -tzf "$ARCHIVE" >/dev/null
tar -xzf "$ARCHIVE" -C "$WORKDIR"
INNER="$(find "$WORKDIR" -maxdepth 1 -type d -name 'backup-*' | head -1)"
if [[ -z "$INNER" ]]; then
  echo "ERROR: archive has no backup-* directory"
  exit 1
fi
SQL="$INNER/sochi_portal.sql"
UPLOADS_TGZ="$INNER/uploads.tgz"
if [[ ! -f "$SQL" ]]; then
  echo "ERROR: sochi_portal.sql missing inside archive"
  exit 1
fi
if ! grep -q 'CREATE TABLE' "$SQL"; then
  echo "ERROR: SQL dump looks empty (no CREATE TABLE)"
  exit 1
fi
echo "  SQL: $(wc -c < "$SQL") bytes, CREATE TABLE count=$(grep -c 'CREATE TABLE' "$SQL" || true)"
if [[ -f "$UPLOADS_TGZ" ]]; then
  echo "  uploads.tgz: $(wc -c < "$UPLOADS_TGZ") bytes"
else
  echo "  WARNING: uploads.tgz missing"
fi
if [[ -f "$INNER/env.backup" ]]; then
  echo "  NOTE: env.backup present — will NOT auto-apply (review manually)"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — stopping after verification"
  exit 0
fi

cd "$COMPOSE_DIR"

POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo sochi)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo sochi_portal)"
POSTGRES_USER="${POSTGRES_USER:-sochi}"
POSTGRES_DB="${POSTGRES_DB:-sochi_portal}"

DB_CONTAINER="$(docker-compose ps -q "$DB_SERVICE" 2>/dev/null || true)"
if [[ -z "$DB_CONTAINER" ]]; then
  DB_CONTAINER="$(docker ps --filter name=sochi-portal_db --format '{{.ID}}' | head -1 || true)"
fi
if [[ -z "$DB_CONTAINER" ]]; then
  echo "ERROR: PostgreSQL container not running"
  exit 1
fi

if [[ "$SKIP_PRE_BACKUP" != "1" ]]; then
  echo "[2/7] Pre-restore safety backup ..."
  bash "$APP_DIR/scripts/backup-postgres.sh" || {
    echo "ERROR: pre-restore backup failed — aborting"
    exit 1
  }
else
  echo "[2/7] Skipping pre-restore backup (SKIP_PRE_BACKUP=1)"
fi

echo "[3/7] Stopping web (DB stays up) ..."
docker-compose stop "$WEB_SERVICE" || true

echo "[4/7] Restoring PostgreSQL ($POSTGRES_DB) ..."
# Terminate other sessions so --clean DROP can proceed
docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" \
  >/dev/null || true
docker exec -i "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$SQL"
echo "  SQL restore: ok"

echo "[5/7] Restoring uploads ..."
if [[ "$SKIP_UPLOADS" == "1" ]]; then
  echo "  SKIP_UPLOADS=1 — left current public/uploads as-is"
elif [[ -f "$UPLOADS_TGZ" ]]; then
  mkdir -p "$APP_DIR/public"
  # Replace uploads tree atomically-ish
  STAGE="$APP_DIR/public/uploads.restore-$$"
  rm -rf "$STAGE"
  mkdir -p "$STAGE"
  tar -xzf "$UPLOADS_TGZ" -C "$STAGE"
  if [[ -d "$STAGE/uploads" ]]; then
    rm -rf "$APP_DIR/public/uploads.bak" || true
    if [[ -d "$APP_DIR/public/uploads" ]]; then
      mv "$APP_DIR/public/uploads" "$APP_DIR/public/uploads.bak"
    fi
    mv "$STAGE/uploads" "$APP_DIR/public/uploads"
    rm -rf "$STAGE"
    echo "  uploads restored (previous → public/uploads.bak)"
  else
    echo "ERROR: uploads.tgz did not contain uploads/"
    rm -rf "$STAGE"
    exit 1
  fi
else
  echo "  WARNING: no uploads.tgz — media may be missing"
fi

echo "[6/7] Starting web ..."
docker-compose up -d "$WEB_SERVICE"
sleep 3
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo "  health: ok"
    break
  fi
  sleep 2
done

echo "[7/7] Row smoke checks ..."
docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT 'User' AS t, count(*)::text AS n FROM \"User\"
   UNION ALL SELECT 'News', count(*)::text FROM \"News\"
   UNION ALL SELECT 'Booking', count(*)::text FROM \"Booking\"
   UNION ALL SELECT 'GameScore', count(*)::text FROM \"GameScore\";" || true

echo
echo "Restore complete from: $ARCHIVE"
echo "IMPORTANT:"
echo "  - .env was NOT changed (diff env.backup manually if needed)"
echo "  - Do NOT run a full deploy with seed scripts right after restore"
echo "  - Sensitive archives belong under data/private (not public/uploads)"
echo "  - Latest safety backup is under $BACKUP_ROOT"
