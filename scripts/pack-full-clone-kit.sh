#!/usr/bin/env bash
# Собрать полный установочный kit клона https://young.idivles.ru «как есть».
#
# С рабочей машины (SSH к прод-VPS):
#   bash scripts/pack-full-clone-kit.sh
#
# На самом VPS:
#   bash scripts/pack-full-clone-kit.sh --local
#
# Результат на VPS:
#   /var/backups/sochi-portal/youngportal-full-kit-<stamp>.tgz
#   токенизированный URL https://young.idivles.ru/backups/<token>/…
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
LOCAL_ONLY=0
SKIP_PUBLISH=0
SKIP_DOWNLOAD=0
OUT_DIR="${ARTIFACTS_DIR:-/opt/cursor/artifacts}"
NAME="youngportal-full-kit-${STAMP}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL_ONLY=1; shift ;;
    --skip-publish) SKIP_PUBLISH=1; shift ;;
    --skip-download) SKIP_DOWNLOAD=1; shift ;;
    --stamp) STAMP="$2"; NAME="youngportal-full-kit-${STAMP}"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown: $1" >&2; exit 1 ;;
  esac
done

need() {
  local f
  for f in \
    "$ROOT/scripts/install-full-clone.sh" \
    "$ROOT/deploy/nginx-clone-site.conf.tpl" \
    "$ROOT/deploy/nginx-yp-limits.conf" \
    "$ROOT/deploy/fail2ban-yp-nginx.local" \
    "$ROOT/docs/README-INSTALL-FULL-KIT.txt"
  do
    [[ -f "$f" ]] || { echo "Missing $f" >&2; exit 1; }
  done
}
need

# Remote packer — uploaded and executed on the VPS as root.
write_remote_packer() {
  local dest="$1"
  cat > "$dest" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
NAME="$1"
KIT_SRC="$2"
SKIP_PUBLISH="${3:-0}"
APP="${APP_DIR:-/opt/sochi-portal}"
BACKUP="${BACKUP_DIR:-/var/backups/sochi-portal}"
STAGE="/tmp/${NAME}"
SNAP="${STAGE}/snapshot"

rm -rf "$STAGE"
mkdir -p "$SNAP" "$STAGE/templates" "$STAGE/deploy" "$BACKUP"

echo "[1/6] docker image prune"
docker image prune -f >/dev/null 2>&1 || true

echo "[2/6] Postgres dump"
docker exec sochi-portal_db_1 pg_dump -U sochi -Fc sochi_portal > "$SNAP/db.dump"

echo "[3/6] uploads"
if [[ -d "$APP/public/uploads" ]]; then
  tar -czf "$SNAP/uploads.tgz" -C "$APP/public" uploads
else
  mkdir -p /tmp/yp-empty-uploads/uploads
  tar -czf "$SNAP/uploads.tgz" -C /tmp/yp-empty-uploads uploads
  rm -rf /tmp/yp-empty-uploads
fi

echo "[4/6] docker save web+postgres+redis (несколько минут)"
docker save sochi-portal_web:latest postgres:16-alpine redis:7-alpine \
  | gzip -1 > "$SNAP/images.tar.gz"

echo "[5/6] host-app без .env / node_modules / .next / postgres / uploads"
tar -czf "$SNAP/host-app.tgz" -C /opt \
  --exclude='sochi-portal/.env' \
  --exclude='sochi-portal/.env.*' \
  --exclude='sochi-portal/node_modules' \
  --exclude='sochi-portal/.next' \
  --exclude='sochi-portal/.git' \
  --exclude='sochi-portal/data/postgres' \
  --exclude='sochi-portal/public/uploads' \
  --exclude='sochi-portal/backup-deploy' \
  --exclude='sochi-portal/*.tgz' \
  --exclude='sochi-portal/*.zip' \
  sochi-portal

if [[ -f "$APP/.env" ]]; then
  grep -E '^[A-Z0-9_]+=' "$APP/.env" | cut -d= -f1 | sort > "$SNAP/env-keys.txt"
fi

SW="$(grep -o 'sochi-shell-v[0-9a-z-]*' "$APP/public/sw.js" 2>/dev/null | head -1 || echo unknown)"
IMG="$(docker inspect --format '{{.Id}}' sochi-portal_web:latest 2>/dev/null || true)"
HEALTH="$(curl -sS --max-time 8 http://127.0.0.1:3000/api/health 2>/dev/null || echo '{}')"
SITE="$(docker exec sochi-portal_db_1 psql -U sochi -d sochi_portal -tAc 'SELECT "siteName" FROM "SiteSettings" LIMIT 1;' 2>/dev/null | tr -d '\r' || true)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "$SNAP/MANIFEST.txt" <<EOF
YoungPortal FULL clone snapshot
Packed: ${NOW}
Source: https://young.idivles.ru  (production :3000)
Site name in DB: ${SITE}
Service worker: ${SW}
Web image: ${IMG}
Health: ${HEALTH}

Contents:
  db.dump         Postgres custom dump (sochi_portal) — персональные данные
  uploads.tgz     public/uploads
  images.tar.gz   docker save: sochi-portal_web + postgres:16-alpine + redis:7-alpine
  host-app.tgz    /opt/sochi-portal без .env / node_modules / .next / postgres / uploads
  env-keys.txt    имена ключей .env (значения НЕ включены)

Секреты (.env, токены, приватные ключи TLS) в архив НЕ входят.
Установщик генерирует новые NEXTAUTH_SECRET / пароли БД и Redis.
EOF

python3 - "$SNAP/VERSION.json" <<PY
import json, pathlib, sys
raw = """${HEALTH}""".strip()
try:
    health = json.loads(raw)
except Exception:
    health = raw
pathlib.Path(sys.argv[1]).write_text(json.dumps({
    "source": "https://young.idivles.ru",
    "packedAt": "${NOW}",
    "siteName": """${SITE}""".strip(),
    "sw": "${SW}",
    "webImageId": "${IMG}",
    "health": health,
}, ensure_ascii=False, indent=2) + "\n")
PY

echo "[6/6] INSTALL.sh + templates + overlay installer into host-app"
cp -f "$KIT_SRC/install-full-clone.sh" "$STAGE/INSTALL.sh"
chmod +x "$STAGE/INSTALL.sh"
cp -f "$KIT_SRC/nginx-clone-site.conf.tpl" "$STAGE/templates/"
cp -f "$KIT_SRC/nginx-yp-limits.conf" "$STAGE/templates/"
cp -f "$KIT_SRC/fail2ban-yp-nginx.local" "$STAGE/templates/"
cp -f "$STAGE/templates/"* "$STAGE/deploy/"
cp -f "$KIT_SRC/README-INSTALL.txt" "$STAGE/README-INSTALL.txt"

OVER=/tmp/yp-host-overlay-$$
rm -rf "$OVER"
mkdir -p "$OVER"
tar -xzf "$SNAP/host-app.tgz" -C "$OVER"
mkdir -p "$OVER/sochi-portal/scripts" "$OVER/sochi-portal/deploy"
cp -f "$STAGE/INSTALL.sh" "$OVER/sochi-portal/scripts/install-full-clone.sh"
chmod +x "$OVER/sochi-portal/scripts/install-full-clone.sh"
cp -f "$STAGE/templates/"* "$OVER/sochi-portal/deploy/"
tar -czf "$SNAP/host-app.tgz" -C "$OVER" sochi-portal
rm -rf "$OVER"

ARCHIVE="${BACKUP}/${NAME}.tgz"
echo "Compressing ${ARCHIVE}"
tar -czf "$ARCHIVE" -C /tmp "$NAME"
sha256sum "$ARCHIVE" | tee "${ARCHIVE}.sha256"
ln -sfn "$ARCHIVE" "${BACKUP}/youngportal-full-kit-latest.tgz"
ls -lh "$ARCHIVE"
echo "KIT_ARCHIVE=${ARCHIVE}"
rm -rf "$STAGE"

if [[ "$SKIP_PUBLISH" != "1" && -x "${APP}/scripts/publish-public-backup.sh" ]]; then
  echo "==> publish tokenized URL"
  PUBLIC_ORIGIN=https://young.idivles.ru bash "${APP}/scripts/publish-public-backup.sh" "$ARCHIVE" || true
fi
REMOTE
  chmod +x "$dest"
}

stage_kit_src() {
  local dir="$1"
  mkdir -p "$dir"
  cp -f "$ROOT/scripts/install-full-clone.sh" "$dir/"
  cp -f "$ROOT/deploy/nginx-clone-site.conf.tpl" "$dir/"
  cp -f "$ROOT/deploy/nginx-yp-limits.conf" "$dir/"
  cp -f "$ROOT/deploy/fail2ban-yp-nginx.local" "$dir/"
  cp -f "$ROOT/docs/README-INSTALL-FULL-KIT.txt" "$dir/README-INSTALL.txt"
}

if [[ "$LOCAL_ONLY" -eq 1 ]]; then
  SRC=/tmp/yp-kit-src-$$
  PACK=/tmp/yp-pack-remote-$$.sh
  stage_kit_src "$SRC"
  write_remote_packer "$PACK"
  bash "$PACK" "$NAME" "$SRC" "$SKIP_PUBLISH"
  rm -rf "$SRC" "$PACK"
  exit 0
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/vps.sh"
yp_init_ssh

echo "==> Upload packer + installer to VPS"
SRC_REMOTE=/tmp/yp-kit-src
PACK_LOCAL=/tmp/yp-pack-remote.sh
write_remote_packer "$PACK_LOCAL"
yp_ssh "rm -rf $SRC_REMOTE && mkdir -p $SRC_REMOTE"
yp_scp \
  "$ROOT/scripts/install-full-clone.sh" \
  "$ROOT/deploy/nginx-clone-site.conf.tpl" \
  "$ROOT/deploy/nginx-yp-limits.conf" \
  "$ROOT/deploy/fail2ban-yp-nginx.local" \
  "$ROOT/docs/README-INSTALL-FULL-KIT.txt" \
  "$PACK_LOCAL" \
  "$HOST:$SRC_REMOTE/"
yp_ssh "mv $SRC_REMOTE/README-INSTALL-FULL-KIT.txt $SRC_REMOTE/README-INSTALL.txt && chmod +x $SRC_REMOTE/yp-pack-remote.sh"

echo "==> Pack on VPS (docker save 5–15 мин, следите за диском)"
yp_ssh "bash $SRC_REMOTE/yp-pack-remote.sh $NAME $SRC_REMOTE $SKIP_PUBLISH"

echo "==> Locate archive"
REMOTE_INFO="$(yp_ssh "ls -lh /var/backups/sochi-portal/${NAME}.tgz; cat /var/backups/sochi-portal/${NAME}.tgz.sha256; bash /opt/sochi-portal/scripts/publish-public-backup.sh --list 2>/dev/null | grep ${NAME} | tail -1 || true")"
echo "$REMOTE_INFO"

if [[ "$SKIP_DOWNLOAD" -eq 0 ]]; then
  mkdir -p "$OUT_DIR"
  echo "==> Download kit → $OUT_DIR/${NAME}.tgz"
  yp_scp "$HOST:/var/backups/sochi-portal/${NAME}.tgz" "$OUT_DIR/${NAME}.tgz"
  yp_scp "$HOST:/var/backups/sochi-portal/${NAME}.tgz.sha256" "$OUT_DIR/${NAME}.tgz.sha256" || true
  ln -sfn "$OUT_DIR/${NAME}.tgz" "$OUT_DIR/youngportal-full-kit-latest.tgz" 2>/dev/null \
    || cp -f "$OUT_DIR/${NAME}.tgz.sha256" "$OUT_DIR/youngportal-full-kit-latest.sha256" 2>/dev/null \
    || true
  ls -lh "$OUT_DIR/${NAME}.tgz" "$OUT_DIR/${NAME}.tgz.sha256" 2>/dev/null || true
  echo "LOCAL_ARCHIVE=$OUT_DIR/${NAME}.tgz"
fi

echo "Done. Kit name: $NAME"
