#!/usr/bin/env bash
# Собрать полный developer/reference-kit: текущие исходники + скрипты теста/прода
# + (опционально) живой снимок VPS (БД, uploads, Docker-образы).
#
#   bash scripts/pack-dev-deploy-kit.sh              # исходники (разработчик)
#   bash scripts/pack-dev-deploy-kit.sh --with-live  # + снимок VPS
#   bash scripts/pack-dev-deploy-kit.sh --reference --with-live  # ЭТАЛОН
#   bash scripts/pack-dev-deploy-kit.sh --client --with-live     # КЛИЕНТ (без docs)
#
# Секреты (.env, TLS-ключи) в архив НЕ входят.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
LOCAL_ONLY=0
WITH_LIVE=0
SKIP_PUBLISH=0
SKIP_DOWNLOAD=0
CLIENT_KIT=0
OUT_DIR="${ARTIFACTS_DIR:-/opt/cursor/artifacts}"
KIT_PREFIX="${KIT_PREFIX:-youngportal-dev-kit}"
NAME="${KIT_PREFIX}-${STAMP}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL_ONLY=1; shift ;;
    --with-live) WITH_LIVE=1; shift ;;
    --source-only) WITH_LIVE=0; shift ;;
    --reference) KIT_PREFIX=youngportal-reference-kit; NAME="${KIT_PREFIX}-${STAMP}"; shift ;;
    --client)
      CLIENT_KIT=1
      KIT_PREFIX=youngportal-client-kit
      NAME="${KIT_PREFIX}-${STAMP}"
      shift
      ;;
    --skip-publish) SKIP_PUBLISH=1; shift ;;
    --skip-download) SKIP_DOWNLOAD=1; shift ;;
    --stamp) STAMP="$2"; NAME="${KIT_PREFIX}-${STAMP}"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \?//' | sed '/^set /,$d'; exit 0 ;;
    *) echo "Unknown: $1" >&2; exit 1 ;;
  esac
done

need() {
  local f
  for f in \
    "$ROOT/scripts/install-dev-stack.sh" \
    "$ROOT/scripts/start-kit.sh" \
    "$ROOT/scripts/install-remote.sh" \
    "$ROOT/deploy/nginx-dual-site.conf.tpl" \
    "$ROOT/deploy/nginx-clone-site.conf.tpl" \
    "$ROOT/deploy/nginx-yp-limits.conf" \
    "$ROOT/deploy/fail2ban-yp-nginx.local" \
    "$ROOT/docker-compose.yml" \
    "$ROOT/docker-compose.staging.yml" \
    "$ROOT/LICENSE"
  do
    [[ -f "$f" ]] || { echo "Missing $f" >&2; exit 1; }
  done
  if [[ "$CLIENT_KIT" == "1" ]]; then
    [[ -f "$ROOT/docs/CLIENT-INSTALL.txt" ]] || { echo "Missing CLIENT-INSTALL.txt" >&2; exit 1; }
  else
    [[ -f "$ROOT/docs/README-INSTALL-DEV-KIT.txt" ]] || { echo "Missing README-INSTALL-DEV-KIT.txt" >&2; exit 1; }
  fi
  if [[ "$KIT_PREFIX" == *reference* ]]; then
    [[ -f "$ROOT/docs/REFERENCE-KIT.txt" ]] || { echo "Missing REFERENCE-KIT.txt" >&2; exit 1; }
  fi
}
need

APP_VER="$(python3 - "$ROOT/package.json" <<'PY'
import json, pathlib, sys
print(json.loads(pathlib.Path(sys.argv[1]).read_text()).get("version", "unknown"))
PY
)"
GIT_SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
GIT_BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

stage_source_kit() {
  local stage="$1"
  rm -rf "$stage"
  mkdir -p "$stage/source" "$stage/scripts" "$stage/scripts/lib" "$stage/deploy" \
    "$stage/templates" "$stage/docs" "$stage/snapshot"

  echo "[kit] pack current source tree → source/app.tgz (client=$CLIENT_KIT)"
  local tar_ex=(
    --exclude=node_modules
    --exclude=.git
    --exclude=.next
    --exclude=data
    --exclude=prisma/dev.db
    --exclude='.env'
    --exclude='.env.*'
    --exclude='*.tgz'
    --exclude='*.tar.gz'
    --exclude='*.zip'
    --exclude=public/uploads
    --exclude=public/backups
    --exclude=qa-screenshots
    --exclude='qa-screenshots-*'
    --exclude=tsconfig.tsbuildinfo
    --exclude=.cursor
  )
  if [[ "$CLIENT_KIT" == "1" ]]; then
    tar_ex+=(
      --exclude=docs
      --exclude=tests
      --exclude='*.md'
      --exclude=scripts/qa-*.mjs
      --exclude=scripts/qa-*.sh
      --exclude=scripts/pack-*.sh
      --exclude=scripts/workflow-*.sh
      --exclude=scripts/manual-promote-to-young.sh
      --exclude=scripts/snapshot-live-site.sh
      --exclude=scripts/restore-live-snapshot.sh
      --exclude=scripts/publish-public-backup.sh
    )
  fi
  tar -czf "$stage/source/app.tgz" "${tar_ex[@]}" -C "$ROOT" .
  # LICENSE always in app.tgz for client: re-add if excluded by *.md only — LICENSE has no .md
  sha256sum "$stage/source/app.tgz" | awk '{print $1}' > "$stage/source/app.tgz.sha256"

  cp -f "$ROOT/LICENSE" "$stage/LICENSE"
  cp -f "$ROOT/scripts/install-dev-stack.sh" "$stage/INSTALL.sh"
  chmod +x "$stage/INSTALL.sh"
  cp -f "$ROOT/scripts/start-kit.sh" "$stage/START.sh"
  chmod +x "$stage/START.sh"
  cp -f "$ROOT/scripts/install-remote.sh" "$stage/install-remote.sh"
  chmod +x "$stage/install-remote.sh"
  cp -f "$ROOT/scripts/install-from-url.sh" "$stage/install-from-url.sh"
  chmod +x "$stage/install-from-url.sh"
  cp -f "$ROOT/scripts/run-install.sh" "$stage/run-install.sh" 2>/dev/null || true
  chmod +x "$stage/run-install.sh" 2>/dev/null || true
  cp -f "$ROOT/scripts/yp-install.sh" "$stage/yp-install.sh" 2>/dev/null || true
  chmod +x "$stage/yp-install.sh" 2>/dev/null || true
  cp -f "$ROOT/scripts/yp-install.env.example" "$stage/yp-install.env.example" 2>/dev/null || true

  # Полный набор скриптов внутри архива (и клиент, и разработчик)
  echo "[kit] copy scripts/ into kit"
  rm -rf "$stage/scripts"
  mkdir -p "$stage/scripts"
  tar -C "$ROOT/scripts" --exclude='qa-screenshots*' --exclude='*.log' --exclude='.env' -cf - . \
    | tar -C "$stage/scripts" -xf -
  if [[ "$CLIENT_KIT" == "1" ]]; then
    # Клиенту не нужны наши VPS-workflow / pack-утилиты вендора
    rm -f "$stage/scripts"/pack-*.sh \
      "$stage/scripts"/workflow-*.sh \
      "$stage/scripts"/manual-promote-to-young.sh \
      "$stage/scripts"/snapshot-live-site.sh \
      "$stage/scripts"/restore-live-snapshot.sh \
      "$stage/scripts"/publish-public-backup.sh \
      "$stage/scripts"/qa-*.mjs \
      "$stage/scripts"/qa-*.sh 2>/dev/null || true
  fi
  chmod +x "$stage/scripts/"*.sh "$stage/scripts/lib/"*.sh 2>/dev/null || true

  cp -f "$ROOT/deploy/nginx-dual-site.conf.tpl" "$stage/deploy/"
  cp -f "$ROOT/deploy/nginx-clone-site.conf.tpl" "$stage/deploy/"
  cp -f "$ROOT/deploy/nginx-yp-limits.conf" "$stage/deploy/"
  cp -f "$ROOT/deploy/fail2ban-yp-nginx.local" "$stage/deploy/"
  cp -f "$ROOT/docker-compose.yml" "$stage/deploy/"
  cp -f "$ROOT/docker-compose.staging.yml" "$stage/deploy/"
  if [[ "$CLIENT_KIT" != "1" ]]; then
    cp -f "$ROOT/deploy/nginx-young-prod-y1-staging.conf" "$stage/deploy/" 2>/dev/null || true
  fi
  cp -f "$stage/deploy/"*.tpl "$stage/templates/" 2>/dev/null || true
  cp -f "$stage/deploy/nginx-yp-limits.conf" "$stage/templates/"
  cp -f "$stage/deploy/fail2ban-yp-nginx.local" "$stage/templates/"

  if [[ "$CLIENT_KIT" == "1" ]]; then
    cp -f "$ROOT/docs/CLIENT-INSTALL.txt" "$stage/README.txt"
    cp -f "$ROOT/docs/CLIENT-INSTALL.txt" "$stage/docs/CLIENT-INSTALL.txt"
    # no developer docs
  else
    cp -f "$ROOT/docs/README-INSTALL-DEV-KIT.txt" "$stage/README.txt"
    cp -f "$ROOT/docs/README-INSTALL-DEV-KIT.txt" "$stage/docs/"
    if [[ -f "$ROOT/docs/REFERENCE-KIT.txt" ]]; then
      cp -f "$ROOT/docs/REFERENCE-KIT.txt" "$stage/REFERENCE.txt"
      cp -f "$ROOT/docs/REFERENCE-KIT.txt" "$stage/docs/"
    fi
    cp -f "$ROOT/docs/DEV-DEPLOY-KIT.md" "$stage/docs/" 2>/dev/null || true
    cp -f "$ROOT/docs/WORKFLOW.md" "$stage/docs/" 2>/dev/null || true
    cp -f "$ROOT/docs/FULL-CLONE-KIT.md" "$stage/docs/" 2>/dev/null || true
    cp -f "$ROOT/docs/ORG-HANDOFF.md" "$stage/docs/" 2>/dev/null || true
    cp -f "$ROOT/docs/ORG-HANDOFF.md" "$stage/ORG-HANDOFF.md" 2>/dev/null || true
    cp -f "$ROOT/docs/VPS-OS-SETUP.md" "$stage/docs/" 2>/dev/null || true
  fi

  local role="developer"
  [[ "$KIT_PREFIX" == *reference* ]] && role=reference
  [[ "$CLIENT_KIT" == "1" ]] && role=client

  cat > "$stage/VERSION.json" <<EOF
{
  "kit": "${KIT_PREFIX}",
  "name": "${NAME}",
  "role": "${role}",
  "clientSlim": $([[ "$CLIENT_KIT" == "1" ]] && echo true || echo false),
  "packedAt": "${NOW}",
  "appVersion": "${APP_VER}",
  "gitSha": "${GIT_SHA}",
  "gitBranch": "${GIT_BRANCH}",
  "includesLiveSnapshot": $([[ "$WITH_LIVE" -eq 1 ]] && echo true || echo false),
  "secretsIncluded": false,
  "docsIncluded": $([[ "$CLIENT_KIT" == "1" ]] && echo false || echo true),
  "oneClick": true,
  "variants": ["clean", "demo", "full", "reinstall", "client"]
}
EOF

  local app_sha
  app_sha="$(cat "$stage/source/app.tgz.sha256")"
  cat > "$stage/INTEGRITY.json" <<EOF
{
  "algorithm": "sha256",
  "appTgz": "${app_sha}",
  "license": "LICENSE",
  "packedAt": "${NOW}",
  "gitSha": "${GIT_SHA}",
  "note": "Verify source/app.tgz before install. Modifying app files after install voids support terms."
}
EOF

  if [[ "$CLIENT_KIT" == "1" ]]; then
    cat > "$stage/snapshot/MANIFEST.txt" <<EOF
YoungPortal CLIENT kit (slim)
Packed: ${NOW}
App version: ${APP_VER}
Git: ${GIT_BRANCH} @ ${GIT_SHA}

source/app.tgz     код без docs/tests/qa (см. INTEGRITY.json)
LICENSE            условия использования
scripts/           только установка / TLS / бэкап / harden
deploy/            nginx + compose
snapshot/          опционально: images + пустая схема (без чужих персональных данных в --client предпочтительно images)

Документация разработчика в комплект НЕ входит.
EOF
  else
    cat > "$stage/snapshot/MANIFEST.txt" <<EOF
YoungPortal developer kit
Packed: ${NOW}
App version: ${APP_VER}
Git: ${GIT_BRANCH} @ ${GIT_SHA}

source/app.tgz     текущее дерево проекта (без .env / node_modules / .next / uploads)
scripts/           INSTALL, workflow-deploy-staging, promote, snapshot, restore
deploy/            dual nginx, compose prod+staging, fail2ban
snapshot/          опционально: db.dump, uploads.tgz, images.tar.gz

Секреты (.env, токены, приватные ключи TLS) в архив НЕ входят.
Установщик генерирует новые NEXTAUTH_SECRET / пароли БД и Redis.
EOF
  fi
}

pack_live_on_vps() {
  local dest="$1"
  cat > "$dest" <<'REMOTE'
#!/usr/bin/env bash
set -euo pipefail
# SNAP must be on disk (not tmpfs /tmp). CLIENT_SLIM=1 → только images (без БД/uploads).
SNAP="$1"
APP="${APP_DIR:-/opt/sochi-portal}"
CLIENT_SLIM="${CLIENT_SLIM:-0}"
mkdir -p "$SNAP"

echo "[live] disk"
df -h / /var /var/lib/docker 2>/dev/null || df -h /
avail_kb="$(df -Pk "$SNAP" | awk 'NR==2{print $4}')"
if [[ -n "$avail_kb" && "$avail_kb" -lt 5000000 ]]; then
  echo "WARN: мало места на $(df -P "$SNAP" | awk 'NR==2{print $1}'): ${avail_kb}KB — docker save может не влезть" >&2
fi

if [[ "$CLIENT_SLIM" != "1" ]]; then
  echo "[live] Postgres dump"
  if docker ps --format '{{.Names}}' | grep -Eq '^sochi-portal(_|-)db'; then
    DB="$(docker ps --format '{{.Names}}' | grep -E '^sochi-portal(_|-)db' | head -1)"
    docker exec "$DB" pg_dump -U sochi -Fc sochi_portal > "$SNAP/db.dump"
  else
    echo "WARN: no prod db container — skip dump"
  fi

  echo "[live] uploads"
  if [[ -d "$APP/public/uploads" ]]; then
    tar -czf "$SNAP/uploads.tgz" -C "$APP/public" uploads
  else
    empty="$(mktemp -d /var/tmp/yp-empty-uploads.XXXXXX)"
    mkdir -p "$empty/uploads"
    tar -czf "$SNAP/uploads.tgz" -C "$empty" uploads
    rm -rf "$empty"
  fi
else
  echo "[live] CLIENT_SLIM: skip db.dump + uploads (чистая установка без чужих данных)"
fi

echo "[live] docker save (не трогаем prune :latest)"
WEB_IMG=""
if docker image inspect sochi-portal_web:latest >/dev/null 2>&1; then
  WEB_IMG="sochi-portal_web:latest"
elif docker image inspect sochi-portal-web:latest >/dev/null 2>&1; then
  echo "[live] tag sochi-portal-web:latest → sochi-portal_web:latest"
  docker tag sochi-portal-web:latest sochi-portal_web:latest || true
  WEB_IMG="sochi-portal_web:latest"
else
  RUNNING="$(docker ps --filter name=sochi-portal.web --format '{{.Image}}' | head -1 || true)"
  if [[ -n "$RUNNING" ]]; then
    echo "WARN: sochi-portal_web:latest отсутствует — tag from running $RUNNING"
    docker tag "$RUNNING" sochi-portal_web:latest || true
    WEB_IMG="sochi-portal_web:latest"
  fi
fi
SAVE_IMGS=(postgres:16-alpine redis:7-alpine)
[[ -n "$WEB_IMG" ]] && SAVE_IMGS+=("$WEB_IMG")
if docker image inspect sochi-staging_web:latest >/dev/null 2>&1; then
  SAVE_IMGS+=(sochi-staging_web:latest)
fi
# Prefer disk under /var/tmp if /tmp is tight
SNAP_PARENT="$(dirname "$SNAP")"
avail_kb="$(df -Pk "$SNAP_PARENT" | awk 'NR==2{print $4}')"
if [[ -n "$avail_kb" && "$avail_kb" -lt 3500000 ]]; then
  echo "WARN: мало места (${avail_kb}KB) — docker builder prune"
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
fi
docker save "${SAVE_IMGS[@]}" | gzip -1 > "$SNAP/images.tar.gz"

if [[ -f "$APP/.env" ]]; then
  grep -E '^[A-Z0-9_]+=' "$APP/.env" | cut -d= -f1 | sort > "$SNAP/env-keys.txt"
fi

SW="$(grep -o 'sochi-shell-v[0-9a-z-]*' "$APP/public/sw.js" 2>/dev/null | head -1 || echo unknown)"
IMG="$(docker inspect --format '{{.Id}}' sochi-portal_web:latest 2>/dev/null || true)"
HEALTH="$(curl -sS --max-time 8 http://127.0.0.1:3000/api/health 2>/dev/null || echo '{}')"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "Live snapshot packed: ${NOW}"
  echo "clientSlim: ${CLIENT_SLIM}"
  echo "Web image: ${IMG}"
  echo "SW: ${SW}"
  echo "Health: ${HEALTH}"
  echo "images: ${SAVE_IMGS[*]}"
} >> "$SNAP/MANIFEST.txt"
echo "LIVE_OK=1"
REMOTE
  chmod +x "$dest"
}

finalize_archive() {
  local stage="$1" archive="$2"
  local tmp_archive="/tmp/$(basename "$archive")"
  echo "[kit] compress $tmp_archive"
  tar -czf "$tmp_archive" -C "$(dirname "$stage")" "$(basename "$stage")"
  sha256sum "$tmp_archive" | tee "${tmp_archive}.sha256"
  ls -lh "$tmp_archive"
  if [[ "$archive" != "$tmp_archive" ]]; then
    mkdir -p "$(dirname "$archive")"
    if cp -f "$tmp_archive" "$archive" 2>/dev/null && cp -f "${tmp_archive}.sha256" "${archive}.sha256" 2>/dev/null; then
      echo "[kit] copied to $archive"
    else
      echo "WARN: не удалось скопировать в $archive — архив остаётся в $tmp_archive" >&2
      archive="$tmp_archive"
    fi
  fi
  FINAL_ARCHIVE="$archive"
}

if [[ "$LOCAL_ONLY" -eq 1 ]]; then
  STAGE="/tmp/${NAME}"
  stage_source_kit "$STAGE"
  if [[ "$WITH_LIVE" -eq 1 ]]; then
    PACK=/tmp/yp-devkit-live-$$.sh
    pack_live_on_vps "$PACK"
    bash "$PACK" "$STAGE/snapshot"
    rm -f "$PACK"
  fi
  ARCHIVE="${OUT_DIR}/${NAME}.tgz"
  if [[ -d /var/backups/sochi-portal ]]; then
    ARCHIVE="/var/backups/sochi-portal/${NAME}.tgz"
  fi
  finalize_archive "$STAGE" "$ARCHIVE"
  ARCHIVE="${FINAL_ARCHIVE:-$ARCHIVE}"
  ln -sfn "$ARCHIVE" "$(dirname "$ARCHIVE")/${KIT_PREFIX}-latest.tgz" 2>/dev/null || true
  rm -rf "$STAGE"
  echo "KIT_ARCHIVE=${ARCHIVE}"
  exit 0
fi

STAGE="/tmp/${NAME}"
stage_source_kit "$STAGE"

if [[ "$WITH_LIVE" -eq 1 ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/lib/vps.sh"
  yp_init_ssh
  if [[ "$CLIENT_KIT" == "1" ]]; then
    echo "==> Live snapshot for CLIENT: только Docker-образы (без БД/uploads чужого стенда)"
  else
    echo "==> Live snapshot from VPS (db + uploads + docker save)"
  fi
  PACK_LOCAL=/tmp/yp-devkit-live.sh
  # /tmp на многих VPS — tmpfs (~1G); docker save нужен диск
  LIVE_SNAP_REMOTE=/var/backups/sochi-portal/yp-devkit-live-snap
  pack_live_on_vps "$PACK_LOCAL"
  yp_ssh "mkdir -p '$LIVE_SNAP_REMOTE' /var/tmp && rm -rf '${LIVE_SNAP_REMOTE:?}'/*"
  yp_scp "$PACK_LOCAL" "$HOST:/var/tmp/yp-devkit-live.sh"
  if [[ "$CLIENT_KIT" == "1" ]]; then
    yp_ssh "chmod +x /var/tmp/yp-devkit-live.sh && CLIENT_SLIM=1 bash /var/tmp/yp-devkit-live.sh '$LIVE_SNAP_REMOTE'"
  else
    yp_ssh "chmod +x /var/tmp/yp-devkit-live.sh && bash /var/tmp/yp-devkit-live.sh '$LIVE_SNAP_REMOTE'"
  fi
  mkdir -p "$STAGE/snapshot"
  if [[ "$CLIENT_KIT" == "1" ]]; then
    yp_scp "$HOST:${LIVE_SNAP_REMOTE}/images.tar.gz" "$STAGE/snapshot/images.tar.gz" || true
    yp_scp "$HOST:${LIVE_SNAP_REMOTE}/env-keys.txt" "$STAGE/snapshot/env-keys.txt" || true
    echo "client: images only (no db.dump / uploads)" >> "$STAGE/snapshot/MANIFEST.txt"
  else
    yp_scp "$HOST:${LIVE_SNAP_REMOTE}/db.dump" "$STAGE/snapshot/db.dump" || true
    yp_scp "$HOST:${LIVE_SNAP_REMOTE}/uploads.tgz" "$STAGE/snapshot/uploads.tgz" || true
    yp_scp "$HOST:${LIVE_SNAP_REMOTE}/images.tar.gz" "$STAGE/snapshot/images.tar.gz" || true
    yp_scp "$HOST:${LIVE_SNAP_REMOTE}/env-keys.txt" "$STAGE/snapshot/env-keys.txt" || true
  fi
  yp_ssh "cat '${LIVE_SNAP_REMOTE}/MANIFEST.txt'" >> "$STAGE/snapshot/MANIFEST.txt" || true
  yp_ssh "rm -rf '${LIVE_SNAP_REMOTE}' /var/tmp/yp-devkit-live.sh" || true
  python3 - "$STAGE/VERSION.json" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
data = json.loads(p.read_text())
data["includesLiveSnapshot"] = True
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
PY
fi

mkdir -p "$OUT_DIR"
ARCHIVE="${OUT_DIR}/${NAME}.tgz"
finalize_archive "$STAGE" "$ARCHIVE"
ARCHIVE="${FINAL_ARCHIVE:-$ARCHIVE}"
ln -sfn "$ARCHIVE" "${OUT_DIR}/${KIT_PREFIX}-latest.tgz" 2>/dev/null \
  || cp -f "${ARCHIVE}.sha256" "${OUT_DIR}/${KIT_PREFIX}-latest.sha256" 2>/dev/null \
  || true
rm -rf "$STAGE"

PUBLISHED_URL=""
if [[ "$SKIP_PUBLISH" != "1" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/lib/vps.sh"
  yp_init_ssh
  PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"
  if [[ -z "$PUBLIC_ORIGIN" ]]; then
    case "$HOST" in
      *77.110.125.241*|*sea-serv*) PUBLIC_ORIGIN="https://py.idivles.ru" ;;
      *) PUBLIC_ORIGIN="https://py.idivles.ru" ;;
    esac
  fi
  HOST_IP="$(echo "$HOST" | sed -E 's/^[^@]+@//')"
  echo "==> Copy kit to VPS backups + public-dl (${PUBLIC_ORIGIN})"
  yp_scp "$ARCHIVE" "$HOST:/var/backups/sochi-portal/${NAME}.tgz"
  yp_scp "${ARCHIVE}.sha256" "$HOST:/var/backups/sochi-portal/${NAME}.tgz.sha256" || true
  yp_ssh "ln -sfn /var/backups/sochi-portal/${NAME}.tgz /var/backups/sochi-portal/${KIT_PREFIX}-latest.tgz
ln -sfn /var/backups/sochi-portal/${NAME}.tgz /var/backups/sochi-portal/youngportal-dev-kit-latest.tgz 2>/dev/null || true"
  if [[ "$CLIENT_KIT" == "1" ]]; then
    yp_ssh "ln -sfn /var/backups/sochi-portal/${NAME}.tgz /var/backups/sochi-portal/youngportal-client-kit-latest.tgz" || true
  else
    yp_ssh "ln -sfn /var/backups/sochi-portal/${NAME}.tgz /var/backups/sochi-portal/youngportal-reference-kit-latest.tgz 2>/dev/null || true" || true
  fi
  # Bootstrap со свежих скриптов репо (не только /opt)
  yp_ssh "mkdir -p /var/backups/sochi-portal/public-dl/bootstrap"
  for boot in run-install.sh yp-install.sh yp-install.env.example; do
    if [[ -f "$ROOT/scripts/$boot" ]]; then
      yp_scp "$ROOT/scripts/$boot" "$HOST:/var/backups/sochi-portal/public-dl/bootstrap/$boot"
    fi
  done
  yp_ssh "real=\$(readlink -f /var/backups/sochi-portal/${NAME}.tgz)
ln -f \"\$real\" /var/backups/sochi-portal/public-dl/${KIT_PREFIX}-latest.tgz 2>/dev/null || cp -f \"\$real\" /var/backups/sochi-portal/public-dl/${KIT_PREFIX}-latest.tgz
sha256sum /var/backups/sochi-portal/public-dl/${KIT_PREFIX}-latest.tgz | awk '{print \$1}' > /var/backups/sochi-portal/public-dl/${KIT_PREFIX}-latest.tgz.sha256
chmod a+r /var/backups/sochi-portal/public-dl/${KIT_PREFIX}-latest.tgz /var/backups/sochi-portal/public-dl/${KIT_PREFIX}-latest.tgz.sha256 /var/backups/sochi-portal/public-dl/bootstrap/* 2>/dev/null || true
echo ORIGIN_LATEST=${PUBLIC_ORIGIN}/backups/${KIT_PREFIX}-latest.tgz
echo IP_LATEST=https://${HOST_IP}/backups/${KIT_PREFIX}-latest.tgz"
  PUB_OUT="$(yp_ssh "PUBLIC_ORIGIN=${PUBLIC_ORIGIN} bash /opt/sochi-portal/scripts/publish-public-backup.sh /var/backups/sochi-portal/${NAME}.tgz" || true)"
  echo "$PUB_OUT"
  PUBLISHED_URL="$(echo "$PUB_OUT" | grep -E '^URL=' | tail -1 | cut -d= -f2- || true)"
  [[ -z "$PUBLISHED_URL" ]] && PUBLISHED_URL="${PUBLIC_ORIGIN}/backups/${KIT_PREFIX}-latest.tgz"
fi

echo "LOCAL_ARCHIVE=${ARCHIVE}"
echo "PUBLISHED_URL=${PUBLISHED_URL:-}"
echo "Done. Kit name: $NAME  version: $APP_VER  git: $GIT_BRANCH@$GIT_SHA"
