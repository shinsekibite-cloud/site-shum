#!/usr/bin/env bash
# Pack a Disaster-Recovery / handoff bundle: code + docs + VPS scripts (no secrets/DB).
#
# Output:
#   $ARTIFACTS_DIR/youngportal-dr-bundle-<stamp>.tgz
#   symlink: youngportal-dr-bundle-latest.tgz
#
# Usage:
#   bash scripts/pack-dr-bundle.sh
#   ARTIFACTS_DIR=/tmp bash scripts/pack-dr-bundle.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${ARTIFACTS_DIR:-/opt/cursor/artifacts}"
mkdir -p "$OUT_DIR" /tmp
NAME="youngportal-dr-bundle-${STAMP}"
STAGE="/tmp/${NAME}"
rm -rf "$STAGE"
mkdir -p "$STAGE/youngportal" "$STAGE/docs-extra"

echo "[1/4] Copying project source…"
tar -C "$ROOT" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude='data/postgres' \
  --exclude='data/*.db' \
  --exclude='public/uploads' \
  --exclude='.env' \
  --exclude='*.tgz' \
  --exclude='*.zip' \
  --exclude='*.enc' \
  -cf - . | tar -C "$STAGE/youngportal" -xf -

mkdir -p "$STAGE/youngportal/public/uploads" "$STAGE/youngportal/data"
chmod +x "$STAGE/youngportal"/scripts/*.sh 2>/dev/null || true

echo "[2/4] Writing INSTALL + README…"
cp "$ROOT/scripts/vps-auto-setup.sh" "$STAGE/INSTALL-VPS.sh"
chmod +x "$STAGE/INSTALL-VPS.sh"
cp "$ROOT/scripts/debian-bootstrap.sh" "$STAGE/INSTALL-DEBIAN.sh" 2>/dev/null || true
chmod +x "$STAGE/INSTALL-DEBIAN.sh" 2>/dev/null || true

# Quick index of ops docs at archive root
cp "$ROOT/docs/BACKUP-AND-REDEPLOY.md" "$STAGE/docs-extra/" 2>/dev/null || true
cp "$ROOT/docs/SYSTEM-SETTINGS.md" "$STAGE/docs-extra/" 2>/dev/null || true
cp "$ROOT/docs/VPS-FRESH-INSTALL.md" "$STAGE/docs-extra/" 2>/dev/null || true
cp "$ROOT/docs/VPS-INSTALL-PITFALLS.md" "$STAGE/docs-extra/" 2>/dev/null || true
cp "$ROOT/docs/VPS-OS-SETUP.md" "$STAGE/docs-extra/" 2>/dev/null || true
cp "$ROOT/DEPLOYMENT.md" "$STAGE/docs-extra/" 2>/dev/null || true

cat > "$STAGE/README-RESTORE.txt" <<EOF
YoungPortal DR bundle ${STAMP}
==============================

Contents
  youngportal/     — full app (docker-compose, deploy/, docs/, scripts/)
  INSTALL-VPS.sh   — symlink-style copy of scripts/vps-auto-setup.sh
  docs-extra/      — key ops docs at archive root for quick reading
  README-RESTORE.txt

NOT included (by design)
  .env secrets, node_modules, .next, Postgres volume, user uploads

── Quick path: new Debian VPS ──

1) Unpack:
     mkdir -p /opt/sochi-portal
     tar -xzf ${NAME}.tgz -C /tmp
     rsync -a /tmp/${NAME}/youngportal/ /opt/sochi-portal/

2) Secure auto-setup (harden + Docker + nginx + TLS):
     cd /opt/sochi-portal
     DOMAIN=portal.example.ru \\
     ADMIN_EMAIL=admin@example.ru ADMIN_PASSWORD='StrongPass1!' \\
     TECH_EMAIL=tech@example.ru TECH_BOOTSTRAP_PASSWORD='TechPass1!' \\
     bash scripts/vps-auto-setup.sh --yes \\
       --ssh-key "\$(cat ~/.ssh/id_ed25519.pub)"

3) Restore DATA from a live backup (SQL+uploads):
     ./scripts/restore-postgres.sh /path/to/sochi-portal-YYYYMMDD.tgz

4) Merge secrets carefully into .env (NEXTAUTH_SECRET, RESEND_*, OAuth, VAPID).
     Keep DATABASE_URL / REDIS_* from the new install.

5) Verify:
     bash scripts/vps-post-install-check.sh --domain portal.example.ru

Full guide: youngportal/docs/BACKUP-AND-REDEPLOY.md
            youngportal/docs/VPS-FRESH-INSTALL.md

How to create a LIVE data backup on the current server:
  ssh -p 4488 root@OLD_IP
  cd /opt/sochi-portal && ./scripts/backup-postgres.sh && ./scripts/full-backup.sh
  # download /var/backups/sochi-portal/*.tgz  (or publish-public-backup.sh)
EOF

ARCHIVE="${OUT_DIR}/${NAME}.tgz"
echo "[3/4] Compressing → $ARCHIVE"
tar -czf "$ARCHIVE" -C /tmp "$NAME"
cp -f "$ARCHIVE" "/tmp/${NAME}.tgz"
ln -sfn "$ARCHIVE" "${OUT_DIR}/youngportal-dr-bundle-latest.tgz"
ln -sfn "$ARCHIVE" "${OUT_DIR}/youngportal-full-backup-latest.tgz"

# Size hint
echo "[4/4] Done"
ls -lh "$ARCHIVE" "/tmp/${NAME}.tgz"
echo "ARCHIVE=$ARCHIVE"
echo "LATEST=${OUT_DIR}/youngportal-dr-bundle-latest.tgz"
