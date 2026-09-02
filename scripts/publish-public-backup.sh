#!/usr/bin/env bash
# Publish a full backup archive under a tokenized public URL served by nginx:
#   https://<host>/backups/<token>/<filename>
#
# Storage is OUTSIDE the app tree so deploy rsync --delete cannot wipe it:
#   /var/backups/sochi-portal/public-dl/<token>/
#
# Usage (on VPS as root):
#   ./scripts/publish-public-backup.sh /var/backups/sochi-portal/young-full-….tgz
#   TOKEN=83aef5… ./scripts/publish-public-backup.sh /path/to/file.tgz
#   ./scripts/publish-public-backup.sh --list
set -euo pipefail

ROOT="${BACKUP_PUBLIC_ROOT:-/var/backups/sochi-portal/public-dl}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://py.idivles.ru}"

mkdir -p "$ROOT"
chmod 755 /var/backups/sochi-portal "$ROOT" 2>/dev/null || true

if [[ "${1:-}" == "--list" ]]; then
  find "$ROOT" -type f -printf '%p\t%s\n' 2>/dev/null | while IFS=$'\t' read -r path size; do
    rel="${path#"$ROOT"/}"
    echo "$PUBLIC_ORIGIN/backups/$rel  ($size bytes)"
  done
  exit 0
fi

SRC="${1:-}"
if [[ -z "$SRC" || ! -f "$SRC" ]]; then
  echo "Usage: $0 /path/to/archive.tgz" >&2
  echo "       $0 --list" >&2
  exit 1
fi

NAME="$(basename "$SRC")"
TOKEN="${TOKEN:-$(openssl rand -hex 16)}"
DEST_DIR="$ROOT/$TOKEN"
mkdir -p "$DEST_DIR"
chmod 755 "$DEST_DIR"
cp -f "$SRC" "$DEST_DIR/$NAME"
chmod 644 "$DEST_DIR/$NAME"

URL="$PUBLIC_ORIGIN/backups/$TOKEN/$NAME"
echo "Published: $URL"
echo "Local:     $DEST_DIR/$NAME"
echo "TOKEN=$TOKEN"
echo "URL=$URL"
