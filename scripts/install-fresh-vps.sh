#!/usr/bin/env bash
# Fresh YoungPortal install on a new Debian 12+ VPS (domain, hardening, TLS, bootstrap data).
#
# Run ON the server as root:
#   DOMAIN=portal.example.ru SITE_NAME="Мой портал" \
#   ADMIN_EMAIL=admin@example.ru ADMIN_PASSWORD='StrongPass1!' \
#   TECH_EMAIL=tech@example.ru TECH_BOOTSTRAP_PASSWORD='TechPass1!' \
#   LETSENCRYPT_EMAIL=ops@example.ru \
#   bash scripts/install-fresh-vps.sh
#
# Or from a workstation (uploads current tree / archive):
#   SSHPASS='…' ./scripts/install-fresh-vps.sh \
#     --host root@203.0.113.10 --port 22 \
#     --domain portal.example.ru --site-name "Мой портал" \
#     --admin-email admin@example.ru --admin-password 'StrongPass1!' \
#     --tech-email tech@example.ru --tech-password 'TechPass1!' \
#     --le-email ops@example.ru
#
# Flags:
#   --skip-ssl         Nginx HTTP-only (until DNS points here)
#   --skip-preflight   Do not run scripts/preflight-vps.sh
#   --force-sni        Share :443 with xray via nginx stream SNI
#   --dry-run          Print plan, do not change the system
#   --app-dir DIR      Default /opt/sochi-portal
#   --ssh-harden-port N  Move sshd to N and open UFW (default 4488; 0 = keep)
#
# Pitfalls (443/xray, OOM, Redis, Prisma…): docs/VPS-INSTALL-PITFALLS.md
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${APP_DIR:-/opt/sochi-portal}"
DOMAIN="${DOMAIN:-}"
SITE_NAME="${SITE_NAME:-Центр развития молодежи}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
TECH_EMAIL="${TECH_EMAIL:-}"
TECH_BOOTSTRAP_PASSWORD="${TECH_BOOTSTRAP_PASSWORD:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
SSH_HARDEN_PORT="${SSH_HARDEN_PORT:-4488}"
SKIP_SSL=0
SKIP_PREFLIGHT=0
FORCE_SNI=0
DRY_RUN=0
REMOTE_HOST=""
REMOTE_PORT="22"
ASSUME_YES=0

usage() {
  sed -n '2,35p' "$0" | sed 's/^# \?//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) REMOTE_HOST="$2"; shift 2 ;;
    --port) REMOTE_PORT="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --site-name) SITE_NAME="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --tech-email) TECH_EMAIL="$2"; shift 2 ;;
    --tech-password) TECH_BOOTSTRAP_PASSWORD="$2"; shift 2 ;;
    --le-email) LETSENCRYPT_EMAIL="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --ssh-harden-port) SSH_HARDEN_PORT="$2"; shift 2 ;;
    --skip-ssl) SKIP_SSL=1; shift ;;
    --skip-preflight) SKIP_PREFLIGHT=1; shift ;;
    --force-sni) FORCE_SNI=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  if [[ $ASSUME_YES -eq 1 || $DRY_RUN -eq 1 ]]; then
    echo "DOMAIN / --domain required"; exit 1
  fi
  read -r -p "Domain (portal.example.ru): " DOMAIN
fi
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%%/*}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%%/*}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"
PUBLIC_URL="https://${DOMAIN}"

if [[ $DRY_RUN -eq 1 ]]; then
  cat <<PLAN
[dry-run] Would install YoungPortal with:
  domain=$DOMAIN
  site=$SITE_NAME
  app=$APP_DIR
  admin=${ADMIN_EMAIL:-'(none)'}
  tech=${TECH_EMAIL:-'(none)'}
  le=$LETSENCRYPT_EMAIL
  skip_ssl=$SKIP_SSL
  skip_preflight=$SKIP_PREFLIGHT
  force_sni=$FORCE_SNI
  ssh_harden_port=$SSH_HARDEN_PORT
  remote_host=${REMOTE_HOST:-'(local)'}
PLAN
  exit 0
fi

run() {
  "$@"
}

# ─── Remote launcher ───────────────────────────────────────────────
if [[ -n "$REMOTE_HOST" ]]; then
  SSH_OPTS=(-o StrictHostKeyChecking=accept-new -p "$REMOTE_PORT")
  SCP_OPTS=(-o StrictHostKeyChecking=accept-new -P "$REMOTE_PORT")
  ssh_cmd() {
    if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
      sshpass -e ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "$@"
    else
      ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "$@"
    fi
  }
  scp_cmd() {
    if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
      sshpass -e scp "${SCP_OPTS[@]}" "$@"
    else
      scp "${SCP_OPTS[@]}" "$@"
    fi
  }

  echo "==> Packaging project for remote install…"
  STAGE="/tmp/yp-fresh-$$"
  mkdir -p "$STAGE"
  tar -C "$ROOT_DIR" \
    --exclude=node_modules --exclude=.next --exclude=.git \
    --exclude='data/*.db' --exclude=uploads --exclude='.env' \
    --exclude='*.tgz' --exclude='*.zip' \
    -czf "$STAGE/code.tgz" .
  scp_cmd "$STAGE/code.tgz" "$REMOTE_HOST:/tmp/yp-fresh-code.tgz"
  rm -rf "$STAGE"

  REMOTE_ENV=(
    "DOMAIN=$(printf '%q' "$DOMAIN")"
    "SITE_NAME=$(printf '%q' "$SITE_NAME")"
    "ADMIN_EMAIL=$(printf '%q' "$ADMIN_EMAIL")"
    "ADMIN_PASSWORD=$(printf '%q' "$ADMIN_PASSWORD")"
    "TECH_EMAIL=$(printf '%q' "$TECH_EMAIL")"
    "TECH_BOOTSTRAP_PASSWORD=$(printf '%q' "$TECH_BOOTSTRAP_PASSWORD")"
    "LETSENCRYPT_EMAIL=$(printf '%q' "$LETSENCRYPT_EMAIL")"
    "APP_DIR=$(printf '%q' "$APP_DIR")"
    "SSH_HARDEN_PORT=$(printf '%q' "$SSH_HARDEN_PORT")"
    "SKIP_SSL=$SKIP_SSL"
    "SKIP_PREFLIGHT=$SKIP_PREFLIGHT"
    "FORCE_SNI=$FORCE_SNI"
    "DRY_RUN=$DRY_RUN"
    "ASSUME_YES=1"
  )

  ssh_cmd "bash -s" <<REMOTE
set -euo pipefail
export ${REMOTE_ENV[*]}
mkdir -p "\$APP_DIR" /tmp/yp-fresh-extract
rm -rf /tmp/yp-fresh-extract/*
tar -xzf /tmp/yp-fresh-code.tgz -C /tmp/yp-fresh-extract
rsync -a --delete \
  --exclude data/postgres --exclude public/uploads --exclude .env \
  --exclude node_modules --exclude .next \
  /tmp/yp-fresh-extract/ "\$APP_DIR/"
chmod +x "\$APP_DIR"/scripts/*.sh "\$APP_DIR"/scripts/*.mjs 2>/dev/null || true
cd "\$APP_DIR"
bash scripts/install-fresh-vps.sh --yes \\
  --domain "\$DOMAIN" \\
  --site-name "\$SITE_NAME" \\
  --admin-email "\$ADMIN_EMAIL" \\
  --admin-password "\$ADMIN_PASSWORD" \\
  --tech-email "\$TECH_EMAIL" \\
  --tech-password "\$TECH_BOOTSTRAP_PASSWORD" \\
  --le-email "\$LETSENCRYPT_EMAIL" \\
  --app-dir "\$APP_DIR" \\
  --ssh-harden-port "\$SSH_HARDEN_PORT" \\
  \$( [[ "\$SKIP_SSL" == "1" ]] && echo --skip-ssl ) \\
  \$( [[ "\$SKIP_PREFLIGHT" == "1" ]] && echo --skip-preflight ) \\
  \$( [[ "\$FORCE_SNI" == "1" ]] && echo --force-sni ) \\
  \$( [[ "\$DRY_RUN" == "1" ]] && echo --dry-run )
REMOTE
  exit $?
fi

# ─── Local (on VPS) ────────────────────────────────────────────────
if [[ $(id -u) -ne 0 && $DRY_RUN -eq 0 ]]; then
  echo "Run as root on the target VPS (or use --host / --dry-run)."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
OS_ID="$(. /etc/os-release && echo "${ID:-debian}")"
OS_CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-bookworm}")"
DOCKER_DISTRO="debian"
[[ "$OS_ID" == "ubuntu" ]] && DOCKER_DISTRO="ubuntu"

echo "============================================================"
echo " YoungPortal fresh install"
echo " Domain:   $DOMAIN"
echo " App dir:  $APP_DIR"
echo " Site:     $SITE_NAME"
echo " SSL:      $([[ $SKIP_SSL -eq 1 ]] && echo SKIP || echo webroot/SNI-aware)"
echo " Dry-run:  $DRY_RUN"
echo "============================================================"

echo "==> [1/8] Packages"
if [[ $DRY_RUN -eq 0 ]]; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release git ufw openssl \
    nginx fail2ban rsync cron dnsutils iproute2
fi

if [[ $DRY_RUN -eq 0 && $SKIP_PREFLIGHT -eq 0 ]]; then
  echo "==> Preflight (docs/VPS-INSTALL-PITFALLS.md)"
  if [[ -x "$APP_DIR/scripts/preflight-vps.sh" ]] || [[ -f "$ROOT_DIR/scripts/preflight-vps.sh" ]]; then
    PF="$APP_DIR/scripts/preflight-vps.sh"
    [[ -f "$PF" ]] || PF="$ROOT_DIR/scripts/preflight-vps.sh"
    if ! bash "$PF" --domain "$DOMAIN" --app-dir "$APP_DIR"; then
      echo "ERROR: preflight failed. Fix issues above or pass --skip-preflight."
      exit 1
    fi
  else
    echo "WARN: preflight-vps.sh missing — continue"
  fi
fi

if [[ $DRY_RUN -eq 0 ]] && ! command -v docker >/dev/null 2>&1; then
  echo "==> Install Docker ($DOCKER_DISTRO/$OS_CODENAME)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${DOCKER_DISTRO}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DOCKER_DISTRO} ${OS_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

if [[ $DRY_RUN -eq 0 ]]; then
  if ! command -v docker-compose >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    printf '%s\n' '#!/bin/sh' 'exec docker compose "$@"' > /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
  fi
  apt-get install -y certbot python3-certbot-nginx || true
fi

COMPOSE="docker compose"
if [[ $DRY_RUN -eq 0 ]]; then
  if ! docker compose version >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  fi
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [[ ! -f docker-compose.yml ]]; then
  echo "ERROR: $APP_DIR/docker-compose.yml missing. Unpack the project first."
  exit 1
fi

echo "==> [2/8] .env"
if [[ $DRY_RUN -eq 0 ]]; then
  if [[ ! -f .env ]]; then
    touch .env
    chmod 600 .env
  fi
  set_env() {
    local key="$1" val="$2"
    if grep -qE "^${key}=" .env 2>/dev/null; then
      grep -vE "^${key}=" .env > .env.tmp && mv .env.tmp .env
    fi
    printf '%s=%s\n' "$key" "$val" >> .env
  }
  ensure_env() {
    local key="$1" val="$2"
    if ! grep -qE "^${key}=" .env 2>/dev/null; then
      printf '%s=%s\n' "$key" "$val" >> .env
    fi
  }
  ensure_env POSTGRES_USER sochi
  ensure_env POSTGRES_DB sochi_portal
  if ! grep -qE '^POSTGRES_PASSWORD=' .env; then
    ensure_env POSTGRES_PASSWORD "$(openssl rand -hex 16)"
  fi
  if ! grep -qE '^REDIS_PASSWORD=' .env; then
    ensure_env REDIS_PASSWORD "$(openssl rand -hex 16)"
  fi
  if ! grep -qE '^NEXTAUTH_SECRET=' .env; then
    ensure_env NEXTAUTH_SECRET "$(openssl rand -hex 32)"
  fi
  if ! grep -qE '^CRON_SECRET=' .env; then
    ensure_env CRON_SECRET "$(openssl rand -hex 24)"
  fi
  PW="$(grep -E '^POSTGRES_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  RPW="$(grep -E '^REDIS_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  PG_USER="$(grep -E '^POSTGRES_USER=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  PG_DB="$(grep -E '^POSTGRES_DB=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  set_env DATABASE_URL "postgresql://${PG_USER}:${PW}@db:5432/${PG_DB}?schema=public"
  set_env REDIS_URL "redis://:${RPW}@redis:6379"
  set_env REDIS_PASSWORD "$RPW"
  set_env NEXTAUTH_URL "$PUBLIC_URL"
  set_env NEXT_PUBLIC_SITE_URL "$PUBLIC_URL"
  set_env UPLOAD_DIR /app/uploads
  set_env NODE_ENV production
  set_env EMAIL_SMTP_BLOCKED 1
  set_env EMAIL_PROVIDER resend
  set_env RESEND_FROM "noreply@${DOMAIN}"
  set_env VAPID_SUBJECT "mailto:noreply@${DOMAIN}"
  if [[ -n "$TECH_EMAIL" ]]; then
    set_env TECH_EMAIL "$TECH_EMAIL"
  fi
  if [[ -n "$TECH_BOOTSTRAP_PASSWORD" ]]; then
    set_env TECH_BOOTSTRAP_PASSWORD "$TECH_BOOTSTRAP_PASSWORD"
  fi
  mkdir -p public/uploads data backups
  chmod 755 public/uploads
fi

echo "==> [3/8] Firewall + fail2ban + SSH"
if [[ $DRY_RUN -eq 0 ]]; then
  ufw allow OpenSSH || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  if [[ "${SSH_HARDEN_PORT}" != "0" && "${SSH_HARDEN_PORT}" != "22" ]]; then
    ufw allow "${SSH_HARDEN_PORT}/tcp" || true
    if [[ -f /etc/ssh/sshd_config ]]; then
      if ! grep -qE "^Port ${SSH_HARDEN_PORT}$" /etc/ssh/sshd_config; then
        sed -i 's/^#\\?Port .*/Port '"${SSH_HARDEN_PORT}"'/' /etc/ssh/sshd_config || true
        if ! grep -qE "^Port ${SSH_HARDEN_PORT}$" /etc/ssh/sshd_config; then
          echo "Port ${SSH_HARDEN_PORT}" >> /etc/ssh/sshd_config
        fi
      fi
      systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true
    fi
  fi
  ufw --force enable || true

  cat > /etc/fail2ban/jail.d/yp-sshd.local <<JAIL
[sshd]
enabled = true
port = ${SSH_HARDEN_PORT},22
maxretry = 5
bantime = 86400
findtime = 600
JAIL
  systemctl enable --now fail2ban 2>/dev/null || true
  systemctl restart fail2ban 2>/dev/null || true
fi

echo "==> [4/8] Docker stack (db/redis/web)"
if [[ $DRY_RUN -eq 0 ]]; then
  # Free RAM for next build on small VPS (see VPS-INSTALL-PITFALLS.md §2)
  $COMPOSE stop web 2>/dev/null || true
  systemctl stop netdata 2>/dev/null || true
  SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
  if [[ "${SWAP_MB:-0}" -lt 1500 ]]; then
    echo "WARN: swap ${SWAP_MB}MB — build may OOM on ≤2GB VPS. Prefer ≥2GB swap."
  fi
  $COMPOSE up -d db redis </dev/null
  for i in $(seq 1 60); do
    $COMPOSE exec -T db pg_isready </dev/null >/dev/null 2>&1 && break
    sleep 2
  done
  # Cap node heap; relies on swap on small hosts
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1280}"
  $COMPOSE build web </dev/null
  $COMPOSE up -d web </dev/null
  systemctl start netdata 2>/dev/null || true
  for i in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      echo "Web healthy"
      break
    fi
    sleep 3
  done
  # Schema before seed (empty volume otherwise → table missing)
  $COMPOSE exec -T web npx prisma db push --accept-data-loss </dev/null || true
fi

echo "==> [5/8] Bootstrap admin + site name"
if [[ $DRY_RUN -eq 0 && -n "$ADMIN_EMAIL" && -n "$ADMIN_PASSWORD" ]]; then
  $COMPOSE exec -T \
    -e ADMIN_EMAIL="$ADMIN_EMAIL" \
    -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e SITE_NAME="$SITE_NAME" \
    -e PUBLIC_URL="$PUBLIC_URL" \
    web node /app/scripts/seed-bootstrap-admin.mjs || \
  $COMPOSE exec -T web node scripts/seed-bootstrap-admin.mjs \
    --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" \
    --site-name "$SITE_NAME" --public-url "$PUBLIC_URL" || true
elif [[ -z "$ADMIN_EMAIL" ]]; then
  echo "  (skip admin seed — set ADMIN_EMAIL / ADMIN_PASSWORD)"
fi

echo "==> [6/8] Nginx + rate limits"
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d
  if [[ -f "$APP_DIR/deploy/nginx-yp-limits.conf" ]]; then
    cp "$APP_DIR/deploy/nginx-yp-limits.conf" /etc/nginx/conf.d/yp-limits.conf
  fi
  NGINX_SITE="/etc/nginx/sites-available/sochi-portal"
  if [[ -f "$APP_DIR/deploy/nginx-sochi-portal.conf" ]]; then
    sed "s/young\\.idivles\\.ru/${DOMAIN}/g; s|/opt/sochi-portal|${APP_DIR}|g" \
      "$APP_DIR/deploy/nginx-sochi-portal.conf" > "$NGINX_SITE"
  else
    cat > "$NGINX_SITE" <<NGX
server {
  listen 80;
  server_name ${DOMAIN};
  client_max_body_size 25m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGX
  fi
  # Until certbot: ensure HTTP works (strip SSL listen if certs missing)
  if [[ $SKIP_SSL -eq 1 ]] || [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
    # Temporary HTTP-only vhost
    cat > "$NGINX_SITE" <<NGX
server {
  listen 80;
  server_name ${DOMAIN};
  client_max_body_size 25m;
  location /uploads/ {
    alias ${APP_DIR}/public/uploads/;
    access_log off;
    expires 7d;
  }
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGX
  fi
  ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/sochi-portal
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl enable --now nginx && systemctl reload nginx
fi

echo "==> [7/8] Let's Encrypt + auto-renew (SNI-aware if 443=xray)"
if [[ $DRY_RUN -eq 0 && $SKIP_SSL -eq 0 ]]; then
  SNI_SCRIPT="$APP_DIR/scripts/setup-https-sni-xray.sh"
  [[ -f "$SNI_SCRIPT" ]] || SNI_SCRIPT="$ROOT_DIR/scripts/setup-https-sni-xray.sh"
  if [[ -f "$SNI_SCRIPT" ]]; then
    chmod +x "$SNI_SCRIPT" || true
    SNI_ARGS=(--domain "$DOMAIN" --email "$LETSENCRYPT_EMAIL" --app-dir "$APP_DIR")
    [[ $FORCE_SNI -eq 1 ]] && SNI_ARGS+=(--force-sni)
    if ! DOMAIN="$DOMAIN" EMAIL="$LETSENCRYPT_EMAIL" APP_DIR="$APP_DIR" \
      bash "$SNI_SCRIPT" "${SNI_ARGS[@]}"; then
      echo "WARN: HTTPS/SNI setup failed. See docs/VPS-INSTALL-PITFALLS.md"
      echo "  If xray holds :443 — move inbound to 127.0.0.1:10443, then re-run:"
      echo "  bash $SNI_SCRIPT --domain $DOMAIN --email $LETSENCRYPT_EMAIL"
    fi
  elif command -v certbot >/dev/null 2>&1; then
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --redirect; then
      echo "TLS issued for $DOMAIN"
      systemctl reload nginx || true
    else
      echo "WARN: certbot failed (DNS not ready?). Keep HTTP; re-run later."
    fi
    systemctl enable certbot.timer 2>/dev/null || true
    cat > /etc/cron.d/yp-certbot-renew <<CRON
17 3 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'
CRON
    chmod 644 /etc/cron.d/yp-certbot-renew
  else
    echo "WARN: neither setup-https-sni-xray.sh nor certbot available"
  fi
else
  echo "  SSL skipped"
fi

echo "==> [8/9] Project accounts (yp-deploy / yp-ha)"
if [[ $DRY_RUN -eq 0 && -x "$APP_DIR/scripts/setup-project-users.sh" ]]; then
  bash "$APP_DIR/scripts/setup-project-users.sh" --app-dir "$APP_DIR" --with-keys || true
elif [[ $DRY_RUN -eq 0 && -x "$ROOT_DIR/scripts/setup-project-users.sh" ]]; then
  bash "$ROOT_DIR/scripts/setup-project-users.sh" --app-dir "$APP_DIR" --with-keys || true
fi

echo "==> [9/9] Backup cron + smoke"
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p /var/backups/sochi-portal /var/log
  if [[ -x "$APP_DIR/scripts/full-backup.sh" ]]; then
    cat > /etc/cron.d/yp-full-backup <<CRON
15 3 * * * root $APP_DIR/scripts/full-backup.sh >> /var/log/sochi-backup.log 2>&1
CRON
    chmod 644 /etc/cron.d/yp-full-backup
  fi
  curl -sS http://127.0.0.1:3000/api/health || true
  echo
fi

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"

cat <<SUMMARY

══════════════════════════════════════════════════════════════
  Fresh install complete
══════════════════════════════════════════════════════════════
  IP:            ${SERVER_IP:-unknown}
  Domain:        ${DOMAIN}
  Public URL:    ${PUBLIC_URL}
  App:           ${APP_DIR}
  Admin:         ${ADMIN_EMAIL:-'(not seeded)'}
  TECH email:    ${TECH_EMAIL:-'(set TECH_EMAIL in .env)'}
  SSH harden:    port ${SSH_HARDEN_PORT} (0 = unchanged)
  TLS renew:     certbot.timer + /etc/cron.d/yp-certbot-renew

  DNS:  A ${DOMAIN} → ${SERVER_IP:-this-server}
  Docs: docs/VPS-FRESH-INSTALL.md
  Pitfalls: docs/VPS-INSTALL-PITFALLS.md
  OS users:      yp-deploy (deploy) · yp-ha (replica)
  Accounts file: /etc/yp-portal/accounts.env
  HA pair:       scripts/setup-replica-pair.sh  (after standby is installed)

  Checks:
    curl -sS https://${DOMAIN}/api/health
    bash ${APP_DIR}/scripts/preflight-vps.sh --domain ${DOMAIN} || true
    id yp-deploy; id yp-ha
    ufw status
    systemctl status certbot.timer
══════════════════════════════════════════════════════════════
SUMMARY
