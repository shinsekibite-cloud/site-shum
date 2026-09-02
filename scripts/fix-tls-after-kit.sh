#!/usr/bin/env bash
# Починить HTTPS / ACME после kit.
# Домены берутся из аргументов / env / /etc/yp-portal/install-meta.json
#
#   bash fix-tls-after-kit.sh
#   PROD_DOMAIN=a.ru STAGING_DOMAIN=b.ru LE_EMAIL=ops@a.ru bash fix-tls-after-kit.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
META=/etc/yp-portal/install-meta.json

# defaults from install-meta if present
if [[ -f "$META" ]]; then
  eval "$(python3 - <<'PY'
import json
try:
  d=json.load(open("/etc/yp-portal/install-meta.json"))
  for k,env in [("prodDomain","PROD_DOMAIN"),("stagingDomain","STAGING_DOMAIN"),("leEmail","LE_EMAIL"),("siteName","SITE_NAME")]:
    v=d.get(k) or ""
    if v:
      print(f'{env}={v!r}')
except Exception:
  pass
PY
)" 2>/dev/null || true
fi

PROD_DOMAIN="${PROD_DOMAIN:-}"
STAGING_DOMAIN="${STAGING_DOMAIN:-}"
LE_EMAIL="${LE_EMAIL:-}"
SITE_NAME="${SITE_NAME:-Молодёжь Сочи}"

die() { echo "ERROR: $*" >&2; exit 1; }
[[ -n "$PROD_DOMAIN" ]] || die "Укажите PROD_DOMAIN=… (или поставьте заново — пишется в $META)"
[[ -n "$STAGING_DOMAIN" ]] || die "Укажите STAGING_DOMAIN=…"
LE_EMAIL="${LE_EMAIL:-ops@$PROD_DOMAIN}"

echo "==> IP этого сервера: $(hostname -I | awk '{print $1}')"
echo "==> DNS сейчас:"
for d in "$PROD_DOMAIN" "$STAGING_DOMAIN"; do
  echo -n "  $d → "
  getent ahostsv4 "$d" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' '
  echo
done
echo

disable_conflicts() {
  local domains=("$@") f base d
  shopt -s nullglob
  for f in /etc/nginx/sites-enabled/*; do
    base="$(basename "$f")"
    [[ "$base" == "sochi-portal" || "$base" == "yp-kit-download-ip" ]] && continue
    for d in "${domains[@]}"; do
      if grep -qE "server_name[[:space:]]+.*\b${d}\b" "$f" 2>/dev/null; then
        echo "  disable sites-enabled/$base (conflict $d)"
        rm -f "$f"
        break
      fi
    done
  done
  for f in /etc/nginx/conf.d/*.conf; do
    base="$(basename "$f")"
    [[ "$base" == "yp-limits.conf" ]] && continue
    for d in "${domains[@]}"; do
      if grep -qE "server_name[[:space:]]+.*\b${d}\b" "$f" 2>/dev/null; then
        echo "  disable conf.d/$base → .yp-disabled"
        mv -f "$f" "${f}.yp-disabled" 2>/dev/null || rm -f "$f"
        break
      fi
    done
  done
  shopt -u nullglob
}

echo "==> убираю конфликтующие nginx-сайты"
disable_conflicts "$PROD_DOMAIN" "$STAGING_DOMAIN"

mkdir -p /var/www/html/.well-known/acme-challenge /etc/nginx/sites-available /etc/nginx/sites-enabled
echo ok > /var/www/html/.well-known/acme-challenge/yp-ping
chmod -R a+rX /var/www/html/.well-known

if [[ ! -f /etc/nginx/sites-available/sochi-portal ]]; then
  echo "WARN: нет sochi-portal — временный ACME vhost"
  cat > /etc/nginx/sites-available/yp-acme-temp <<EOF
server {
  listen 80;
  server_name ${PROD_DOMAIN} ${STAGING_DOMAIN};
  location ^~ /.well-known/acme-challenge/ { root /var/www/html; default_type text/plain; }
  location / { return 200 'yp-acme-temp\n'; add_header Content-Type text/plain; }
}
EOF
  ln -sfn /etc/nginx/sites-available/yp-acme-temp /etc/nginx/sites-enabled/yp-acme-temp
else
  ln -sfn /etc/nginx/sites-available/sochi-portal /etc/nginx/sites-enabled/sochi-portal
fi

nginx -t
systemctl reload nginx

echo "==> локальный ACME ping"
for d in "$PROD_DOMAIN" "$STAGING_DOMAIN"; do
  echo -n "  $d: "
  curl -sS --max-time 5 -H "Host: $d" "http://127.0.0.1/.well-known/acme-challenge/yp-ping" || echo FAIL
  echo
done

export DEBIAN_FRONTEND=noninteractive
apt-get install -y certbot >/dev/null 2>&1 || true

issue() {
  local domain="$1"
  local ips resolved extra hit
  ips="$(hostname -I | tr ' ' '\n' | grep -E '^[0-9.]+$')"
  resolved="$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u)"
  extra=0
  hit=0
  while read -r rip; do
    [[ -z "$rip" ]] && continue
    if echo "$ips" | grep -qx "$rip"; then hit=1; else extra=1; echo "  WARN: $domain ещё указывает на чужой IP $rip — удалите эту A-запись"; fi
  done <<< "$resolved"
  if [[ "$hit" != "1" ]]; then
    echo "SKIP certbot $domain — DNS не смотрит на этот сервер"
    return 1
  fi
  if [[ "$extra" == "1" ]]; then
    echo "SKIP certbot $domain — есть лишние A на другие IP"
    return 1
  fi
  echo "==> certbot $domain"
  certbot certonly --webroot -w /var/www/html -d "$domain" \
    --non-interactive --agree-tos -m "$LE_EMAIL" --force-renewal --preferred-challenges http
}

issue "$PROD_DOMAIN" || true
issue "$STAGING_DOMAIN" || true

DB="$(docker ps --format '{{.Names}}' | grep -E '^sochi-portal(_|-)db' | head -1 || true)"
if [[ -n "$DB" ]]; then
  echo "==> SiteSettings.siteName = $SITE_NAME"
  docker exec -i "$DB" psql -U sochi -d sochi_portal -v ON_ERROR_STOP=0 <<SQL
INSERT INTO "SiteSettings" (id, "siteName", "publicSiteUrl")
VALUES ('1', '${SITE_NAME//\'/\'\'}', 'https://${PROD_DOMAIN}')
ON CONFLICT (id) DO UPDATE
SET "siteName" = EXCLUDED."siteName",
    "publicSiteUrl" = EXCLUDED."publicSiteUrl";
SQL
fi

INST="$APP_DIR/scripts/install-dev-stack.sh"
[[ -x "$INST" ]] || INST="$(ls -1 /root/yp-kit/youngportal-*-kit-*/INSTALL.sh 2>/dev/null | head -1 || true)"
if [[ -n "$INST" && -f "$INST" ]]; then
  echo "==> reconfigure nginx"
  bash "$INST" --reconfigure --yes \
    --mode dual \
    --prod-domain "$PROD_DOMAIN" \
    --staging-domain "$STAGING_DOMAIN" \
    --tls-mode letsencrypt \
    --le-email "$LE_EMAIL" \
    --site-name "$SITE_NAME" || true
fi

rm -f /etc/nginx/sites-enabled/yp-acme-temp
nginx -t && systemctl reload nginx || true

echo
echo "==> результат"
ls -la /etc/letsencrypt/live 2>/dev/null || echo "(нет LE live/)"
curl -skS --max-time 8 "https://${STAGING_DOMAIN}/api/health" || true
echo
curl -skS --max-time 8 "https://${PROD_DOMAIN}/api/health" || true
echo
echo "Если LE не вышел — в DNS только A → $(hostname -I | awk '{print $1}')"
