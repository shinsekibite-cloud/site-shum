#!/usr/bin/env bash
# YoungPortal — ОДИН КЛИК. Запускайте из корня распакованного архива:
#   sudo bash START.sh
#
# Профили:
#   --client       клиенту: чистая БД + первый ADMIN
#   --developer    разработчику: роли (--demo) или клон (--full)
#
# Также:
#   --clean / --demo / --full / --reinstall
#   --remote root@IP   установка на другой сервер по SSH
#
# Клиент по SSH (с машины разработчика):
#   sudo bash START.sh --client --remote root@IP \
#     --prod-domain portal.example.ru --staging-domain test.example.ru \
#     --admin-email admin@portal.example.ru --admin-password 'StrongPass1!'
#
# Разработчик локально:
#   sudo bash START.sh --developer --demo --yes \
#     --prod-domain a.example.ru --staging-domain b.example.ru
set -euo pipefail

SELF="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
SELF_DIR="$(cd "$(dirname "$SELF")" && pwd)"

KIT_ROOT="$SELF_DIR"
if [[ ! -f "$KIT_ROOT/INSTALL.sh" && -f "$SELF_DIR/../INSTALL.sh" ]]; then
  KIT_ROOT="$(cd "$SELF_DIR/.." && pwd)"
fi
if [[ ! -f "$KIT_ROOT/INSTALL.sh" && -f "$SELF_DIR/scripts/install-dev-stack.sh" ]]; then
  KIT_ROOT="$SELF_DIR"
fi

VARIANT="${VARIANT:-}"
INSTALL_PROFILE="${INSTALL_PROFILE:-}"
REMOTE_HOST="${REMOTE_HOST:-}"
SSH_PORT="${SSH_PORT:-22}"
ASSUME_YES="${ASSUME_YES:-0}"
PROD_DOMAIN="${PROD_DOMAIN:-${DOMAIN:-}}"
STAGING_DOMAIN="${STAGING_DOMAIN:-}"
SITE_NAME="${SITE_NAME:-Молодёжь Сочи}"
TLS_MODE="${TLS_MODE:-letsencrypt}"
LE_EMAIL="${LE_EMAIL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
MODULES="${MODULES:-all}"
MODULES_OFF="${MODULES_OFF:-}"
SEED_ORG="${SEED_ORG:-}"
SEED_PASSWORD="${SEED_PASSWORD:-InstallSeed1!}"
REINSTALL="${REINSTALL:-0}"
EXTRA_ARGS=()

usage() { sed -n '2,24p' "$0" | sed 's/^# \?//' | sed '/^set /,$d'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --client)
      INSTALL_PROFILE=client
      VARIANT="${VARIANT:-clean}"
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
    --remote) REMOTE_HOST="$2"; shift 2 ;;
    --ssh-port|-p) SSH_PORT="$2"; shift 2 ;;
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
    *) EXTRA_ARGS+=("$1"); shift ;;
  esac
done

HAS_DATA=0
if [[ -f "$KIT_ROOT/snapshot/db.dump" || -f "$KIT_ROOT/snapshot/uploads.tgz" || -f "$KIT_ROOT/snapshot/images.tar.gz" ]]; then
  HAS_DATA=1
fi

die() { echo "ERROR: $*" >&2; exit 1; }

prompt_admin_if_client() {
  if [[ "$INSTALL_PROFILE" != "client" ]]; then return 0; fi
  if [[ -z "$ADMIN_EMAIL" ]]; then
    if [[ "$ASSUME_YES" == "1" ]]; then
      ADMIN_EMAIL="admin@${PROD_DOMAIN:-portal.example.ru}"
    else
      read -r -p "Email первого админа [admin@${PROD_DOMAIN:-portal.example.ru}]: " ae || true
      ADMIN_EMAIL="${ae:-admin@${PROD_DOMAIN:-portal.example.ru}}"
    fi
  fi
  if [[ -z "$ADMIN_PASSWORD" && "$ASSUME_YES" != "1" ]]; then
    read -r -s -p "Пароль админа (пусто = сгенерировать на сервере): " ADMIN_PASSWORD || true
    echo
  fi
}

if [[ -z "$VARIANT" && -z "$REMOTE_HOST" && -z "$INSTALL_PROFILE" ]]; then
  if [[ "$ASSUME_YES" == "1" ]]; then
    INSTALL_PROFILE=developer
    if [[ "$HAS_DATA" == "1" ]]; then VARIANT=full; else VARIANT=demo; fi
  else
    echo
    echo "════════════════════════════════════════════════════════════"
    echo "  YoungPortal — установка"
    echo "════════════════════════════════════════════════════════════"
    echo
    echo "  ── Клиент ──"
    echo "  1) На ЭТОМ сервере: чистый проект + первый ADMIN"
    echo "  2) На ДРУГОЙ сервер по SSH: чистый + первый ADMIN"
    echo
    echo "  ── Разработчик ──"
    echo "  3) На этом сервере: чистый + учётки всех ролей"
    echo "  4) На этом сервере: полный клон данных"
    if [[ "$HAS_DATA" != "1" ]]; then
      echo "     ⚠ в этом архиве нет snapshot/ — будет как п.3"
    fi
    echo "  5) На другой сервер по SSH (роли или полный клон)"
    echo
    echo "  ── Служебное ──"
    echo "  6) Полная переустановка на ЭТОМ сервере (wipe + выбор)"
    echo
    choice=""
    read -r -p "Выбор [1]: " choice || true
    case "${choice:-1}" in
      1)
        INSTALL_PROFILE=client
        VARIANT=clean
        ;;
      2)
        INSTALL_PROFILE=client
        VARIANT=clean
        read -r -p "SSH (например root@77.110.125.241): " REMOTE_HOST
        [[ -n "$REMOTE_HOST" ]] || die "Нужен root@IP"
        read -r -p "Порт SSH [22]: " SSH_PORT_IN || true
        SSH_PORT="${SSH_PORT_IN:-22}"
        ;;
      3)
        INSTALL_PROFILE=developer
        VARIANT=demo
        ;;
      4)
        INSTALL_PROFILE=developer
        VARIANT=full
        ;;
      5)
        INSTALL_PROFILE=developer
        read -r -p "SSH (например root@77.110.125.241): " REMOTE_HOST
        [[ -n "$REMOTE_HOST" ]] || die "Нужен root@IP"
        read -r -p "Порт SSH [22]: " SSH_PORT_IN || true
        SSH_PORT="${SSH_PORT_IN:-22}"
        echo "Вариант на удалённом:"
        echo "  1) роли (--demo)   2) полный клон   3) wipe+роли   4) wipe+полный"
        rv=""
        read -r -p "Выбор [1]: " rv || true
        case "${rv:-1}" in
          2) VARIANT=full ;;
          3) VARIANT=demo; REINSTALL=1 ;;
          4) VARIANT=full; REINSTALL=1 ;;
          *) VARIANT=demo ;;
        esac
        ;;
      6)
        REINSTALL=1
        echo "Что поставить после wipe:"
        echo "  1) клиент (чистый+админ)  2) роли  3) полный клон"
        rv=""
        read -r -p "Выбор [1]: " rv || true
        case "${rv:-1}" in
          2) INSTALL_PROFILE=developer; VARIANT=demo ;;
          3) INSTALL_PROFILE=developer; VARIANT=full ;;
          *) INSTALL_PROFILE=client; VARIANT=clean ;;
        esac
        ;;
      *)
        INSTALL_PROFILE=client
        VARIANT=clean
        ;;
    esac
  fi
fi

# Defaults when only profile given
if [[ -z "$VARIANT" ]]; then
  case "$INSTALL_PROFILE" in
    client) VARIANT=clean ;;
    developer) VARIANT=demo ;;
    *) VARIANT=demo ;;
  esac
fi
[[ -n "$INSTALL_PROFILE" ]] || {
  case "$VARIANT" in
    clean) INSTALL_PROFILE=client ;;
    *) INSTALL_PROFILE=developer ;;
  esac
}

if [[ "$VARIANT" == "full" && "$HAS_DATA" != "1" ]]; then
  echo "WARN: выбран полный клон, но snapshot/ пуст — ставлю demo (роли)"
  VARIANT=demo
fi
if [[ "$INSTALL_PROFILE" == "client" ]]; then
  VARIANT=clean
fi

need_domains() {
  if [[ -n "$PROD_DOMAIN" && -n "$STAGING_DOMAIN" ]]; then return 1; fi
  return 0
}

reject_bad_domain() {
  local d="$1" label="$2"
  [[ -n "$d" ]] || die "$label: нужен домен"
  case "$d" in
    *example.com|*example.ru|portal.example.ru|test.example.ru|localhost)
      die "$label: укажите реальный домен (не $d)" ;;
  esac
  [[ "$d" == *.* ]] || die "$label: домен должен содержать точку"
}

if [[ "$ASSUME_YES" == "1" ]]; then
  [[ -n "$PROD_DOMAIN" && -n "$STAGING_DOMAIN" ]] || \
    die "С --yes укажите --prod-domain и --staging-domain"
fi

if [[ "$ASSUME_YES" != "1" ]] && need_domains; then
  echo
  read -r -p "Домен ПРОДА (без https://): " pd || true
  PROD_DOMAIN="$(echo "${pd:-}" | sed 's|^https\?://||;s|/.*||')"
  read -r -p "Домен ТЕСТА (без https://): " sd || true
  STAGING_DOMAIN="$(echo "${sd:-}" | sed 's|^https\?://||;s|/.*||')"
  if [[ -z "$LE_EMAIL" && "$TLS_MODE" == "letsencrypt" ]]; then
    read -r -p "Email для Let's Encrypt [ops@${PROD_DOMAIN}]: " le || true
    LE_EMAIL="${le:-ops@${PROD_DOMAIN}}"
  fi
fi

reject_bad_domain "$PROD_DOMAIN" "Прод"
reject_bad_domain "$STAGING_DOMAIN" "Тест"
[[ "$PROD_DOMAIN" != "$STAGING_DOMAIN" ]] || die "Домены прод и тест должны отличаться"

prompt_admin_if_client

if [[ -n "$REMOTE_HOST" ]]; then
  REMOTE="$KIT_ROOT/install-remote.sh"
  [[ -f "$REMOTE" ]] || REMOTE="$KIT_ROOT/scripts/install-remote.sh"
  [[ -f "$REMOTE" ]] || die "Нет install-remote.sh в комплекте"
  RARGS=(
    "$REMOTE_HOST"
    --ssh-port "$SSH_PORT"
    --variant "$VARIANT"
    --yes
    --site-name "$SITE_NAME"
    --prod-domain "$PROD_DOMAIN"
    --staging-domain "$STAGING_DOMAIN"
    --tls-mode "$TLS_MODE"
  )
  # --client/--developer только если remote их понимает
  if grep -qE -- '--client\)' "$REMOTE" 2>/dev/null; then
    [[ "$INSTALL_PROFILE" == "client" ]] && RARGS+=(--client)
    [[ "$INSTALL_PROFILE" == "developer" ]] && RARGS+=(--developer)
  fi
  [[ "$REINSTALL" == "1" ]] && RARGS+=(--reinstall)
  [[ -n "$LE_EMAIL" ]] && RARGS+=(--le-email "$LE_EMAIL")
  [[ -n "$SEED_PASSWORD" ]] && RARGS+=(--seed-password "$SEED_PASSWORD")
  [[ -n "$ADMIN_EMAIL" ]] && RARGS+=(--admin-email "$ADMIN_EMAIL")
  [[ -n "$ADMIN_PASSWORD" ]] && RARGS+=(--admin-password "$ADMIN_PASSWORD")
  RARGS+=(--modules "$MODULES")
  [[ -n "$MODULES_OFF" ]] && RARGS+=(--modules-off "$MODULES_OFF")
  [[ "$SEED_ORG" == "1" ]] && RARGS+=(--seed-org)
  [[ "$SEED_ORG" == "0" ]] && RARGS+=(--no-seed-org)
  RARGS+=("${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")
  exec bash "$REMOTE" "${RARGS[@]}"
fi

INSTALLER="$KIT_ROOT/INSTALL.sh"
[[ -f "$INSTALLER" ]] || INSTALLER="$KIT_ROOT/scripts/install-dev-stack.sh"
[[ -f "$INSTALLER" ]] || die "Нет INSTALL.sh / install-dev-stack.sh"

if [[ $(id -u) -ne 0 ]]; then
  die "Запустите от root: sudo bash START.sh"
fi

ARGS=(--yes --mode dual --ssh-port 0)
# Старые INSTALL.sh не знают --client/--developer → не передаём (иначе «Неизвестный аргумент»)
if grep -qE -- '--client\)' "$INSTALLER" 2>/dev/null; then
  [[ "$INSTALL_PROFILE" == "client" ]] && ARGS+=(--client)
  [[ "$INSTALL_PROFILE" == "developer" ]] && ARGS+=(--developer)
fi
case "$VARIANT" in
  clean) ARGS+=(--clean) ;;
  demo) ARGS+=(--demo --seed-password "$SEED_PASSWORD") ;;
  full) ARGS+=(--full) ;;
esac
[[ "$REINSTALL" == "1" ]] && ARGS+=(--reinstall)
ARGS+=(--site-name "$SITE_NAME")
ARGS+=(--prod-domain "$PROD_DOMAIN")
ARGS+=(--staging-domain "$STAGING_DOMAIN")
ARGS+=(--tls-mode "$TLS_MODE")
[[ -n "$LE_EMAIL" ]] && ARGS+=(--le-email "$LE_EMAIL")
[[ -n "$ADMIN_EMAIL" ]] && ARGS+=(--admin-email "$ADMIN_EMAIL")
[[ -n "$ADMIN_PASSWORD" ]] && ARGS+=(--admin-password "$ADMIN_PASSWORD")
ARGS+=(--modules "$MODULES")
[[ -n "$MODULES_OFF" ]] && ARGS+=(--modules-off "$MODULES_OFF")
[[ "$SEED_ORG" == "1" ]] && ARGS+=(--seed-org)
[[ "$SEED_ORG" == "0" ]] && ARGS+=(--no-seed-org)
ARGS+=("${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")

echo
echo "==> Профиль: $INSTALL_PROFILE  вариант: $VARIANT  reinstall=$REINSTALL"
echo "    прод=$PROD_DOMAIN  тест=$STAGING_DOMAIN  TLS=$TLS_MODE modules=$MODULES"
exec bash "$INSTALLER" "${ARGS[@]}"
