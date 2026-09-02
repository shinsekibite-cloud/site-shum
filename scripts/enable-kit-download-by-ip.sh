#!/usr/bin/env bash
# На VPS-хранилище (77.110.125.241): раздача /backups по IP.
#   bash scripts/enable-kit-download-by-ip.sh
# После этого:
#   curl -fkL https://77.110.125.241/backups/<token>/<file>.tgz -o kit.tgz
set -euo pipefail

IP="${KIT_STORAGE_IP:-77.110.125.241}"
ROOT_DL="${BACKUP_PUBLIC_ROOT:-/var/backups/sochi-portal/public-dl}"
CONF=/etc/nginx/sites-available/yp-kit-download-ip
LINK=/etc/nginx/sites-enabled/yp-kit-download-ip

# Сертификат young (есть на этом сервере) — для TLS на IP
CERT="${TLS_CERT:-/etc/letsencrypt/live/py.idivles.ru/fullchain.pem}"
KEY="${TLS_KEY:-/etc/letsencrypt/live/py.idivles.ru/privkey.pem}"

[[ $(id -u) -eq 0 ]] || { echo "Запустите от root"; exit 1; }
[[ -d "$ROOT_DL" ]] || mkdir -p "$ROOT_DL"
[[ -f "$CERT" && -f "$KEY" ]] || { echo "Нет $CERT — сначала LE для young на этом сервере"; exit 1; }

THIS_IPS="$(hostname -I 2>/dev/null || true)"
if ! echo " $THIS_IPS " | grep -q " ${IP} "; then
  echo "WARN: этот хост не ${IP} (сейчас: $THIS_IPS). Конфиг всё равно ставлю."
fi

cat > "$CONF" <<EOF
# YoungPortal kit download — ТОЛЬКО по IP ${IP}
server {
    listen ${IP}:80;
    server_name ${IP};
    location ^~ /backups/ {
        alias ${ROOT_DL}/;
        autoindex off;
        types { application/gzip tgz; application/octet-stream sha256; }
        add_header Cache-Control "private, no-store";
        add_header X-Content-Type-Options nosniff;
    }
    location / { return 404; }
}

server {
    listen ${IP}:443 ssl;
    server_name ${IP};
    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    location ^~ /backups/ {
        alias ${ROOT_DL}/;
        autoindex off;
        types { application/gzip tgz; application/octet-stream sha256; }
        add_header Cache-Control "private, no-store";
        add_header X-Content-Type-Options nosniff;
    }
    location / { return 404; }
}
EOF

ln -sfn "$CONF" "$LINK"
nginx -t
systemctl reload nginx
echo "OK: kit download by IP enabled"
echo "  curl -fkL https://${IP}/backups/<token>/<file>.tgz -o kit.tgz"
echo "  (каталог: ${ROOT_DL})"
