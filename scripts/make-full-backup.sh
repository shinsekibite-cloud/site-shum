#!/usr/bin/env bash
# Create a full project backup tarball + include Debian bootstrap script.
# Output: /tmp/youngportal-full-backup-YYYYMMDD-HHMMSS.tgz (or ARTIFACTS_DIR)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${ARTIFACTS_DIR:-/opt/cursor/artifacts}"
mkdir -p "$OUT_DIR" /tmp
NAME="youngportal-full-backup-${STAMP}"
STAGE="/tmp/${NAME}"
rm -rf "$STAGE"
mkdir -p "$STAGE"

echo "[1/3] Copying project (excluding node_modules/.next/data secrets)…"
mkdir -p "$STAGE/youngportal"
tar -C "$ROOT" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude='data/*.db' \
  --exclude='uploads' \
  --exclude='.env' \
  --exclude='*.tgz' \
  --exclude='*.zip' \
  -cf - . | tar -C "$STAGE/youngportal" -xf -

# Keep empty uploads placeholder + bootstrap at archive root
mkdir -p "$STAGE/youngportal/uploads"
cp "$ROOT/scripts/debian-bootstrap.sh" "$STAGE/INSTALL-DEBIAN.sh"
chmod +x "$STAGE/INSTALL-DEBIAN.sh" "$STAGE/youngportal/scripts/debian-bootstrap.sh"

cat > "$STAGE/README-RESTORE.txt" <<EOF
YoungPortal full backup ${STAMP}
================================

Contents:
  youngportal/     — application source + docker-compose + deploy configs
  INSTALL-DEBIAN.sh — automated install helper for Debian 12+

Quick restore on a new Debian VPS (as root):

  1) Upload and unpack:
       mkdir -p /opt/youngportal
       tar -xzf ${NAME}.tgz -C /tmp
       rsync -a /tmp/${NAME}/youngportal/ /opt/youngportal/
       # or: cp -a /tmp/${NAME}/youngportal/. /opt/youngportal/

  2) Bootstrap:
       DOMAIN=your.domain.ru bash /tmp/${NAME}/INSTALL-DEBIAN.sh /opt/youngportal

  3) Configure nginx reverse proxy to 127.0.0.1:3000
     (see youngportal/deploy/nginx-sochi-portal.conf) and TLS via certbot.

  4) Open https://your.domain.ru — create first ADMIN via seed/register
     (or set role in DB), fill /admin/settings and /admin/rkn.

Notes:
  - .env is NOT included (secrets). Bootstrap generates a fresh .env.
  - uploads/ and database dumps are NOT in this source backup.
    For data: run scripts/backup-postgres.sh on the live server.
EOF

ARCHIVE="${OUT_DIR}/${NAME}.tgz"
echo "[2/3] Compressing → $ARCHIVE"
tar -czf "$ARCHIVE" -C /tmp "$NAME"
# Also copy to /tmp for easy download
cp -f "$ARCHIVE" "/tmp/${NAME}.tgz"
ln -sfn "$ARCHIVE" "${OUT_DIR}/youngportal-full-backup-latest.tgz"

echo "[3/3] Done"
ls -lh "$ARCHIVE" "/tmp/${NAME}.tgz"
echo "ARCHIVE=$ARCHIVE"
