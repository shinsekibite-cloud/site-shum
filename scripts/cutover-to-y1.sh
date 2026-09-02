#!/usr/bin/env bash
# Full cutover proof on the production VPS:
#   1) take LIVE snapshot
#   2) restore that snapshot into /opt/sochi-portal
#   3) issue TLS for y1.idivles.ru
#   4) switch nginx to serve y1, disable young.idivles.ru
#
# Usage (on VPS as root, from /opt/sochi-portal):
#   bash scripts/cutover-to-y1.sh
#
# Or from a workstation:
#   SSHPASS=… sshpass -e ssh -p 4488 root@HOST 'cd /opt/sochi-portal && bash scripts/cutover-to-y1.sh'
set -euo pipefail

APP="${APP_DIR:-/opt/sochi-portal}"
DOMAIN="${DOMAIN:-y1.idivles.ru}"
OLD_DOMAIN="${OLD_DOMAIN:-young.idivles.ru}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/sochi-portal}"
EMAIL="${CERTBOT_EMAIL:-admin@idivles.ru}"

cd "$APP"

echo "==> [A] LIVE snapshot…"
bash "$APP/scripts/snapshot-live-site.sh"
ARCHIVE="$(readlink -f "$BACKUP_DIR/live-latest.tar.gz")"
echo "    archive: $ARCHIVE"
sha256sum "$ARCHIVE"

echo "==> [B] Restore from that archive…"
DOMAIN="$DOMAIN" bash "$APP/scripts/restore-live-snapshot.sh" "$ARCHIVE"

echo "==> [C] TLS for ${DOMAIN}…"
mkdir -p /var/www/html
# Temporary HTTP server_name so ACME works even before final config
if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  # Ensure port 80 answers ACME for y1
  cat > /etc/nginx/sites-available/y1-acme-temp <<NGX
server {
    listen 80;
    server_name ${DOMAIN};
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
    }
    location / { return 200 'y1 acme ready\n'; add_header Content-Type text/plain; }
}
NGX
  ln -sfn /etc/nginx/sites-available/y1-acme-temp /etc/nginx/sites-enabled/y1-acme-temp
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/html -d "$DOMAIN" \
    --non-interactive --agree-tos -m "$EMAIL" || \
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
fi

echo "==> [D] Install nginx cutover config…"
if [[ -f "$APP/deploy/nginx-y1-idivles.conf" ]]; then
  cp -f "$APP/deploy/nginx-y1-idivles.conf" /etc/nginx/sites-available/sochi-portal
else
  echo "Missing $APP/deploy/nginx-y1-idivles.conf" >&2
  exit 1
fi
rm -f /etc/nginx/sites-enabled/y1-acme-temp
ln -sfn /etc/nginx/sites-available/sochi-portal /etc/nginx/sites-enabled/sochi-portal
nginx -t
systemctl reload nginx

echo "==> [E] Smoke…"
sleep 2
curl -sS -m 20 -o /dev/null -w "y1 home %{http_code}\n" "https://${DOMAIN}/" || true
curl -sS -m 20 -o /dev/null -w "y1 faq %{http_code}\n" "https://${DOMAIN}/faq" || true
curl -sS -m 20 "https://${DOMAIN}/api/health" || true
echo
curl -sS -m 20 -o /dev/null -w "young home %{http_code}\n" "https://${OLD_DOMAIN}/" || true
curl -sS -m 20 -o /dev/null -w "young http %{http_code}\n" "http://${OLD_DOMAIN}/" || true

cat <<EOF

Cutover done.
  Active:  https://${DOMAIN}
  Disabled: https://${OLD_DOMAIN}  (HTTP 503)
  Backup:  ${ARCHIVE}
  SHA256:  $(sha256sum "$ARCHIVE" | awk '{print $1}')
EOF
