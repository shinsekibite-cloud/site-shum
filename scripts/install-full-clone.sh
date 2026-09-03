#!/usr/bin/env bash
# Полная установка / перенастройка клона https://young.idivles.ru
# «как есть сейчас»: Docker-образ, Postgres, загрузки, nginx, защита.
#
# Запуск на НОВОМ Debian 12+ / Ubuntu 22.04+ (root):
#   tar -xzf youngportal-full-kit-*.tgz
#   cd youngportal-full-kit-*
#   sudo bash INSTALL.sh
#
# Неинтерактивно:
#   SITE_NAME="Мой портал" DOMAIN=portal.example.ru \
#   TLS_MODE=letsencrypt LE_EMAIL=ops@example.ru \
#   ADMIN_EMAIL=admin@example.ru ADMIN_PASSWORD='StrongPass1!' \
#   bash INSTALL.sh --yes
#
# Перенастройка уже установленного портала:
#   bash INSTALL.sh --reconfigure
#
# TLS_MODE: letsencrypt | custom | selfsigned | skip
# RATE_PROFILE: young | strict | off
set -euo pipefail

SELF="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
SELF_DIR="$(cd "$(dirname "$SELF")" && pwd)"

# Kit root: archive layout has INSTALL.sh + snapshot/ at top.
# Repo layout has this file under scripts/ and snapshot passed via --from-snapshot.
KIT_ROOT="$SELF_DIR"
if [[ -d "$SELF_DIR/snapshot" ]]; then
  KIT_ROOT="$SELF_DIR"
elif [[ -d "$SELF_DIR/../snapshot" ]]; then
  KIT_ROOT="$(cd "$SELF_DIR/.." && pwd)"
elif [[ -f "$SELF_DIR/install-full-clone.sh" && -d "$SELF_DIR/../deploy" ]]; then
  KIT_ROOT="$(cd "$SELF_DIR/.." && pwd)"
fi

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
DOMAIN="${DOMAIN:-}"
SITE_NAME="${SITE_NAME:-Молодёжь Сочи}"
LE_EMAIL="${LE_EMAIL:-${LETSENCRYPT_EMAIL:-}}"
TLS_MODE="${TLS_MODE:-letsencrypt}"
TLS_CERT="${TLS_CERT:-}"
TLS_KEY="${TLS_KEY:-}"
RATE_PROFILE="${RATE_PROFILE:-young}"
SSH_PORT="${SSH_PORT:-${SSH_HARDEN_PORT:-4488}}"
SWAP_GB="${SWAP_GB:-2}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
RESTORE_DATA="${RESTORE_DATA:-1}"
ENABLE_UFW="${ENABLE_UFW:-1}"
ENABLE_FAIL2BAN="${ENABLE_FAIL2BAN:-1}"
ENABLE_HSTS="${ENABLE_HSTS:-1}"
ENABLE_UNATTENDED="${ENABLE_UNATTENDED:-1}"
LOCK_SSH="${LOCK_SSH:-0}"
SSH_PUBKEY="${SSH_PUBKEY:-}"
ASSUME_YES="${ASSUME_YES:-0}"
RECONFIGURE=0
DRY_RUN=0
FORCE=0
SNAPSHOT_DIR="${SNAPSHOT_DIR:-}"

usage() { sed -n '2,28p' "$0" | sed 's/^# \?//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --reconfigure) RECONFIGURE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    --from-snapshot) SNAPSHOT_DIR="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --site-name) SITE_NAME="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --tls-mode) TLS_MODE="$2"; shift 2 ;;
    --tls-cert) TLS_CERT="$2"; shift 2 ;;
    --tls-key) TLS_KEY="$2"; shift 2 ;;
    --le-email) LE_EMAIL="$2"; shift 2 ;;
    --rate-profile) RATE_PROFILE="$2"; shift 2 ;;
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --skip-data) RESTORE_DATA=0; shift ;;
    --skip-ufw) ENABLE_UFW=0; shift ;;
    --skip-fail2ban) ENABLE_FAIL2BAN=0; shift ;;
    --no-hsts) ENABLE_HSTS=0; shift ;;
    --lock-ssh) LOCK_SSH=1; shift ;;
    --ssh-key) SSH_PUBKEY="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; usage; exit 1 ;;
  esac
done

normalize_domain() {
  local d="$1"
  d="${d#https://}"
  d="${d#http://}"
  d="${d%%/*}"
  d="${d%%:*}"
  echo "$d"
}

ask() {
  # ask VAR "prompt" "default"
  local var="$1" prompt="$2" default="${3:-}"
  local cur="${!var:-}"
  if [[ -n "$cur" && $ASSUME_YES -eq 1 ]]; then
    return 0
  fi
  if [[ $ASSUME_YES -eq 1 ]]; then
    printf -v "$var" '%s' "$default"
    return 0
  fi
  local ans=""
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " ans || true
    printf -v "$var" '%s' "${ans:-$default}"
  else
    read -r -p "$prompt: " ans || true
    printf -v "$var" '%s' "$ans"
  fi
}

ask_yn() {
  # ask_yn VAR "prompt" default_1_or_0
  local var="$1" prompt="$2" default="$3"
  local def_s="n"
  [[ "$default" == "1" ]] && def_s="y"
  local cur="${!var:-}"
  if [[ $ASSUME_YES -eq 1 ]]; then
    [[ -n "$cur" ]] || printf -v "$var" '%s' "$default"
    return 0
  fi
  local ans=""
  read -r -p "$prompt [$def_s]: " ans || true
  ans="${ans:-$def_s}"
  case "${ans,,}" in
    y|yes|д|да|1) printf -v "$var" '%s' "1" ;;
    *) printf -v "$var" '%s' "0" ;;
  esac
}

ask_secret() {
  local var="$1" prompt="$2"
  if [[ -n "${!var:-}" ]]; then return 0; fi
  if [[ $ASSUME_YES -eq 1 ]]; then return 0; fi
  local ans=""
  read -r -s -p "$prompt: " ans || true
  echo
  printf -v "$var" '%s' "$ans"
}

die() { echo "ERROR: $*" >&2; exit 1; }

if [[ $DRY_RUN -eq 0 && $(id -u) -ne 0 ]]; then
  die "Запустите от root: sudo bash $0"
fi

# ── locate snapshot ───────────────────────────────────────────────
if [[ -z "$SNAPSHOT_DIR" ]]; then
  if [[ -d "$KIT_ROOT/snapshot" ]]; then
    SNAPSHOT_DIR="$KIT_ROOT/snapshot"
  elif [[ -d "$SELF_DIR/snapshot" ]]; then
    SNAPSHOT_DIR="$SELF_DIR/snapshot"
  fi
fi

find_template() {
  local name="$1"
  local c
  for c in \
    "$KIT_ROOT/templates/$name" \
    "$KIT_ROOT/deploy/$name" \
    "$SELF_DIR/../deploy/$name" \
    "$APP_DIR/deploy/$name"
  do
    if [[ -f "$c" ]]; then echo "$c"; return 0; fi
  done
  return 1
}

# ── wizard ────────────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════════════════════"
echo "  YoungPortal — полная установка клона young.idivles.ru"
echo "════════════════════════════════════════════════════════════"
echo

if [[ $RECONFIGURE -eq 1 ]]; then
  echo "Режим: перенастройка существующего портала"
  [[ -f "$APP_DIR/docker-compose.yml" ]] || die "Не найден $APP_DIR/docker-compose.yml"
fi

ask SITE_NAME "Название портала (шапка, письма, 2FA issuer)" "$SITE_NAME"
ask DOMAIN "Домен (без https://)" "${DOMAIN:-portal.example.ru}"
DOMAIN="$(normalize_domain "$DOMAIN")"
[[ -n "$DOMAIN" ]] || die "Домен обязателен"
ask APP_DIR "Каталог установки" "$APP_DIR"
PUBLIC_URL="https://${DOMAIN}"
[[ "$TLS_MODE" == "skip" ]] && PUBLIC_URL="http://${DOMAIN}"

if [[ $ASSUME_YES -eq 0 ]]; then
  echo
  echo "Сертификаты TLS:"
  echo "  1) Let's Encrypt (нужна A-запись домена на этот сервер)"
  echo "  2) Свои файлы (fullchain.pem + privkey.pem)"
  echo "  3) Самоподписанный (для теста)"
  echo "  4) Без TLS, только HTTP"
  local_tls=""
  read -r -p "Выбор [1]: " local_tls || true
  case "${local_tls:-1}" in
    1) TLS_MODE=letsencrypt ;;
    2) TLS_MODE=custom ;;
    3) TLS_MODE=selfsigned ;;
    4) TLS_MODE=skip ;;
    *) TLS_MODE=letsencrypt ;;
  esac
fi

case "$TLS_MODE" in
  letsencrypt)
    ask LE_EMAIL "Email для Let's Encrypt" "${LE_EMAIL:-admin@${DOMAIN}}"
    PUBLIC_URL="https://${DOMAIN}"
    ;;
  custom)
    ask TLS_CERT "Путь к fullchain.pem" "${TLS_CERT:-/etc/yp-portal/tls/fullchain.pem}"
    ask TLS_KEY "Путь к privkey.pem" "${TLS_KEY:-/etc/yp-portal/tls/privkey.pem}"
    PUBLIC_URL="https://${DOMAIN}"
    ;;
  selfsigned)
    PUBLIC_URL="https://${DOMAIN}"
    ;;
  skip)
    PUBLIC_URL="http://${DOMAIN}"
    ENABLE_HSTS=0
    ;;
  *) die "TLS_MODE должен быть letsencrypt|custom|selfsigned|skip" ;;
esac

echo
echo "Защита и безопасность:"
ask_yn ENABLE_UFW "Включить UFW (80, 443, SSH)" "$ENABLE_UFW"
ask_yn ENABLE_FAIL2BAN "Включить fail2ban (ssh + nginx)" "$ENABLE_FAIL2BAN"
ask SSH_PORT "Порт SSH (0 = не менять)" "$SSH_PORT"
ask_yn LOCK_SSH "Запретить пароль SSH (только ключ)" "$LOCK_SSH"
if [[ "$LOCK_SSH" == "1" && -z "$SSH_PUBKEY" && $ASSUME_YES -eq 0 ]]; then
  ask SSH_PUBKEY "Публичный SSH-ключ (одна строка, пусто = уже в authorized_keys)" ""
fi
if [[ $ASSUME_YES -eq 0 ]]; then
  echo "Nginx rate-limit:"
  echo "  1) как на young (40/30/5 r/s)  — рекомендуется"
  echo "  2) жёстче (20/15/3 + лимит collectibles/eco)"
  echo "  3) выключить лимиты"
  local_rp=""
  read -r -p "Выбор [1]: " local_rp || true
  case "${local_rp:-1}" in
    1) RATE_PROFILE=young ;;
    2) RATE_PROFILE=strict ;;
    3) RATE_PROFILE=off ;;
    *) RATE_PROFILE=young ;;
  esac
fi
ask_yn ENABLE_HSTS "HSTS (только при HTTPS)" "$ENABLE_HSTS"
ask_yn ENABLE_UNATTENDED "Автообновления безопасности ОС" "$ENABLE_UNATTENDED"

if [[ $RECONFIGURE -eq 0 ]]; then
  echo
  ask_yn RESTORE_DATA "Восстановить БД и загрузки young «как есть»" "$RESTORE_DATA"
  if [[ $ASSUME_YES -eq 0 ]]; then
    echo "Необязательно: свой администратор (поверх клона, либо единственный если БД пустая)"
  fi
  ask ADMIN_EMAIL "Email администратора (пусто = пропустить)" "${ADMIN_EMAIL:-}"
  if [[ -n "$ADMIN_EMAIL" ]]; then
    ask_secret ADMIN_PASSWORD "Пароль администратора (мин. 10, буквы+цифры)"
  fi
fi

echo
echo "──────── план ────────"
echo "  Название:     $SITE_NAME"
echo "  Домен:        $DOMAIN"
echo "  URL:          $PUBLIC_URL"
echo "  Каталог:      $APP_DIR"
echo "  TLS:          $TLS_MODE"
echo "  Rate-limit:   $RATE_PROFILE"
echo "  UFW:          $ENABLE_UFW   fail2ban: $ENABLE_FAIL2BAN   HSTS: $ENABLE_HSTS"
echo "  SSH порт:     $SSH_PORT   lock-ssh: $LOCK_SSH"
echo "  Данные young: $RESTORE_DATA"
echo "  Админ:        ${ADMIN_EMAIL:-не задан}"
echo "  Снимок:       ${SNAPSHOT_DIR:-нет — только перенастройка/сборка}"
echo "─────────────────────"
if [[ $ASSUME_YES -eq 0 ]]; then
  conf=""
  read -r -p "Продолжить? [y/N]: " conf || true
  case "${conf,,}" in y|yes|д|да) ;; *) echo "Отменено."; exit 2 ;; esac
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] остановка здесь"
  exit 0
fi

if [[ $RECONFIGURE -eq 0 && -z "$SNAPSHOT_DIR" ]]; then
  die "Нет snapshot/. Распакуйте полный kit или укажите --from-snapshot DIR"
fi
if [[ $RECONFIGURE -eq 0 && ! -f "$SNAPSHOT_DIR/host-app.tgz" && ! -f "$SNAPSHOT_DIR/sochi-portal_web-image.tar.gz" && ! -f "$SNAPSHOT_DIR/images.tar.gz" ]]; then
  die "В $SNAPSHOT_DIR нет host-app.tgz / images — это не полный kit"
fi

export DEBIAN_FRONTEND=noninteractive

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

db_ctr() {
  docker ps --format '{{.Names}}' | grep -E '^sochi-portal(_|-)db' | head -1
}

web_ctr() {
  docker ps --format '{{.Names}}' | grep -E '^sochi-portal(_|-)web' | head -1
}

# ── packages ──────────────────────────────────────────────────────
echo "==> [1] Пакеты ОС"
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git ufw openssl \
  nginx rsync cron dnsutils iproute2 tar gzip python3
if [[ "$ENABLE_FAIL2BAN" == "1" ]]; then
  apt-get install -y fail2ban
fi
if [[ "$ENABLE_UNATTENDED" == "1" ]]; then
  apt-get install -y unattended-upgrades apt-listchanges
fi
if [[ "$TLS_MODE" == "letsencrypt" ]]; then
  apt-get install -y certbot python3-certbot-nginx || apt-get install -y certbot || true
fi

OS_ID="$(. /etc/os-release && echo "${ID:-debian}")"
OS_CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-bookworm}")"
DOCKER_DISTRO="debian"
[[ "$OS_ID" == "ubuntu" ]] && DOCKER_DISTRO="ubuntu"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${DOCKER_DISTRO}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DOCKER_DISTRO} ${OS_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
if ! command -v docker-compose >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  printf '%s\n' '#!/bin/sh' 'exec docker compose "$@"' > /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# ── swap + light harden ───────────────────────────────────────────
echo "==> [2] Swap / sysctl / SSH / firewall"
SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
if [[ "${SWAP_MB:-0}" -lt $((SWAP_GB * 900)) && ! -f /swapfile ]]; then
  fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=none
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -qE '^/swapfile\s' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null 2>&1 || true
cat > /etc/sysctl.d/99-yp-hardening.conf <<'SYS'
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
vm.swappiness = 10
SYS
sysctl --system >/dev/null 2>&1 || true

if [[ "$ENABLE_UNATTENDED" == "1" ]]; then
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AU'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AU
  systemctl enable --now unattended-upgrades 2>/dev/null || true
fi

if [[ "$SSH_PORT" != "0" ]]; then
  mkdir -p /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/99-yp-hardening.conf <<SSH
Port ${SSH_PORT}
Protocol 2
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 4
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowAgentForwarding no
AllowTcpForwarding no
DebianBanner no
SSH
  if [[ -n "$SSH_PUBKEY" ]]; then
    mkdir -p /root/.ssh && chmod 700 /root/.ssh
    touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
    grep -qxF "$SSH_PUBKEY" /root/.ssh/authorized_keys 2>/dev/null || echo "$SSH_PUBKEY" >> /root/.ssh/authorized_keys
  fi
  if [[ "$LOCK_SSH" == "1" ]]; then
    [[ -s /root/.ssh/authorized_keys ]] || die "--lock-ssh нужен ключ в /root/.ssh/authorized_keys"
    cat >> /etc/ssh/sshd_config.d/99-yp-hardening.conf <<'LOCK'
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
LOCK
  else
    cat >> /etc/ssh/sshd_config.d/99-yp-hardening.conf <<'SOFT'
PermitRootLogin yes
PasswordAuthentication yes
PubkeyAuthentication yes
SOFT
  fi
  if [[ -f /etc/ssh/sshd_config ]] && ! grep -qE "^Port ${SSH_PORT}$" /etc/ssh/sshd_config; then
    sed -i 's/^#\?Port .*/Port '"${SSH_PORT}"'/' /etc/ssh/sshd_config || true
    grep -qE "^Port ${SSH_PORT}$" /etc/ssh/sshd_config || echo "Port ${SSH_PORT}" >> /etc/ssh/sshd_config
  fi
  sshd -t && (systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true)
fi

if [[ "$ENABLE_UFW" == "1" ]]; then
  ufw default deny incoming || true
  ufw default allow outgoing || true
  ufw allow 80/tcp comment 'http' || true
  ufw allow 443/tcp comment 'https' || true
  if [[ "$SSH_PORT" != "0" ]]; then
    ufw allow "${SSH_PORT}/tcp" comment 'yp-ssh' || true
    [[ "$SSH_PORT" != "22" ]] && ufw allow 22/tcp comment 'ssh-legacy-temp' || true
  else
    ufw allow OpenSSH || ufw allow 22/tcp || true
  fi
  ufw --force enable || true
fi

if [[ "$ENABLE_FAIL2BAN" == "1" ]]; then
  F2B_PORT="22"
  [[ "$SSH_PORT" != "0" ]] && F2B_PORT="${SSH_PORT},22"
  cat > /etc/fail2ban/jail.d/yp-sshd.local <<JAIL
[sshd]
enabled = true
port = ${F2B_PORT}
filter = sshd
maxretry = 5
findtime = 600
bantime = 86400
JAIL
  F2B_NGINX="$(find_template fail2ban-yp-nginx.local || true)"
  if [[ -n "$F2B_NGINX" ]]; then
    cp -f "$F2B_NGINX" /etc/fail2ban/jail.d/yp-nginx.local
  fi
  systemctl enable --now fail2ban
  systemctl restart fail2ban || true
fi

mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'DJ'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "25m", "max-file": "5" },
  "live-restore": true,
  "userland-proxy": false
}
DJ
  systemctl restart docker 2>/dev/null || true
fi

# ── unpack app ────────────────────────────────────────────────────
mkdir -p "$APP_DIR" /var/backups/sochi-portal /var/log /etc/yp-portal /var/www/html
chmod 700 /etc/yp-portal /var/backups/sochi-portal

write_env() {
  local envf="$APP_DIR/.env"
  local pw rp secret cron
  if [[ -f "$envf" ]]; then
    pw="$(grep -E '^POSTGRES_PASSWORD=' "$envf" | head -1 | cut -d= -f2- | tr -d '"' || true)"
    rp="$(grep -E '^REDIS_PASSWORD=' "$envf" | head -1 | cut -d= -f2- | tr -d '"' || true)"
    secret="$(grep -E '^NEXTAUTH_SECRET=' "$envf" | head -1 | cut -d= -f2- | tr -d '"' || true)"
    cron="$(grep -E '^CRON_SECRET=' "$envf" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  fi
  pw="${pw:-$(openssl rand -hex 16)}"
  rp="${rp:-$(openssl rand -hex 16)}"
  secret="${secret:-$(openssl rand -hex 32)}"
  cron="${cron:-$(openssl rand -hex 24)}"
  # Preserve extra keys (OAuth, Telegram, …) if reconfigure
  local extra=""
  if [[ -f "$envf" ]]; then
    extra="$(grep -E '^(RESEND_|TELEGRAM_|VAPID_|ALERT_|BACKUP_|YANDEX_|VK_|TECH_)' "$envf" || true)"
  fi
  umask 077
  cat > "$envf" <<EOF
COMPOSE_PROJECT_NAME=sochi-portal
POSTGRES_USER=sochi
POSTGRES_PASSWORD=${pw}
POSTGRES_DB=sochi_portal
DATABASE_URL=postgresql://sochi:${pw}@db:5432/sochi_portal?schema=public
REDIS_PASSWORD=${rp}
REDIS_URL=redis://:${rp}@redis:6379
NEXTAUTH_URL=${PUBLIC_URL}
NEXTAUTH_SECRET=${secret}
NEXT_PUBLIC_SITE_URL=${PUBLIC_URL}
CRON_SECRET=${cron}
UPLOAD_DIR=/app/uploads
NODE_ENV=production
EMAIL_SMTP_BLOCKED=1
EMAIL_PROVIDER=resend
RESEND_FROM=noreply@${DOMAIN}
VAPID_SUBJECT=mailto:noreply@${DOMAIN}
EOF
  if [[ -n "$extra" ]]; then
    echo "$extra" >> "$envf"
  fi
  chmod 600 "$envf"
}

if [[ $RECONFIGURE -eq 0 ]]; then
  echo "==> [3] Распаковка приложения из снимка"
  if [[ -f "$APP_DIR/docker-compose.yml" && "$FORCE" != "1" ]]; then
    echo "  $APP_DIR уже существует — синхронизируем код, .env не затираем секретами снимка"
  fi
  STAGE="/tmp/yp-clone-extract-$$"
  rm -rf "$STAGE"
  mkdir -p "$STAGE"
  if [[ -f "$SNAPSHOT_DIR/host-app.tgz" ]]; then
    tar -xzf "$SNAPSHOT_DIR/host-app.tgz" -C "$STAGE"
    SRC="$STAGE/sochi-portal"
    [[ -d "$SRC" ]] || SRC="$STAGE"
    rsync -a \
      --exclude '.env' --exclude '.env.*' \
      --exclude 'data/postgres/' --exclude 'public/uploads/' \
      --exclude 'node_modules/' --exclude '.next/' --exclude '.git/' \
      "$SRC/" "$APP_DIR/"
  fi
  mkdir -p "$APP_DIR/public/uploads" "$APP_DIR/data" "$APP_DIR/certs" "$APP_DIR/backups"
  chmod 755 "$APP_DIR/public/uploads"
  rm -rf "$STAGE"
  write_env
  # Point compose default URL at this domain
  if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
    sed -i "s|NEXTAUTH_URL=\${NEXTAUTH_URL:-https://[^}]*}|NEXTAUTH_URL=\${NEXTAUTH_URL:-${PUBLIC_URL}}|" \
      "$APP_DIR/docker-compose.yml" || true
  fi
else
  echo "==> [3] Перенастройка .env (URL)"
  write_env
fi

# ── docker images + stack ─────────────────────────────────────────
echo "==> [4] Docker-образы и стек"
cd "$APP_DIR"
if [[ $RECONFIGURE -eq 0 ]]; then
  if [[ -f "$SNAPSHOT_DIR/images.tar.gz" ]]; then
    echo "  docker load images.tar.gz (web+postgres+redis)…"
    gunzip -c "$SNAPSHOT_DIR/images.tar.gz" | docker load
  else
    if [[ -f "$SNAPSHOT_DIR/sochi-portal_web-image.tar.gz" ]]; then
      gunzip -c "$SNAPSHOT_DIR/sochi-portal_web-image.tar.gz" | docker load
    fi
    docker pull postgres:16-alpine || true
    docker pull redis:7-alpine || true
  fi
  docker image inspect sochi-portal_web:latest >/dev/null 2>&1 || \
    die "Нет образа sochi-portal_web:latest — kit неполный"
fi

compose up -d db redis
echo "  ждём Postgres…"
for i in $(seq 1 60); do
  compose exec -T db pg_isready >/dev/null 2>&1 && break
  sleep 2
done
compose exec -T db pg_isready >/dev/null 2>&1 || die "Postgres не поднялся"

if [[ $RECONFIGURE -eq 0 && "$RESTORE_DATA" == "1" ]]; then
  echo "==> [5] Восстановление БД и загрузок young"
  if [[ -f "$SNAPSHOT_DIR/uploads.tgz" ]]; then
    tar -xzf "$SNAPSHOT_DIR/uploads.tgz" -C "$APP_DIR/public"
  fi
  if [[ -f "$SNAPSHOT_DIR/db.dump" ]]; then
    compose exec -T db psql -U sochi -d postgres -v ON_ERROR_STOP=1 -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='sochi_portal' AND pid <> pg_backend_pid();" \
      >/dev/null 2>&1 || true
    docker exec -i "$(db_ctr)" pg_restore -U sochi -d sochi_portal --clean --if-exists --no-owner \
      < "$SNAPSHOT_DIR/db.dump" || echo "WARN: pg_restore завершился с предупреждениями (часто нормально)"
  fi
else
  echo "==> [5] Данные: пропуск restore (перенастройка или RESTORE_DATA=0)"
  if [[ $RECONFIGURE -eq 0 ]]; then
    compose up -d --no-build web || compose up -d --build web
    sleep 8
    compose exec -T web npx prisma db push --accept-data-loss >/dev/null 2>&1 || true
  fi
fi

echo "==> [6] Запуск web (без пересборки образа)"
compose up -d --no-build web
sleep 8
for i in $(seq 1 40); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "  web healthy"
    break
  fi
  sleep 3
done

# Site name / public URL in DB
echo "==> [7] Название портала и URL в БД"
SITE_SQL="$(SITE_NAME="$SITE_NAME" PUBLIC_URL="$PUBLIC_URL" python3 - <<'PY'
import json, os
sn = json.dumps(os.environ["SITE_NAME"])
su = json.dumps(os.environ["PUBLIC_URL"])
print(f"""
INSERT INTO "SiteSettings" (id, "siteName", "publicSiteUrl")
VALUES ('1', {sn}::text, {su}::text)
ON CONFLICT (id) DO UPDATE
SET "siteName" = EXCLUDED."siteName", "publicSiteUrl" = EXCLUDED."publicSiteUrl";
""")
PY
)"
docker exec -i "$(db_ctr)" psql -U sochi -d sochi_portal -v ON_ERROR_STOP=0 -c "$SITE_SQL" || true

if [[ -n "$ADMIN_EMAIL" && -n "$ADMIN_PASSWORD" ]]; then
  echo "  сид администратора $ADMIN_EMAIL"
  W="$(web_ctr)"
  docker exec -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e SITE_NAME="$SITE_NAME" -e PUBLIC_URL="$PUBLIC_URL" \
    "$W" node /app/scripts/seed-bootstrap-admin.mjs || \
  docker exec -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e SITE_NAME="$SITE_NAME" -e PUBLIC_URL="$PUBLIC_URL" \
    "$W" node scripts/seed-bootstrap-admin.mjs || \
    echo "WARN: не удалось создать админа (проверьте логи web)"
fi

# ── nginx + TLS ───────────────────────────────────────────────────
echo "==> [8] Nginx + сертификаты"
mkdir -p /etc/nginx/snippets /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/well-known

cat > /etc/nginx/snippets/yp-proxy.conf <<'PX'
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header X-Request-Id $request_id;
PX

case "$RATE_PROFILE" in
  strict)
    cat > /etc/nginx/conf.d/yp-limits.conf <<'LIM'
limit_req_zone $binary_remote_addr zone=yp_general:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=yp_api:10m rate=15r/s;
limit_req_zone $binary_remote_addr zone=yp_auth:10m rate=3r/s;
limit_conn_zone $binary_remote_addr zone=yp_conn:10m;
LIM
    RATE_AUTH='limit_req zone=yp_auth burst=8 nodelay;'
    RATE_API='limit_req zone=yp_api burst=20 nodelay;'
    RATE_GENERAL='limit_req zone=yp_general burst=40 nodelay;'
    LIMIT_CONN='limit_conn yp_conn 20;'
    COLLECTIBLES="$(cat <<'C'
    location = /api/user/collectibles {
        limit_req zone=yp_api burst=3 nodelay;
        limit_conn yp_conn 8;
        limit_req_status 429;
        proxy_pass http://yp_web;
        include /etc/nginx/snippets/yp-proxy.conf;
        proxy_connect_timeout 3s;
        proxy_read_timeout 30s;
    }
    location = /api/user/eco {
        limit_req zone=yp_api burst=5 nodelay;
        limit_req_status 429;
        proxy_pass http://yp_web;
        include /etc/nginx/snippets/yp-proxy.conf;
        proxy_connect_timeout 3s;
        proxy_read_timeout 30s;
    }
C
)"
    ;;
  off)
    echo "# rate limits disabled by installer" > /etc/nginx/conf.d/yp-limits.conf
    RATE_AUTH=''
    RATE_API=''
    RATE_GENERAL=''
    LIMIT_CONN=''
    COLLECTIBLES=''
    ;;
  *)
    TPL_LIM="$(find_template nginx-yp-limits.conf || true)"
    if [[ -n "$TPL_LIM" ]]; then
      cp -f "$TPL_LIM" /etc/nginx/conf.d/yp-limits.conf
    else
      cat > /etc/nginx/conf.d/yp-limits.conf <<'LIM'
limit_req_zone $binary_remote_addr zone=yp_general:10m rate=40r/s;
limit_req_zone $binary_remote_addr zone=yp_api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=yp_auth:10m rate=5r/s;
limit_conn_zone $binary_remote_addr zone=yp_conn:10m;
LIM
    fi
    RATE_AUTH='limit_req zone=yp_auth burst=20 nodelay;'
    RATE_API='limit_req zone=yp_api burst=80 nodelay;'
    RATE_GENERAL='limit_req zone=yp_general burst=100 nodelay;'
    LIMIT_CONN='limit_conn yp_conn 40;'
    COLLECTIBLES=''
    ;;
esac

HSTS_LINE=""
if [[ "$ENABLE_HSTS" == "1" && "$TLS_MODE" != "skip" ]]; then
  HSTS_LINE='add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
fi

CONTACT_MAIL="${LE_EMAIL:-admin@${DOMAIN}}"
cat > /etc/nginx/well-known/security.txt <<ST
Contact: mailto:${CONTACT_MAIL}
Preferred-Languages: ru, en
Canonical: ${PUBLIC_URL}/.well-known/security.txt
ST

render_nginx() {
  local ssl_listen="$1" ssl_cert="$2" ssl_key="$3" http_root="$4"
  local tpl ssl_include ssl_dh
  tpl="$(find_template nginx-clone-site.conf.tpl || true)"
  ssl_include=""
  ssl_dh=""
  if [[ -n "$ssl_cert" && -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    ssl_include="include /etc/letsencrypt/options-ssl-nginx.conf;"
  elif [[ -n "$ssl_cert" ]]; then
    ssl_include="ssl_protocols TLSv1.2 TLSv1.3; ssl_prefer_server_ciphers off;"
  fi
  if [[ -n "$ssl_cert" && -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
    ssl_dh="ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  fi
  local cert_line="" key_line="" listen_line=""
  [[ -n "$ssl_listen" ]] && listen_line="$ssl_listen"
  [[ -n "$ssl_cert" ]] && cert_line="ssl_certificate ${ssl_cert};"
  [[ -n "$ssl_key" ]] && key_line="ssl_certificate_key ${ssl_key};"

  if [[ -n "$tpl" ]]; then
    local tmp="/tmp/yp-nginx-$$.conf"
    export YP_NGX_DOMAIN="$DOMAIN" YP_NGX_APP="$APP_DIR" \
      YP_NGX_RATE_AUTH="$RATE_AUTH" YP_NGX_RATE_API="$RATE_API" \
      YP_NGX_RATE_GENERAL="$RATE_GENERAL" YP_NGX_LIMIT_CONN="$LIMIT_CONN" \
      YP_NGX_COLLECTIBLES="$COLLECTIBLES" YP_NGX_HSTS="$HSTS_LINE" \
      YP_NGX_LISTEN="$listen_line" YP_NGX_CERT="$cert_line" YP_NGX_KEY="$key_line" \
      YP_NGX_INC="$ssl_include" YP_NGX_DH="$ssl_dh" YP_NGX_HTTP="$http_root"
    python3 - "$tpl" "$tmp" <<'PY'
import os, pathlib, sys
t = pathlib.Path(sys.argv[1]).read_text()
repl = {
    "__DOMAIN__": os.environ.get("YP_NGX_DOMAIN", ""),
    "__APP_DIR__": os.environ.get("YP_NGX_APP", ""),
    "__RATE_AUTH__": os.environ.get("YP_NGX_RATE_AUTH", ""),
    "__RATE_API__": os.environ.get("YP_NGX_RATE_API", ""),
    "__RATE_GENERAL__": os.environ.get("YP_NGX_RATE_GENERAL", ""),
    "__LIMIT_CONN__": os.environ.get("YP_NGX_LIMIT_CONN", ""),
    "__COLLECTIBLES__": os.environ.get("YP_NGX_COLLECTIBLES", ""),
    "__HSTS__": os.environ.get("YP_NGX_HSTS", ""),
    "__LISTEN_SSL__": os.environ.get("YP_NGX_LISTEN", ""),
    "__SSL_CERT__": os.environ.get("YP_NGX_CERT", ""),
    "__SSL_KEY__": os.environ.get("YP_NGX_KEY", ""),
    "__SSL_INCLUDE__": os.environ.get("YP_NGX_INC", ""),
    "__SSL_DHPARAM__": os.environ.get("YP_NGX_DH", ""),
    "__HTTP_ROOT__": os.environ.get("YP_NGX_HTTP", ""),
}
for k, v in repl.items():
    t = t.replace(k, v)
pathlib.Path(sys.argv[2]).write_text(t)
PY
    cp -f "$tmp" /etc/nginx/sites-available/sochi-portal
    rm -f "$tmp"
  else
    die "Нет шаблона nginx-clone-site.conf.tpl"
  fi
}

HTTP_PROXY='proxy_pass http://yp_web; include /etc/nginx/snippets/yp-proxy.conf;'
HTTP_REDIRECT='return 301 https://$host$request_uri;'

# Always start with HTTP (ACME / first boot)
render_nginx "" "" "" "$HTTP_PROXY"
ln -sfn /etc/nginx/sites-available/sochi-portal /etc/nginx/sites-enabled/sochi-portal
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx

SSL_CERT_PATH=""
SSL_KEY_PATH=""
case "$TLS_MODE" in
  letsencrypt)
    mkdir -p /var/www/html
    if command -v certbot >/dev/null 2>&1; then
      if certbot certonly --webroot -w /var/www/html -d "$DOMAIN" \
          --non-interactive --agree-tos -m "$LE_EMAIL" --keep-until-expiring; then
        SSL_CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
        SSL_KEY_PATH="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
        systemctl enable certbot.timer 2>/dev/null || true
        cat > /etc/cron.d/yp-certbot-renew <<'CRON'
17 3 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'
CRON
        chmod 644 /etc/cron.d/yp-certbot-renew
      else
        echo "WARN: Let's Encrypt не выпустился (DNS?). Остаёмся на HTTP."
        TLS_MODE=skip
        PUBLIC_URL="http://${DOMAIN}"
        ENABLE_HSTS=0
        HSTS_LINE=""
        write_env
      fi
    else
      echo "WARN: certbot не установлен"
      TLS_MODE=skip
    fi
    ;;
  custom)
    [[ -f "$TLS_CERT" && -f "$TLS_KEY" ]] || die "Нет файлов сертификата: $TLS_CERT / $TLS_KEY"
    mkdir -p /etc/yp-portal/tls
    cp -f "$TLS_CERT" /etc/yp-portal/tls/fullchain.pem
    cp -f "$TLS_KEY" /etc/yp-portal/tls/privkey.pem
    chmod 600 /etc/yp-portal/tls/privkey.pem
    SSL_CERT_PATH=/etc/yp-portal/tls/fullchain.pem
    SSL_KEY_PATH=/etc/yp-portal/tls/privkey.pem
    ;;
  selfsigned)
    mkdir -p /etc/yp-portal/tls
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout /etc/yp-portal/tls/privkey.pem \
      -out /etc/yp-portal/tls/fullchain.pem \
      -subj "/CN=${DOMAIN}/O=${SITE_NAME}"
    chmod 600 /etc/yp-portal/tls/privkey.pem
    SSL_CERT_PATH=/etc/yp-portal/tls/fullchain.pem
    SSL_KEY_PATH=/etc/yp-portal/tls/privkey.pem
    ;;
esac

if [[ -n "$SSL_CERT_PATH" ]]; then
  render_nginx "listen 443 ssl http2;" "$SSL_CERT_PATH" "$SSL_KEY_PATH" "$HTTP_REDIRECT"
  nginx -t && systemctl reload nginx
fi

# ── backup cron ───────────────────────────────────────────────────
echo "==> [9] Cron бэкапа + smoke"
if [[ -x "$APP_DIR/scripts/full-backup.sh" ]]; then
  cat > /etc/cron.d/yp-full-backup <<CRON
15 3 * * * root $APP_DIR/scripts/full-backup.sh >> /var/log/sochi-backup.log 2>&1
CRON
  chmod 644 /etc/cron.d/yp-full-backup
fi

sleep 2
HEALTH_LOCAL="$(curl -sS --max-time 15 http://127.0.0.1:3000/api/health || true)"
HEALTH_PUB="$(curl -sS --max-time 20 "${PUBLIC_URL}/api/health" || true)"
SW_VER="$(grep -o 'sochi-shell-v[0-9a-z-]*' "$APP_DIR/public/sw.js" 2>/dev/null | head -1 || true)"

mkdir -p "$APP_DIR/docs/ops"
cat > /etc/yp-portal/install-meta.json <<JSON
{
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "siteName": $(python3 -c "import json,os; print(json.dumps(os.environ.get('SN','') or '''${SITE_NAME}'''))" 2>/dev/null || echo "\"${SITE_NAME}\""),
  "domain": "${DOMAIN}",
  "publicUrl": "${PUBLIC_URL}",
  "appDir": "${APP_DIR}",
  "tlsMode": "${TLS_MODE}",
  "rateProfile": "${RATE_PROFILE}",
  "sw": "${SW_VER}",
  "source": "young.idivles.ru full clone kit"
}
JSON
chmod 600 /etc/yp-portal/install-meta.json

IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
cat <<SUMMARY

══════════════════════════════════════════════════════════════
  Установка завершена
══════════════════════════════════════════════════════════════
  Название:   ${SITE_NAME}
  URL:        ${PUBLIC_URL}
  IP:         ${IP:-unknown}
  Каталог:    ${APP_DIR}
  TLS:        ${TLS_MODE}
  SW:         ${SW_VER:-unknown}
  Health :3000: ${HEALTH_LOCAL:-'(нет ответа)'}
  Health pub:   ${HEALTH_PUB:-'(проверьте DNS / TLS)'}

  DNS:  A ${DOMAIN} → ${IP:-this-server}

  Перенастройка позже:
    sudo bash ${APP_DIR}/scripts/install-full-clone.sh --reconfigure

  Проверки:
    curl -sS ${PUBLIC_URL}/api/health
    ufw status
    docker ps
══════════════════════════════════════════════════════════════
SUMMARY

# Keep a copy of this installer next to the app
if [[ "$SELF" != "$APP_DIR/scripts/install-full-clone.sh" ]]; then
  mkdir -p "$APP_DIR/scripts" "$APP_DIR/deploy"
  cp -f "$SELF" "$APP_DIR/scripts/install-full-clone.sh"
  chmod +x "$APP_DIR/scripts/install-full-clone.sh"
  TPL="$(find_template nginx-clone-site.conf.tpl || true)"
  [[ -n "$TPL" ]] && cp -f "$TPL" "$APP_DIR/deploy/nginx-clone-site.conf.tpl"
fi
