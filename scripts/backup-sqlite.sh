#!/usr/bin/env bash
# Backup SQLite DB + uploads on the VPS, verify integrity, optional off-host copy.
# Usage on VPS: /opt/sochi-portal/scripts/backup-sqlite.sh
# Remote: SSHPASS=... ./scripts/backup-sqlite.sh remote
# Off-host (scp): BACKUP_REMOTE='user@host:/path' ./scripts/backup-sqlite.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/sochi-portal}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

if [[ "${1:-}" == "remote" ]]; then
  HOST="${2:-root@176.124.204.53}"
  PORT="${3:-4488}"
  if [[ -z "${SSHPASS:-}" ]]; then
    echo "Set SSHPASS for remote backup"
    exit 1
  fi
  sshpass -e ssh -o StrictHostKeyChecking=accept-new -p "$PORT" "$HOST" \
    "APP_DIR=$APP_DIR BACKUP_ROOT=$BACKUP_ROOT KEEP_DAYS=$KEEP_DAYS BACKUP_REMOTE='$BACKUP_REMOTE' bash $APP_DIR/scripts/backup-sqlite.sh"
  exit 0
fi

mkdir -p "$BACKUP_ROOT"
DEST="$BACKUP_ROOT/backup-$STAMP"
mkdir -p "$DEST"

DB_SRC=""
if [[ -f "$APP_DIR/data/dev.db" ]]; then
  DB_SRC="$APP_DIR/data/dev.db"
elif [[ -f "$APP_DIR/prisma/dev.db" ]]; then
  DB_SRC="$APP_DIR/prisma/dev.db"
fi

if [[ -n "$DB_SRC" ]]; then
  cp -a "$DB_SRC" "$DEST/dev.db"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_SRC" ".backup '$DEST/dev.consistent.db'" || true
    # Integrity check on consistent snapshot
    if [[ -f "$DEST/dev.consistent.db" ]]; then
      CHECK="$(sqlite3 "$DEST/dev.consistent.db" 'PRAGMA integrity_check;' || true)"
      echo "$CHECK" > "$DEST/integrity.txt"
      if [[ "$CHECK" != "ok" ]]; then
        echo "WARNING: SQLite integrity_check = $CHECK"
      else
        echo "integrity_check: ok"
      fi
      # Smoke restore: open and count users table if present
      sqlite3 "$DEST/dev.consistent.db" "SELECT count(*) FROM sqlite_master;" > "$DEST/restore-smoke.txt" || true
    fi
  fi
fi

if [[ -d "$APP_DIR/public/uploads" ]]; then
  tar -czf "$DEST/uploads.tgz" -C "$APP_DIR/public" uploads || true
fi

# Do not store plaintext .env in backup archives by default
if [[ "${BACKUP_INCLUDE_ENV:-0}" == "1" && -f "$APP_DIR/.env" ]]; then
  cp -a "$APP_DIR/.env" "$DEST/env.backup" || true
  chmod 600 "$DEST/env.backup" || true
fi

ARCHIVE="$BACKUP_ROOT/sochi-portal-$STAMP.tgz"
tar -czf "$ARCHIVE" -C "$BACKUP_ROOT" "backup-$STAMP"
rm -rf "$DEST"

# Verify archive can be listed
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
