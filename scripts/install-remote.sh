#!/usr/bin/env bash
# Установка YoungPortal на ДРУГОЙ сервер «в один клик».
#
# Пароль root спрашивается ОДИН раз (или SSHPASS / SSH-ключ).
# SSH-порт на целевом сервере установщик НЕ меняет.
#
# Клиенту (чистый + первый ADMIN):
#   SSHPASS='…' bash install-remote.sh root@IP --client \
#     --prod-domain portal.example.ru --staging-domain test.example.ru \
#     --le-email ops@example.ru \
#     --admin-email admin@portal.example.ru --admin-password 'StrongPass1!'
#   # без --admin-password пароль сгенерируется на сервере
#
# Разработчику (роли / полный клон):
#   bash install-remote.sh root@IP --developer --demo \
#     --prod-domain a.example.ru --staging-domain b.example.ru --le-email ops@a.example.ru
#   bash install-remote.sh root@IP --developer --full ...
#
#   SSHPASS='пароль' bash install-remote.sh root@IP --client ...
#   bash install-remote.sh root@IP --ssh-password 'пароль' --client ...
set -euo pipefail

SELF="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
SELF_DIR="$(cd "$(dirname "$SELF")" && pwd)"

KIT_ROOT="$SELF_DIR"
if [[ -f "$SELF_DIR/START.sh" || -f "$SELF_DIR/INSTALL.sh" ]]; then
  KIT_ROOT="$SELF_DIR"
elif [[ -f "$SELF_DIR/../START.sh" ]]; then
  KIT_ROOT="$(cd "$SELF_DIR/.." && pwd)"
fi

REMOTE="${1:-}"
if [[ -n "$REMOTE" && "$REMOTE" != --* ]]; then
  shift
else
  REMOTE="${REMOTE_HOST:-}"
fi

SSH_PORT="${SSH_PORT:-22}"
VARIANT="${VARIANT:-}"
INSTALL_PROFILE="${INSTALL_PROFILE:-}"
ASSUME_YES="${ASSUME_YES:-1}"
SITE_NAME="${SITE_NAME:-Молодёжь Сочи}"
PROD_DOMAIN="${PROD_DOMAIN:-}"
STAGING_DOMAIN="${STAGING_DOMAIN:-}"
TLS_MODE="${TLS_MODE:-letsencrypt}"
LE_EMAIL="${LE_EMAIL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
MODULES="${MODULES:-all}"
MODULES_OFF="${MODULES_OFF:-}"
SEED_ORG="${SEED_ORG:-}"
SEED_PASSWORD="${SEED_PASSWORD:-InstallSeed1!}"
REINSTALL="${REINSTALL:-0}"
ARCHIVE="${ARCHIVE:-}"
DO_DOWNLOAD="${DO_DOWNLOAD:-0}"
SSH_PASSWORD="${SSH_PASSWORD:-}"
INSTALL_SSH_KEY="${INSTALL_SSH_KEY:-1}"
KIT_URL="${KIT_URL:-https://py.idivles.ru/backups/26a67d1c4229d9f5dc21da2ab7f91bfc/youngportal-org-kit-20260817-110051.tgz}"
KIT_SHA256="${KIT_SHA256:-9c192c5ed267b62b680532a83abeefe71fb1ee9d6965be0bce05c3b21364ba76}"
KIT_STORAGE_IP="${KIT_STORAGE_IP:-77.110.125.241}"

usage() { sed -n '2,22p' "$0" | sed 's/^# \?//' | sed '/^set /,$d'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --client)
      INSTALL_PROFILE=client
      VARIANT=clean
      shift
      ;;
    --developer|--dev)
      INSTALL_PROFILE=developer
      VARIANT="${VARIANT:-demo}"
      shift
      ;;
    --clean) VARIANT=clean; shift ;;
    --demo|--seeded|--with-roles) VARIANT=demo; INSTALL_PROFILE="${INSTALL_PROFILE:-developer}"; shift ;;
    --full|--with-data|--clone) VARIANT=full; INSTALL_PROFILE="${INSTALL_PROFILE:-developer}"; shift ;;
    --reinstall|--wipe) REINSTALL=1; shift ;;
    --seed-password) SEED_PASSWORD="$2"; shift 2 ;;
    --variant) VARIANT="$2"; shift 2 ;;
    --ssh-port|-p) SSH_PORT="$2"; shift 2 ;;
    --ssh-password) SSH_PASSWORD="$2"; shift 2 ;;
    --no-install-key) INSTALL_SSH_KEY=0; shift ;;
    --archive) ARCHIVE="$2"; shift 2 ;;
    --download) DO_DOWNLOAD=1; shift ;;
    --download-url) DO_DOWNLOAD=1; KIT_URL="$2"; shift 2 ;;
    --prod-domain|--domain) PROD_DOMAIN="$2"; shift 2 ;;
    --staging-domain) STAGING_DOMAIN="$2"; shift 2 ;;
    --site-name) SITE_NAME="$2"; shift 2 ;;
    --tls-mode) TLS_MODE="$2"; shift 2 ;;
    --le-email) LE_EMAIL="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --modules) MODULES="$2"; shift 2 ;;
    --modules-off) MODULES_OFF="$2"; shift 2 ;;
    --seed-org) SEED_ORG=1; shift ;;
    --no-seed-org) SEED_ORG=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; usage; exit 1 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }

[[ -n "$REMOTE" ]] || die "Укажите root@IP: bash install-remote.sh root@IP --client ..."
[[ -n "$PROD_DOMAIN" ]] || die "Нужен --prod-domain"
[[ -n "$STAGING_DOMAIN" ]] || die "Нужен --staging-domain"
[[ "$PROD_DOMAIN" != "$STAGING_DOMAIN" ]] || die "Домены теста и прода должны отличаться"

# Defaults
if [[ -z "$VARIANT" ]]; then
  if [[ "$INSTALL_PROFILE" == "client" ]]; then
    VARIANT=clean
  else
    VARIANT=full
    INSTALL_PROFILE="${INSTALL_PROFILE:-developer}"
  fi
fi
if [[ "$INSTALL_PROFILE" == "client" ]]; then
  VARIANT=clean
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@$PROD_DOMAIN}"
fi
if [[ -z "$INSTALL_PROFILE" ]]; then
  case "$VARIANT" in
    clean) INSTALL_PROFILE=client; ADMIN_EMAIL="${ADMIN_EMAIL:-admin@$PROD_DOMAIN}" ;;
    *) INSTALL_PROFILE=developer ;;
  esac
fi
if [[ "$INSTALL_PROFILE" == "client" && -z "$ADMIN_EMAIL" ]]; then
  die "Профиль client: укажите --admin-email (пароль можно не указывать — сгенерируется)"
fi

fetch_kit() {
  local dest="$1" url="${2:-$KIT_URL}"
  # shellcheck disable=SC1091
  if [[ -f "$(dirname "$0")/lib/kit-download.sh" ]]; then
    # shellcheck source=/dev/null
    source "$(dirname "$0")/lib/kit-download.sh"
  elif [[ -f "$(dirname "$0")/scripts/lib/kit-download.sh" ]]; then
    # shellcheck source=/dev/null
    source "$(dirname "$0")/scripts/lib/kit-download.sh"
  else
    die "Нет scripts/lib/kit-download.sh"
  fi
  KIT_URL="$url"
  yp_kit_fetch "$dest"
}

if [[ "$DO_DOWNLOAD" == "1" ]]; then
  DL="${ARCHIVE:-/root/youngportal-dev-kit-download.tgz}"
  echo "==> скачиваю $KIT_URL → $DL"
  mkdir -p "$(dirname "$DL")"
  fetch_kit "$DL" "$KIT_URL"
  [[ -n "$KIT_SHA256" ]] && echo "$KIT_SHA256  $DL" | sha256sum -c
  ARCHIVE="$DL"
fi

if [[ -z "$ARCHIVE" ]]; then
  if [[ -f "$KIT_ROOT/../youngportal-dev-kit.tgz" ]]; then
    ARCHIVE="$(cd "$KIT_ROOT/.." && pwd)/youngportal-dev-kit.tgz"
  elif ls "$KIT_ROOT"/../youngportal-*-kit-*.tgz >/dev/null 2>&1; then
    ARCHIVE="$(ls -t "$KIT_ROOT"/../youngportal-*-kit-*.tgz | head -1)"
  elif [[ -f /var/backups/sochi-portal/youngportal-dev-kit-latest.tgz ]]; then
    ARCHIVE=/var/backups/sochi-portal/youngportal-dev-kit-latest.tgz
  elif [[ -f /root/youngportal-dev-kit.tgz ]]; then
    ARCHIVE=/root/youngportal-dev-kit.tgz
  elif [[ -d "$KIT_ROOT/source" || -f "$KIT_ROOT/INSTALL.sh" ]]; then
    ARCHIVE=""
  else
    die "Не найден архив .tgz. Добавьте --download"
  fi
fi

# ── SSH: один пароль / ключ, мультиплекс сессии ───────────────────
CTRL_DIR="$(mktemp -d /tmp/yp-ssh-XXXXXX)"
CTRL_PATH="$CTRL_DIR/cm.sock"
cleanup_ssh() {
  ssh -O exit -o ControlPath="$CTRL_PATH" "$REMOTE" 2>/dev/null || true
  rm -rf "$CTRL_DIR"
}
trap cleanup_ssh EXIT

SSH_BASE_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=25
  -o ServerAliveInterval=30
  -o ControlMaster=auto
  -o "ControlPath=$CTRL_PATH"
  -o ControlPersist=600
  -p "$SSH_PORT"
)
SCP_BASE_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=25
  -o ControlMaster=auto
  -o "ControlPath=$CTRL_PATH"
  -o ControlPersist=600
  -P "$SSH_PORT"
)

ensure_sshpass() {
  if command -v sshpass >/dev/null 2>&1; then return 0; fi
  if [[ $(id -u) -eq 0 ]]; then
    apt-get update -y >/dev/null 2>&1 || true
    apt-get install -y sshpass >/dev/null 2>&1 || true
  fi
  command -v sshpass >/dev/null 2>&1
}

# Prefer existing key (BatchMode)
build_ssh() {
  if [[ -n "${SSHPASS:-}" ]] && ensure_sshpass; then
    SSH=(sshpass -e ssh "${SSH_BASE_OPTS[@]}" "$REMOTE")
    SCP=(sshpass -e scp "${SCP_BASE_OPTS[@]}")
  else
    SSH=(ssh "${SSH_BASE_OPTS[@]}" "$REMOTE")
    SCP=(scp "${SCP_BASE_OPTS[@]}")
  fi
}

build_ssh

echo "==> SSH $REMOTE (порт $SSH_PORT) — пароль спросится не больше одного раза"
if ! ssh "${SSH_BASE_OPTS[@]}" -o BatchMode=yes -o PreferredAuthentications=publickey \
    "$REMOTE" 'echo key_ok' >/dev/null 2>&1; then
  if [[ -z "${SSHPASS:-}" && -z "$SSH_PASSWORD" ]]; then
    echo "Нужен пароль root@$REMOTE (один раз; дальше — multiplex / ключ)."
    read -r -s -p "Пароль root: " SSH_PASSWORD
    echo
  fi
  if [[ -n "$SSH_PASSWORD" ]]; then
    export SSHPASS="$SSH_PASSWORD"
  fi
  if [[ -n "${SSHPASS:-}" ]]; then
    ensure_sshpass || die "Установите sshpass: apt-get install -y sshpass"
    build_ssh
  fi
fi

# Open master connection once
"${SSH[@]}" -o ControlMaster=yes true || die "SSH не прошёл. Проверьте пароль/порт (после прошлого kit часто 4488: -p 4488)"

# Install local pubkey so later steps / re-runs don't ask password
if [[ "$INSTALL_SSH_KEY" == "1" ]]; then
  PUB=""
  [[ -f "$HOME/.ssh/id_ed25519.pub" ]] && PUB="$HOME/.ssh/id_ed25519.pub"
  [[ -z "$PUB" && -f "$HOME/.ssh/id_rsa.pub" ]] && PUB="$HOME/.ssh/id_rsa.pub"
  if [[ -z "$PUB" ]]; then
    mkdir -p "$HOME/.ssh"
    ssh-keygen -t ed25519 -N "" -f "$HOME/.ssh/id_ed25519" >/dev/null
    PUB="$HOME/.ssh/id_ed25519.pub"
  fi
  echo "==> ставлю SSH-ключ на удалённый сервер (больше не будет спрашивать пароль)"
  PUBLINE="$(cat "$PUB")"
  "${SSH[@]}" "mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
grep -qxF '$PUBLINE' /root/.ssh/authorized_keys 2>/dev/null || echo '$PUBLINE' >> /root/.ssh/authorized_keys
# вернуть SSH на 22 если kit ранее утащил на 4488 и 22 ещё слушает — не трогаем
echo key_installed"
fi

echo "==> bootstrap пакетов"
"${SSH[@]}" 'export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl tar gzip openssl python3 rsync sshpass >/dev/null
command -v curl >/dev/null && command -v tar >/dev/null
echo bootstrap_ok'

REMOTE_TGZ=/root/youngportal-kit-upload.tgz
if [[ -n "$ARCHIVE" && -f "$ARCHIVE" ]]; then
  echo "==> scp $(basename "$ARCHIVE") → $REMOTE:$REMOTE_TGZ"
  "${SCP[@]}" "$ARCHIVE" "$REMOTE:$REMOTE_TGZ"
else
  echo "==> упаковка kit → scp"
  TMP_TGZ="/tmp/yp-remote-kit-$$.tgz"
  tar -czf "$TMP_TGZ" -C "$(dirname "$KIT_ROOT")" "$(basename "$KIT_ROOT")"
  "${SCP[@]}" "$TMP_TGZ" "$REMOTE:$REMOTE_TGZ"
  rm -f "$TMP_TGZ"
fi

VARIANT_FLAG="--full"
[[ "$VARIANT" == "clean" ]] && VARIANT_FLAG="--clean"
[[ "$VARIANT" == "demo" ]] && VARIANT_FLAG="--demo"
PROFILE_FLAG=()
[[ "$INSTALL_PROFILE" == "client" ]] && PROFILE_FLAG=(--client)
[[ "$INSTALL_PROFILE" == "developer" ]] && PROFILE_FLAG=(--developer)
REINSTALL_FLAG=()
[[ "$REINSTALL" == "1" ]] && REINSTALL_FLAG=(--reinstall)

echo "==> remote START.sh profile=$INSTALL_PROFILE $VARIANT_FLAG reinstall=$REINSTALL (SSH порт НЕ меняем)"
# shellcheck disable=SC2029
"${SSH[@]}" "bash -s" <<REMOTE
set -euo pipefail
cd /root
rm -rf /root/youngportal-kit-extract
mkdir -p /root/youngportal-kit-extract
tar -xzf "$REMOTE_TGZ" -C /root/youngportal-kit-extract
KIT=\$(find /root/youngportal-kit-extract -maxdepth 2 -type f -name START.sh | head -1)
if [[ -z "\$KIT" ]]; then
  KIT=\$(find /root/youngportal-kit-extract -maxdepth 2 -type f -name INSTALL.sh | head -1)
fi
[[ -n "\$KIT" ]] || { echo "START.sh/INSTALL.sh не найдены"; exit 1; }
DIR=\$(dirname "\$KIT")
cd "\$DIR"
export SITE_NAME=$(printf '%q' "$SITE_NAME")
export PROD_DOMAIN=$(printf '%q' "$PROD_DOMAIN")
export STAGING_DOMAIN=$(printf '%q' "$STAGING_DOMAIN")
export TLS_MODE=$(printf '%q' "$TLS_MODE")
export LE_EMAIL=$(printf '%q' "${LE_EMAIL:-ops@$PROD_DOMAIN}")
export ADMIN_EMAIL=$(printf '%q' "$ADMIN_EMAIL")
export ADMIN_PASSWORD=$(printf '%q' "$ADMIN_PASSWORD")
export SEED_PASSWORD=$(printf '%q' "$SEED_PASSWORD")
export MODULES=$(printf '%q' "$MODULES")
export MODULES_OFF=$(printf '%q' "$MODULES_OFF")
export SEED_ORG=$(printf '%q' "${SEED_ORG:-}")
export SSH_PORT=0
export LOCK_SSH=0
ARGS=(--yes --mode dual ${PROFILE_FLAG[@]+"${PROFILE_FLAG[@]}"} $VARIANT_FLAG ${REINSTALL_FLAG[@]+"${REINSTALL_FLAG[@]}"}
  --prod-domain "\$PROD_DOMAIN"
  --staging-domain "\$STAGING_DOMAIN"
  --site-name "\$SITE_NAME"
  --tls-mode "\$TLS_MODE"
  --le-email "\$LE_EMAIL"
  --ssh-port 0
  --seed-password "\$SEED_PASSWORD"
  --modules "\$MODULES"
)
[[ -n "\$MODULES_OFF" ]] && ARGS+=(--modules-off "\$MODULES_OFF")
[[ "\$SEED_ORG" == "1" ]] && ARGS+=(--seed-org)
[[ "\$SEED_ORG" == "0" ]] && ARGS+=(--no-seed-org)
[[ -n "\$ADMIN_EMAIL" ]] && ARGS+=(--admin-email "\$ADMIN_EMAIL")
[[ -n "\$ADMIN_PASSWORD" ]] && ARGS+=(--admin-password "\$ADMIN_PASSWORD")
if [[ -f START.sh ]]; then
  bash START.sh "\${ARGS[@]}"
elif [[ -f INSTALL.sh ]]; then
  bash INSTALL.sh "\${ARGS[@]}"
else
  echo "нет START.sh/INSTALL.sh"; exit 1
fi
echo "==> TLS / health smoke"
curl -sS --max-time 8 http://127.0.0.1:3000/api/health || true
echo
curl -skS --max-time 8 "https://127.0.0.1/api/health" -H "Host: \$PROD_DOMAIN" || true
echo
[[ -f /etc/yp-portal/admin-credentials.txt ]] && { echo "==> первый ADMIN:"; cat /etc/yp-portal/admin-credentials.txt; }
[[ -f /etc/yp-portal/seed-accounts.txt ]] && { echo "==> учётки ролей:"; cat /etc/yp-portal/seed-accounts.txt; }
ss -lntp | grep -E ':80|:443' || true
REMOTE

echo
echo "Готово. Пароль больше не нужен (ключ установлен)."
if [[ "$INSTALL_PROFILE" == "client" ]]; then
  echo "── Клиент: первый ADMIN ──"
  "${SSH[@]}" '[[ -f /etc/yp-portal/admin-credentials.txt ]] && cat /etc/yp-portal/admin-credentials.txt || echo "(файл ещё не создан)"'
  echo "  URL: https://${PROD_DOMAIN}"
elif [[ "$VARIANT" == "demo" ]]; then
  echo "Учётки ролей: пароль ${SEED_PASSWORD}"
  echo "  admin@${PROD_DOMAIN}  mod@${PROD_DOMAIN}  user@${PROD_DOMAIN}  …"
  echo "  (файл на сервере: /etc/yp-portal/seed-accounts.txt)"
fi
echo "  curl -sS https://${STAGING_DOMAIN}/api/health"
echo "  curl -sS https://${PROD_DOMAIN}/api/health"
echo "  ssh -p $SSH_PORT $REMOTE"
