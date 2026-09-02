#!/usr/bin/env bash
# One-command YoungPortal install + secure hardening on a NEW VPS.
#
# What it does (in order):
#   1) OS harden — swap, sysctl, UFW, fail2ban, unattended-upgrades, Docker logs
#   2) Fresh app install — Docker stack, .env secrets, nginx, TLS, users, backup cron
#   3) Post-check — health, bindings, .env perms, firewall, smoke
#
# ── On the VPS (project already unpacked under APP_DIR) ─────────────
#   DOMAIN=portal.example.ru \
#   ADMIN_EMAIL=admin@example.ru ADMIN_PASSWORD='StrongPass1!' \
#   TECH_EMAIL=tech@example.ru TECH_BOOTSTRAP_PASSWORD='TechPass1!' \
#   LETSENCRYPT_EMAIL=ops@example.ru \
#   bash scripts/vps-auto-setup.sh --yes
#
# ── From a workstation (uploads current tree) ───────────────────────
#   SSHPASS='root-pass' ./scripts/vps-auto-setup.sh \
#     --host root@203.0.113.10 --port 22 \
#     --domain portal.example.ru \
#     --site-name "Мой портал" \
#     --admin-email admin@example.ru --admin-password 'StrongPass1!' \
#     --tech-email tech@example.ru --tech-password 'TechPass1!' \
#     --le-email ops@example.ru \
#     --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" \
#     --yes
#
# Optional:
#   --lock-ssh          After installing your pubkey — disable password SSH
#   --skip-ssl          HTTP-only until DNS is ready
#   --skip-harden       Only run install-fresh-vps.sh
#   --skip-install      Only harden + check (existing stack)
#   --force-sni         Share :443 with xray via nginx stream SNI
#   --ssh-harden-port N Default 4488 (0 = leave OS SSH port)
#   --swap-gb N         Default 2
#   --dry-run
#
# Docs: docs/VPS-FRESH-INSTALL.md · docs/VPS-INSTALL-PITFALLS.md
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
SWAP_GB="${SWAP_GB:-2}"
SSH_PUBKEY="${SSH_PUBKEY:-}"
REMOTE_HOST=""
REMOTE_PORT="22"
SKIP_SSL=0
SKIP_HARDEN=0
SKIP_INSTALL=0
SKIP_CHECK=0
FORCE_SNI=0
LOCK_SSH=0
DRY_RUN=0
ASSUME_YES=0

usage() { sed -n '2,45p' "$0" | sed 's/^# \?//'; }

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
    --swap-gb) SWAP_GB="$2"; shift 2 ;;
    --ssh-key) SSH_PUBKEY="$2"; shift 2 ;;
    --skip-ssl) SKIP_SSL=1; shift ;;
    --skip-harden) SKIP_HARDEN=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --skip-check) SKIP_CHECK=1; shift ;;
    --force-sni) FORCE_SNI=1; shift ;;
    --lock-ssh) LOCK_SSH=1; shift ;;
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
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%%/*}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}"

if [[ $DRY_RUN -eq 1 ]]; then
  cat <<PLAN
[dry-run] vps-auto-setup plan
  domain=$DOMAIN
  site=$SITE_NAME
  app=$APP_DIR
  admin=${ADMIN_EMAIL:-'(none)'}
  tech=${TECH_EMAIL:-'(none)'}
  le=$LETSENCRYPT_EMAIL
  ssh_port=$SSH_HARDEN_PORT
  swap=${SWAP_GB}G
  skip_ssl=$SKIP_SSL skip_harden=$SKIP_HARDEN skip_install=$SKIP_INSTALL
  force_sni=$FORCE_SNI lock_ssh=$LOCK_SSH
  remote=${REMOTE_HOST:-'(local)'}
  has_ssh_key=$([[ -n "$SSH_PUBKEY" ]] && echo yes || echo no)
PLAN
  exit 0
fi

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

  echo "==> Packaging project for remote auto-setup…"
  STAGE="/tmp/yp-auto-$$"
  mkdir -p "$STAGE"
  tar -C "$ROOT_DIR" \
    --exclude=node_modules --exclude=.next --exclude=.git \
    --exclude='data/*.db' --exclude=uploads --exclude='.env' \
    --exclude='*.tgz' --exclude='*.zip' \
    -czf "$STAGE/code.tgz" .
  scp_cmd "$STAGE/code.tgz" "$REMOTE_HOST:/tmp/yp-auto-code.tgz"
  rm -rf "$STAGE"

  # Pass pubkey via base64 to avoid shell quoting issues
  KEY_B64=""
  if [[ -n "$SSH_PUBKEY" ]]; then
    KEY_B64="$(printf '%s' "$SSH_PUBKEY" | base64 -w0 2>/dev/null || printf '%s' "$SSH_PUBKEY" | base64)"
  fi

  ssh_cmd "bash -s" <<REMOTE
set -euo pipefail
export DOMAIN=$(printf '%q' "$DOMAIN")
export SITE_NAME=$(printf '%q' "$SITE_NAME")
export ADMIN_EMAIL=$(printf '%q' "$ADMIN_EMAIL")
export ADMIN_PASSWORD=$(printf '%q' "$ADMIN_PASSWORD")
export TECH_EMAIL=$(printf '%q' "$TECH_EMAIL")
export TECH_BOOTSTRAP_PASSWORD=$(printf '%q' "$TECH_BOOTSTRAP_PASSWORD")
export LETSENCRYPT_EMAIL=$(printf '%q' "$LETSENCRYPT_EMAIL")
export APP_DIR=$(printf '%q' "$APP_DIR")
export SSH_HARDEN_PORT=$(printf '%q' "$SSH_HARDEN_PORT")
export SWAP_GB=$(printf '%q' "$SWAP_GB")
export SKIP_SSL=$SKIP_SSL
export SKIP_HARDEN=$SKIP_HARDEN
export SKIP_INSTALL=$SKIP_INSTALL
export SKIP_CHECK=$SKIP_CHECK
export FORCE_SNI=$FORCE_SNI
export LOCK_SSH=$LOCK_SSH
export ASSUME_YES=1
mkdir -p "\$APP_DIR" /tmp/yp-auto-extract
rm -rf /tmp/yp-auto-extract/*
tar -xzf /tmp/yp-auto-code.tgz -C /tmp/yp-auto-extract
rsync -a --delete \
  --exclude data/postgres --exclude public/uploads --exclude .env \
  --exclude node_modules --exclude .next \
  /tmp/yp-auto-extract/ "\$APP_DIR/"
chmod +x "\$APP_DIR"/scripts/*.sh "\$APP_DIR"/scripts/*.mjs 2>/dev/null || true
cd "\$APP_DIR"
EXTRA=()
[[ "\$SKIP_SSL" == "1" ]] && EXTRA+=(--skip-ssl)
[[ "\$SKIP_HARDEN" == "1" ]] && EXTRA+=(--skip-harden)
[[ "\$SKIP_INSTALL" == "1" ]] && EXTRA+=(--skip-install)
[[ "\$SKIP_CHECK" == "1" ]] && EXTRA+=(--skip-check)
[[ "\$FORCE_SNI" == "1" ]] && EXTRA+=(--force-sni)
[[ "\$LOCK_SSH" == "1" ]] && EXTRA+=(--lock-ssh)
KEY_ARGS=()
if [[ -n "$KEY_B64" ]]; then
  KEY_ARGS+=(--ssh-key "\$(printf '%s' '$KEY_B64' | base64 -d)")
fi
bash scripts/vps-auto-setup.sh --yes \\
  --domain "\$DOMAIN" \\
  --site-name "\$SITE_NAME" \\
  --admin-email "\$ADMIN_EMAIL" \\
  --admin-password "\$ADMIN_PASSWORD" \\
  --tech-email "\$TECH_EMAIL" \\
  --tech-password "\$TECH_BOOTSTRAP_PASSWORD" \\
  --le-email "\$LETSENCRYPT_EMAIL" \\
  --app-dir "\$APP_DIR" \\
  --ssh-harden-port "\$SSH_HARDEN_PORT" \\
  --swap-gb "\$SWAP_GB" \\
  "\${KEY_ARGS[@]}" \\
  "\${EXTRA[@]}"
REMOTE
  exit $?
fi

# ─── Local (on VPS) ────────────────────────────────────────────────
if [[ $(id -u) -ne 0 ]]; then
  echo "Run as root on the target VPS (or use --host)."
  exit 1
fi

HARDEN="$ROOT_DIR/scripts/vps-secure-harden.sh"
INSTALL="$ROOT_DIR/scripts/install-fresh-vps.sh"
CHECK="$ROOT_DIR/scripts/vps-post-install-check.sh"
[[ -f "$HARDEN" ]] || HARDEN="$APP_DIR/scripts/vps-secure-harden.sh"
[[ -f "$INSTALL" ]] || INSTALL="$APP_DIR/scripts/install-fresh-vps.sh"
[[ -f "$CHECK" ]] || CHECK="$APP_DIR/scripts/vps-post-install-check.sh"

echo "============================================================"
echo " YoungPortal VPS auto-setup (secure)"
echo " Domain:  $DOMAIN"
echo " App:     $APP_DIR"
echo " Harden:  $([[ $SKIP_HARDEN -eq 1 ]] && echo SKIP || echo yes)"
echo " Install: $([[ $SKIP_INSTALL -eq 1 ]] && echo SKIP || echo yes)"
echo " LockSSH: $LOCK_SSH"
echo "============================================================"

if [[ $SKIP_HARDEN -eq 0 ]]; then
  echo
  echo ">>> Phase A — secure harden"
  HARGS=(--app-dir "$APP_DIR" --ssh-port "$SSH_HARDEN_PORT" --swap-gb "$SWAP_GB")
  [[ -n "$SSH_PUBKEY" ]] && HARGS+=(--ssh-key "$SSH_PUBKEY")
  [[ $LOCK_SSH -eq 1 ]] && HARGS+=(--lock-ssh)
  bash "$HARDEN" "${HARGS[@]}"
else
  echo ">>> Phase A skipped"
fi

if [[ $SKIP_INSTALL -eq 0 ]]; then
  echo
  echo ">>> Phase B — fresh install"
  if [[ ! -f "$INSTALL" ]]; then
    echo "ERROR: install-fresh-vps.sh not found"
    exit 1
  fi
  # Avoid double SSH port move if harden already set it
  IARGS=(
    --yes
    --domain "$DOMAIN"
    --site-name "$SITE_NAME"
    --admin-email "$ADMIN_EMAIL"
    --admin-password "$ADMIN_PASSWORD"
    --tech-email "$TECH_EMAIL"
    --tech-password "$TECH_BOOTSTRAP_PASSWORD"
    --le-email "$LETSENCRYPT_EMAIL"
    --app-dir "$APP_DIR"
    --ssh-harden-port 0
  )
  [[ $SKIP_SSL -eq 1 ]] && IARGS+=(--skip-ssl)
  [[ $FORCE_SNI -eq 1 ]] && IARGS+=(--force-sni)
  bash "$INSTALL" "${IARGS[@]}"
else
  echo ">>> Phase B skipped"
fi

# Refresh security.txt with real domain/contact
if [[ -d /etc/nginx/well-known ]]; then
  CONTACT="${ADMIN_EMAIL:-security@${DOMAIN}}"
  cat > /etc/nginx/well-known/security.txt <<ST
Contact: mailto:${CONTACT}
Preferred-Languages: ru, en
Canonical: https://${DOMAIN}/.well-known/security.txt
Expires: $(date -u -d '+1 year' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v+1y +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || echo 2027-12-31T23:59:59.000Z)
ST
fi

# Marker for operators
mkdir -p /etc/yp-portal
cat > /etc/yp-portal/install-meta.env <<META
DOMAIN=${DOMAIN}
APP_DIR=${APP_DIR}
INSTALLED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SETUP=vps-auto-setup
SSH_PORT=${SSH_HARDEN_PORT}
META
chmod 600 /etc/yp-portal/install-meta.env

if [[ $SKIP_CHECK -eq 0 ]]; then
  echo
  echo ">>> Phase C — post-install check"
  if [[ -f "$CHECK" ]]; then
    bash "$CHECK" --domain "$DOMAIN" --app-dir "$APP_DIR" || {
      echo "WARN: post-check reported failures — review output above"
    }
  else
    echo "WARN: vps-post-install-check.sh missing"
  fi
fi

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
cat <<SUMMARY

══════════════════════════════════════════════════════════════
  VPS auto-setup finished
══════════════════════════════════════════════════════════════
  URL:     https://${DOMAIN}
  IP:      ${SERVER_IP:-unknown}
  App:     ${APP_DIR}
  Admin:   ${ADMIN_EMAIL:-'(not seeded)'}
  TECH:    ${TECH_EMAIL:-'(set TECH_EMAIL)'} → /ops
  SSH:     port ${SSH_HARDEN_PORT}
  Meta:    /etc/yp-portal/install-meta.env

  DNS:  A ${DOMAIN} → ${SERVER_IP:-this-server}

  After you confirm SSH on port ${SSH_HARDEN_PORT} with your key:
    bash ${APP_DIR}/scripts/vps-secure-harden.sh --ssh-port ${SSH_HARDEN_PORT} --lock-ssh --ssh-key 'ssh-ed25519 AAAA…'
    ufw delete allow 22/tcp

  Re-check anytime:
    bash ${APP_DIR}/scripts/vps-post-install-check.sh --domain ${DOMAIN}

  Docs: docs/VPS-FRESH-INSTALL.md · docs/VPS-INSTALL-PITFALLS.md
══════════════════════════════════════════════════════════════
SUMMARY
