#!/usr/bin/env bash
# One-file bootstrap for new VPS: download kit + install.
# Prefer ONE LINE or env vars — line breaks without \ break the command.
#
# ── Рекомендуется (одна строка) ──
#   sudo bash /tmp/run-install.sh developer --kit-url 'https://176.124.204.53/backups/youngportal-reference-kit-latest.tgz' --prod-domain py.idivles.ru --staging-domain ty.idivles.ru --le-email you@mail.ru --demo
#
# ── Или через переменные (переносы безопасны) ──
#   export KIT_URL='https://176.124.204.53/backups/youngportal-reference-kit-latest.tgz'
#   export PROD_DOMAIN=py.idivles.ru
#   export STAGING_DOMAIN=ty.idivles.ru
#   export LE_EMAIL=you@mail.ru
#   sudo -E bash /tmp/run-install.sh developer --demo
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }
need_root() { [[ ${EUID:-$(id -u)} -eq 0 ]] || die "Run as root (sudo)"; }

PROFILE="${1:-}"
shift || true
[[ "$PROFILE" == "client" || "$PROFILE" == "developer" ]] || {
  cat <<'EOF' >&2
Usage (ОДНА строка — без переносов без \):

  sudo bash /tmp/run-install.sh developer --kit-url 'URL' --prod-domain D --staging-domain D --le-email E --demo

Или переменные (переносы OK):

  export KIT_URL='https://176.124.204.53/backups/youngportal-reference-kit-latest.tgz'
  export PROD_DOMAIN=py.idivles.ru STAGING_DOMAIN=ty.idivles.ru LE_EMAIL=you@mail.ru
  sudo -E bash /tmp/run-install.sh developer --demo

Client:  ... client ... --admin-email admin@...
Developer: --demo | --full
EOF
  exit 1
}

# Defaults from env (safe with line breaks / paste)
KIT_URL="${KIT_URL:-}"
SHA="${KIT_SHA256:-${SHA256:-}}"
PROD="${PROD_DOMAIN:-}"
STAGING="${STAGING_DOMAIN:-}"
LE="${LE_EMAIL:-}"
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kit-url) KIT_URL="${2:-}"; shift 2 ;;
    --sha256) SHA="${2:-}"; shift 2 ;;
    --prod-domain) PROD="${2:-}"; shift 2 ;;
    --staging-domain) STAGING="${2:-}"; shift 2 ;;
    --le-email) LE="${2:-}"; shift 2 ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

if [[ -z "$KIT_URL" || -z "$PROD" || -z "$STAGING" || -z "$LE" ]]; then
  cat <<EOF >&2
ERROR: Need --kit-url --prod-domain --staging-domain --le-email
  (или те же имена в env: KIT_URL PROD_DOMAIN STAGING_DOMAIN LE_EMAIL)

Сейчас: kit-url='${KIT_URL:-∅}' prod='${PROD:-∅}' staging='${STAGING:-∅}' le='${LE:-∅}'

Частая ошибка: аргументы с новой строки БЕЗ \\ в конце —
тогда bash выполняет только «… developer», а --kit-url становится отдельной командой.

Скопируйте ОДНОЙ строкой или используйте export + sudo -E.
EOF
  exit 1
fi

need_root
export DEBIAN_FRONTEND=noninteractive
command -v curl >/dev/null 2>&1 || apt-get install -y -qq curl ca-certificates >/dev/null
command -v sha256sum >/dev/null 2>&1 || apt-get install -y -qq coreutils >/dev/null

# Если sha не указан — пробуем sidecar URL.sha256
if [[ -z "$SHA" ]]; then
  echo "==> sha256 не указан — читаю ${KIT_URL}.sha256"
  SHA="$(curl -fkL --max-time 30 "${KIT_URL}.sha256" 2>/dev/null | awk '{print $1}')" || true
  [[ -n "$SHA" && ${#SHA} -eq 64 ]] || die "Need --sha256 (или опубликуйте ${KIT_URL}.sha256)"
fi

WORKDIR="/var/tmp/yp-run-install/${PROFILE}-${SHA:0:16}"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
ARCHIVE="$WORKDIR/kit.tgz"

echo "==> Download kit"
curl -fkL --retry 5 --retry-delay 2 --connect-timeout 20 -o "$ARCHIVE" "$KIT_URL"
GOT="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[[ "$GOT" == "$SHA" ]] || die "sha256 mismatch: got=$GOT expected=$SHA"

echo "==> Extract"
tar -xzf "$ARCHIVE" -C "$WORKDIR"
ROOT="$(find "$WORKDIR" -maxdepth 3 -type f \( -name START.sh -o -name INSTALL.sh \) -printf '%h\n' | head -n1 || true)"
[[ -n "$ROOT" ]] || die "START.sh/INSTALL.sh not found in archive"
cd "$ROOT"
chmod +x START.sh INSTALL.sh 2>/dev/null || true

ARGS=(--reinstall --yes --prod-domain "$PROD" --staging-domain "$STAGING" --le-email "$LE")
if grep -qE -- '--client\)' START.sh INSTALL.sh 2>/dev/null; then
  ARGS+=(--"$PROFILE")
fi
ARGS+=("${EXTRA[@]}")

echo "==> Install ($PROFILE)"
if [[ -x ./START.sh ]]; then
  bash ./START.sh "${ARGS[@]}"
elif [[ -x ./INSTALL.sh ]]; then
  bash ./INSTALL.sh "${ARGS[@]}"
else
  die "No executable START.sh/INSTALL.sh"
fi

echo
echo "OK. If TLS is self-signed, after DNS is a single A to this server:"
echo "  bash /opt/sochi-portal/scripts/fix-tls-after-kit.sh"
