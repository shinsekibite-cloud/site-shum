#!/usr/bin/env bash
# Надёжная установка YoungPortal на ЭТОМ сервере.
# Не ломается от переносов строк: все параметры — через файл или одну строку.
#
# Быстрый старт (скопируйте блок целиком):
#
#   curl -fsSL -o /tmp/yp-install.sh 'https://py.idivles.ru/backups/bootstrap/yp-install.sh'
#   cat > /tmp/yp-install.env <<'EOF'
#   PROFILE=client
#   VARIANT=clean
#   KIT_URL=https://py.idivles.ru/backups/youngportal-client-kit-latest.tgz
#   PROD_DOMAIN=young.example.ru
#   STAGING_DOMAIN=tyoung.example.ru
#   LE_EMAIL=you@example.ru
#   ADMIN_EMAIL=admin@young.example.ru
#   EOF
#   sudo bash /tmp/yp-install.sh /tmp/yp-install.env
#
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "==> $*"; }

ENV_FILE="${1:-}"
[[ -n "$ENV_FILE" && -f "$ENV_FILE" ]] || die "Укажите файл настроек: bash yp-install.sh /tmp/yp-install.env"

# shellcheck disable=SC1090
set -a
# strip CR, comments, blank
eval "$(sed -e 's/\r$//' -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d' "$ENV_FILE" | sed -E 's/[[:space:]]*=[[:space:]]*/=/')"
set +a

PROFILE="${PROFILE:-developer}"
VARIANT="${VARIANT:-full}"
KIT_URL="${KIT_URL:-https://py.idivles.ru/backups/youngportal-client-kit-latest.tgz}"
KIT_SHA256="${KIT_SHA256:-}"
PROD_DOMAIN="${PROD_DOMAIN:-}"
STAGING_DOMAIN="${STAGING_DOMAIN:-}"
LE_EMAIL="${LE_EMAIL:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
TLS_MODE="${TLS_MODE:-letsencrypt}"
WORK="${WORK_DIR:-/var/tmp/yp-install}"

[[ "$PROFILE" == "client" || "$PROFILE" == "developer" ]] || die "PROFILE=client|developer"
[[ -n "$PROD_DOMAIN" && -n "$STAGING_DOMAIN" && -n "$LE_EMAIL" ]] || \
  die "В env нужны PROD_DOMAIN STAGING_DOMAIN LE_EMAIL"
[[ $(id -u) -eq 0 ]] || die "Запустите от root: sudo bash $0 $ENV_FILE"

export DEBIAN_FRONTEND=noninteractive
command -v curl >/dev/null || apt-get install -y -qq curl ca-certificates
command -v sha256sum >/dev/null || apt-get install -y -qq coreutils
command -v tar >/dev/null || apt-get install -y -qq tar gzip

mkdir -p "$WORK"
ARCHIVE="$WORK/kit.tgz"

log "1/5 скачиваю kit"
curl -fkL --retry 8 --retry-delay 3 --connect-timeout 30 -o "$ARCHIVE" "$KIT_URL"
if [[ -z "$KIT_SHA256" ]]; then
  KIT_SHA256="$(curl -fkL --max-time 30 "${KIT_URL}.sha256" 2>/dev/null | awk '{print $1}' || true)"
fi
[[ -n "$KIT_SHA256" && ${#KIT_SHA256} -eq 64 ]] || die "Нет sha256 (задайте KIT_SHA256=… в env)"
echo "${KIT_SHA256}  ${ARCHIVE}" | sha256sum -c

log "2/5 распаковка"
rm -rf "$WORK/extract"
mkdir -p "$WORK/extract"
tar -xzf "$ARCHIVE" -C "$WORK/extract"
ROOT="$(find "$WORK/extract" -maxdepth 3 -type f -name START.sh -printf '%h\n' | head -n1 || true)"
[[ -n "$ROOT" ]] || ROOT="$(find "$WORK/extract" -maxdepth 3 -type f -name INSTALL.sh -printf '%h\n' | head -n1 || true)"
[[ -n "$ROOT" ]] || die "В архиве нет START.sh/INSTALL.sh"
cd "$ROOT"
chmod +x START.sh INSTALL.sh 2>/dev/null || true

# Prefer INSTALL.sh if START missing flags on very old kits
INSTALLER=./START.sh
[[ -x "$INSTALLER" ]] || INSTALLER=./INSTALL.sh
[[ -x "$INSTALLER" ]] || die "Нет исполняемого START/INSTALL"

ARGS=(--reinstall --yes --prod-domain "$PROD_DOMAIN" --staging-domain "$STAGING_DOMAIN" --le-email "$LE_EMAIL" --tls-mode "$TLS_MODE")

# Persona flags only if supported
if grep -qE -- '--client\)' START.sh INSTALL.sh 2>/dev/null; then
  ARGS+=(--"$PROFILE")
fi

case "$VARIANT" in
  full|clone) ARGS+=(--full) ;;
  demo|seed) ARGS+=(--demo) ;;
  clean|client) ARGS+=(--clean) ;;
  *) die "VARIANT=full|demo|clean" ;;
esac

if [[ "$PROFILE" == "client" ]]; then
  [[ -n "$ADMIN_EMAIL" ]] || die "Для client нужен ADMIN_EMAIL=…"
  ARGS+=(--admin-email "$ADMIN_EMAIL")
  [[ -n "$ADMIN_PASSWORD" ]] && ARGS+=(--admin-password "$ADMIN_PASSWORD")
fi

log "3/5 установка: $INSTALLER ${ARGS[*]}"
set +e
bash "$INSTALLER" "${ARGS[@]}"
RC=$?
set -e

log "4/5 проверка"
META=/etc/yp-portal/install-meta.json
if [[ -f "$META" ]]; then
  echo "---- install-meta ----"
  cat "$META"
  echo "----------------------"
else
  echo "WARN: нет $META (код выхода установщика=$RC)"
fi

echo "---- docker ----"
docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | grep -E 'NAMES|sochi' || docker ps
echo "---- health ----"
for d in "$PROD_DOMAIN" "$STAGING_DOMAIN"; do
  echo -n "$d: "
  curl -skS --max-time 15 "https://${d}/api/health" || echo FAIL
  echo
done

if [[ $RC -ne 0 ]]; then
  die "Установщик завершился с кодом $RC — смотрите вывод выше"
fi

log "5/5 TLS"
TLS_EFF="$(python3 -c "import json;print(json.load(open('$META')).get('tlsEffective',''))" 2>/dev/null || true)"
if [[ "$TLS_EFF" == "selfsigned" || "$TLS_EFF" == "" ]]; then
  echo "Сейчас self-signed или TLS не подтверждён."
  echo "Когда DNS: одна A → $(hostname -I | awk '{print $1}') на оба домена, выполните:"
  echo "  bash /opt/sochi-portal/scripts/fix-tls-after-kit.sh"
fi

echo
echo "SUCCESS: YoungPortal установлен."
echo "  Прод:  https://${PROD_DOMAIN}"
echo "  Тест:  https://${STAGING_DOMAIN}"
