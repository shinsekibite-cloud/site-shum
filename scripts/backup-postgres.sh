#!/usr/bin/env bash
# Backup PostgreSQL + uploads on the VPS, optional off-host copy.
# Usage on VPS: /opt/sochi-portal/scripts/backup-postgres.sh
# Remote: SSHPASS=... ./scripts/backup-postgres.sh remote
# Off-host (scp): BACKUP_REMOTE='user@host:/path' ./scripts/backup-postgres.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/sochi-portal}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
COMPOSE_DIR="${COMPOSE_DIR:-$APP_DIR}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_CONTAINER="${DB_CONTAINER:-}"

if [[ "${1:-}" == "remote" ]]; then
  HOST="${2:-root@176.124.204.53}"
  PORT="${3:-4488}"
  if [[ -z "${SSHPASS:-}" ]]; then
    echo "Set SSHPASS for remote backup"
    exit 1
  fi
  sshpass -e ssh -o StrictHostKeyChecking=accept-new -p "$PORT" "$HOST" \
    "APP_DIR=$APP_DIR BACKUP_ROOT=$BACKUP_ROOT KEEP_DAYS=$KEEP_DAYS BACKUP_REMOTE='$BACKUP_REMOTE' bash $APP_DIR/scripts/backup-postgres.sh"
  exit 0
fi

mkdir -p "$BACKUP_ROOT"
DEST="$BACKUP_ROOT/backup-$STAMP"
mkdir -p "$DEST"

cd "$COMPOSE_DIR"

# Resolve DB container
if [[ -z "$DB_CONTAINER" ]]; then
  DB_CONTAINER="$(docker-compose ps -q "$DB_SERVICE" 2>/dev/null || true)"
fi
if [[ -z "$DB_CONTAINER" ]]; then
  DB_CONTAINER="$(docker ps --filter name=sochi-portal_db --format '{{.ID}}' | head -1 || true)"
fi

if [[ -n "$DB_CONTAINER" ]]; then
  # Load credentials from .env without sourcing secrets into the shell history heavily
  POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo sochi)"
  POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo sochi_portal)"
  POSTGRES_USER="${POSTGRES_USER:-sochi}"
  POSTGRES_DB="${POSTGRES_DB:-sochi_portal}"

  echo "Dumping PostgreSQL ($POSTGRES_DB) from $DB_CONTAINER ..."
  docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
    > "$DEST/sochi_portal.sql"
  # Smoke: dump must contain CREATE TABLE
  if ! grep -q 'CREATE TABLE' "$DEST/sochi_portal.sql"; then
    echo "WARNING: pg_dump looks empty/invalid"
  else
    echo "pg_dump: ok ($(wc -c < "$DEST/sochi_portal.sql") bytes)"
    grep -c 'CREATE TABLE' "$DEST/sochi_portal.sql" > "$DEST/restore-smoke.txt" || true
  fi
else
  echo "WARNING: PostgreSQL container not found — skipping DB dump"
fi

# Keep last SQLite snapshot if still present (pre-migration safety)
if [[ -f "$APP_DIR/data/dev.db" ]]; then
  cp -a "$APP_DIR/data/dev.db" "$DEST/dev.db.sqlite-legacy" || true
fi

if [[ -d "$APP_DIR/public/uploads" ]]; then
  tar -czf "$DEST/uploads.tgz" -C "$APP_DIR/public" uploads || true
fi

if [[ "${BACKUP_INCLUDE_ENV:-0}" == "1" && -f "$APP_DIR/.env" ]]; then
  cp -a "$APP_DIR/.env" "$DEST/env.backup" || true
  chmod 600 "$DEST/env.backup" || true
fi

ARCHIVE="$BACKUP_ROOT/sochi-portal-$STAMP.tgz"
tar -czf "$ARCHIVE" -C "$BACKUP_ROOT" "backup-$STAMP"
rm -rf "$DEST"

tar -tzf "$ARCHIVE" >/dev/null
echo "Backup ready: $ARCHIVE"
ls -lh "$ARCHIVE"

if [[ -n "$BACKUP_REMOTE" ]]; then
  echo "Copying to BACKUP_REMOTE=$BACKUP_REMOTE ..."
  if command -v rsync >/dev/null 2>&1; then
    rsync -av "$ARCHIVE" "$BACKUP_REMOTE/" || scp -p "$ARCHIVE" "$BACKUP_REMOTE/" || true
  else
    scp -p "$ARCHIVE" "$BACKUP_REMOTE/" || true
  fi
fi

find "$BACKUP_ROOT" -type f -name 'sochi-portal-*.tgz' -mtime +"$KEEP_DAYS" -delete || true
