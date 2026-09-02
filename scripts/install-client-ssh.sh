#!/usr/bin/env bash
# YoungPortal — установка КЛИЕНТУ по SSH одной командой.
#
# С машины разработчика (нужен curl или wget):
#
#   SSHPASS='пароль-root' bash scripts/install-client-ssh.sh root@IP \
#     --prod-domain portal.example.ru \
#     --staging-domain test.example.ru \
#     --le-email ops@example.ru \
#     --admin-email admin@portal.example.ru
#
# Опции:
#   -p PORT | --ssh-port PORT   (если SSH не на 22)
#   --admin-password '…'        (иначе сгенерируется на сервере)
#   --reinstall                 полная переустановка
#   --site-name '…'
#   KIT_URL=https://…           свой архив (по умолчанию — опубликованный client/reference kit)
#
# Что ставится: чистый проект (тест+прод), первый ADMIN, без docs разработчика.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Prefer dedicated client kit URL when set; fall back to reference kit (scripts overlay still applies)
KIT_URL="${KIT_URL:-${CLIENT_KIT_URL:-https://77.110.125.241/backups/98c517ba79be6e0a8f82a63293dbc64c/youngportal-client-kit-20260815-100750.tgz}}"
KIT_SHA256="${KIT_SHA256:-${CLIENT_KIT_SHA256:-fc3711f8a3f7f4e806e67349413a2a49ac908b7a2908e1ecfde018b42e026a1d}}"
KIT_STORAGE_IP="${KIT_STORAGE_IP:-77.110.125.241}"

die() { echo "ERROR: $*" >&2; exit 1; }

usage() { sed -n '2,22p' "$0" | sed 's/^# \?//' | sed '/^set /,$d'; }

REMOTE=""
SSH_PORT=22
PROD_DOMAIN=""
STAGING_DOMAIN=""
LE_EMAIL=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
SITE_NAME="${SITE_NAME:-Молодёжь Сочи}"
REINSTALL=0
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -p|--ssh-port) SSH_PORT="$2"; shift 2 ;;
    --prod-domain|--domain) PROD_DOMAIN="$2"; shift 2 ;;
    --staging-domain) STAGING_DOMAIN="$2"; shift 2 ;;
    --le-email) LE_EMAIL="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --site-name) SITE_NAME="$2"; shift 2 ;;
    --reinstall|--wipe) REINSTALL=1; shift ;;
    --kit-url) KIT_URL="$2"; shift 2 ;;
    --kit-sha256) KIT_SHA256="$2"; shift 2 ;;
    root@*|ubuntu@*|*@*)
      [[ -z "$REMOTE" ]] || die "Два remote: $REMOTE и $1"
      REMOTE="$1"; shift
      ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

[[ -n "$REMOTE" ]] || die "Укажите root@IP
Пример:
  SSHPASS='…' bash scripts/install-client-ssh.sh root@77.110.125.241 \\
    --prod-domain portal.example.ru --staging-domain test.example.ru \\
    --le-email ops@example.ru --admin-email admin@portal.example.ru"

[[ -n "$PROD_DOMAIN" ]] || die "Нужен --prod-domain"
[[ -n "$STAGING_DOMAIN" ]] || die "Нужен --staging-domain"
[[ "$PROD_DOMAIN" != "$STAGING_DOMAIN" ]] || die "Домены должны отличаться"
LE_EMAIL="${LE_EMAIL:-ops@$PROD_DOMAIN}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@$PROD_DOMAIN}"

# Ensure curl on this machine for install-from-url
if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  if [[ $(id -u) -eq 0 ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y >/dev/null
    apt-get install -y curl ca-certificates >/dev/null
  else
    die "Нужен curl или wget"
  fi
fi

FROM_URL="$ROOT/scripts/install-from-url.sh"
[[ -f "$FROM_URL" ]] || die "Нет $FROM_URL"

ARGS=(
  "$REMOTE"
  -p "$SSH_PORT"
  --client
  --prod-domain "$PROD_DOMAIN"
  --staging-domain "$STAGING_DOMAIN"
  --le-email "$LE_EMAIL"
  --site-name "$SITE_NAME"
  --admin-email "$ADMIN_EMAIL"
)
[[ -n "$ADMIN_PASSWORD" ]] && ARGS+=(--admin-password "$ADMIN_PASSWORD")
[[ "$REINSTALL" == "1" ]] && ARGS+=(--reinstall)
ARGS+=("${EXTRA[@]+"${EXTRA[@]}"}")

echo "════════════════════════════════════════════════════"
echo "  YoungPortal — установка КЛИЕНТУ по SSH"
echo "  remote:   $REMOTE  port=$SSH_PORT"
echo "  прод:     https://$PROD_DOMAIN"
echo "  тест:     https://$STAGING_DOMAIN"
echo "  админ:    $ADMIN_EMAIL"
echo "  kit:      $KIT_URL"
echo "════════════════════════════════════════════════════"

export KIT_URL
export KIT_SHA256
export KIT_STORAGE_IP
exec env KIT_URL="$KIT_URL" KIT_SHA256="$KIT_SHA256" KIT_STORAGE_IP="$KIT_STORAGE_IP" bash "$FROM_URL" "${ARGS[@]}"
