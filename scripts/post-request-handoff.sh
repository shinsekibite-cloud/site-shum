#!/usr/bin/env bash
# Post-request handoff (mandatory after finishing a user task):
#   1) clean junk (tmp archives, stale local kits)
#   2) full source backup (make-full-backup.sh)
#   3) sale source kit + portable kit
#   4) org kit with live VPS snapshot + deploy docs
#   5) publish kits / update download-kit URLs when publish succeeds
#
# Usage:
#   bash scripts/post-request-handoff.sh
#   SKIP_ORG_LIVE=1 bash scripts/post-request-handoff.sh   # source kits only
#   SKIP_PUBLISH=1 bash scripts/post-request-handoff.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/vps.sh"

OUT_DIR="${ARTIFACTS_DIR:-$ROOT/artifacts}"
mkdir -p "$OUT_DIR" /tmp
STAMP="$(date -u +%Y%m%d-%H%M%S)"
SKIP_ORG_LIVE="${SKIP_ORG_LIVE:-0}"
SKIP_PUBLISH="${SKIP_PUBLISH:-0}"
SKIP_CLEAN="${SKIP_CLEAN:-0}"

echo "==> [1/5] Clean junk"
if [[ "$SKIP_CLEAN" != "1" ]]; then
  rm -f /tmp/yp-promote-*.tgz /tmp/yp-staging-*.tgz /var/tmp/yp-promote-*.tgz /var/tmp/yp-promote-remote-*.sh 2>/dev/null || true
  # Keep only the newest archive per kit family under artifacts/
  if [[ -d "$OUT_DIR" ]]; then
    python3 - <<'PY' "$OUT_DIR"
import os, re, sys
from pathlib import Path
root = Path(sys.argv[1])
pat = re.compile(r"^(youngportal-(?:org-kit|sale-source|portable-dev|client-kit|reference-kit|dev-kit|source-full))-(\d{8}-\d{6})\.tgz$")
groups = {}
for p in root.iterdir():
    if not p.is_file() or not p.name.endswith(".tgz"):
        continue
    m = pat.match(p.name)
    if not m:
        continue
    groups.setdefault(m.group(1), []).append((m.group(2), p))
for prefix, items in groups.items():
    items.sort(key=lambda x: x[0], reverse=True)
    for stamp, path in items[1:]:
        print(f"prune {path.name}")
        path.unlink(missing_ok=True)
        path.with_suffix(path.suffix + ".sha256").unlink(missing_ok=True) if False else None
        sha = Path(str(path) + ".sha256")
        sha.unlink(missing_ok=True)
PY
  fi
fi

echo "==> [2/5] Full source backup"
ARTIFACTS_DIR="$OUT_DIR" bash "$ROOT/scripts/make-full-backup.sh"

echo "==> [3/5] Sale source + portable kits"
PACK_PUBLISH_ARGS=()
if [[ "$SKIP_PUBLISH" == "1" ]]; then
  PACK_PUBLISH_ARGS+=(--skip-publish)
fi
KIT_PREFIX=youngportal-sale-source bash "$ROOT/scripts/pack-dev-deploy-kit.sh" --out-dir "$OUT_DIR" --stamp "$STAMP" "${PACK_PUBLISH_ARGS[@]}"
KIT_PREFIX=youngportal-portable-dev bash "$ROOT/scripts/pack-dev-deploy-kit.sh" --out-dir "$OUT_DIR" --stamp "$STAMP" "${PACK_PUBLISH_ARGS[@]}"

ORG_URL=""
SALE_URL=""
PORTABLE_URL=""
ORG_SHA=""
SALE_SHA=""
PORTABLE_SHA=""

read_sha() {
  local f="$1"
  if [[ -f "${f}.sha256" ]]; then
    awk '{print $1}' "${f}.sha256"
  else
    sha256sum "$f" | awk '{print $1}'
  fi
}

SALE_ARC="$OUT_DIR/youngportal-sale-source-${STAMP}.tgz"
PORTABLE_ARC="$OUT_DIR/youngportal-portable-dev-${STAMP}.tgz"
SALE_SHA="$(read_sha "$SALE_ARC")"
PORTABLE_SHA="$(read_sha "$PORTABLE_ARC")"

echo "==> [4/5] Org kit (with live snapshot unless SKIP_ORG_LIVE=1)"
if [[ "$SKIP_ORG_LIVE" == "1" ]]; then
  KIT_PREFIX=youngportal-org-kit bash "$ROOT/scripts/pack-dev-deploy-kit.sh" --out-dir "$OUT_DIR" --stamp "$STAMP" "${PACK_PUBLISH_ARGS[@]}"
else
  KIT_PREFIX=youngportal-org-kit bash "$ROOT/scripts/pack-dev-deploy-kit.sh" --with-live --out-dir "$OUT_DIR" --stamp "$STAMP" "${PACK_PUBLISH_ARGS[@]}"
fi
ORG_ARC="$OUT_DIR/youngportal-org-kit-${STAMP}.tgz"
ORG_SHA="$(read_sha "$ORG_ARC")"

# Best-effort: pull published URLs from latest publish markers if present on VPS
if [[ "$SKIP_PUBLISH" != "1" ]]; then
  yp_init_ssh || true
  if [[ -n "${SSH:-}" ]]; then
    PUBLISH_NOTE="$(yp_ssh "ls -1t /var/backups/sochi-portal/public-dl/*.url 2>/dev/null | head -5; ls -lh /var/backups/sochi-portal/youngportal-*-latest.tgz 2>/dev/null" || true)"
    echo "$PUBLISH_NOTE"
  fi
fi

echo "==> [5/5] Write handoff manifest"
MANIFEST="$OUT_DIR/HANDOFF-${STAMP}.txt"
cat > "$MANIFEST" <<EOF
YoungPortal post-request handoff ${STAMP}
=======================================
Git: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown) @ $(git rev-parse --short HEAD 2>/dev/null || echo unknown)

Artifacts (local):
  Full backup:   ${OUT_DIR}/youngportal-full-backup-latest.tgz
  Sale source:   ${SALE_ARC}
                 sha256=${SALE_SHA}
  Portable:      ${PORTABLE_ARC}
                 sha256=${PORTABLE_SHA}
  Org kit:       ${ORG_ARC}
                 sha256=${ORG_SHA}

Deploy (new VPS):
  See docs/ORG-HANDOFF.md and docs/REMOTE-DEPLOY.md
  KIT_PROFILE=org|sale|portable bash scripts/download-kit.sh

Also run on VPS after promote (live DB+uploads):
  bash /opt/sochi-portal/scripts/full-backup.sh
EOF

ln -sfn "$MANIFEST" "$OUT_DIR/HANDOFF-latest.txt"
echo "MANIFEST=$MANIFEST"
echo "HANDOFF_DONE stamp=$STAMP"
ls -lh "$SALE_ARC" "$PORTABLE_ARC" "$ORG_ARC" "$OUT_DIR/youngportal-full-backup-latest.tgz" 2>/dev/null || true
