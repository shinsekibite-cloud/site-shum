#!/usr/bin/env bash
# OS / Docker / SSH hardening for YoungPortal VPS (idempotent, safe defaults).
#
# Usage (as root):
#   bash scripts/vps-secure-harden.sh
#   bash scripts/vps-secure-harden.sh --app-dir /opt/sochi-portal --ssh-port 4488
#   bash scripts/vps-secure-harden.sh --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" --lock-ssh
#   bash scripts/vps-secure-harden.sh --dry-run
#
# Does NOT install the app stack — see scripts/vps-auto-setup.sh / install-fresh-vps.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
SSH_PORT="${SSH_PORT:-4488}"
SWAP_GB="${SWAP_GB:-2}"
SSH_PUBKEY="${SSH_PUBKEY:-}"
LOCK_SSH=0
DRY_RUN=0
SKIP_SWAP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --swap-gb) SWAP_GB="$2"; shift 2 ;;
    --ssh-key) SSH_PUBKEY="$2"; shift 2 ;;
    --lock-ssh) LOCK_SSH=1; shift ;;
    --skip-swap) SKIP_SWAP=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [[ $(id -u) -ne 0 && $DRY_RUN -eq 0 ]]; then
  echo "Run as root"; exit 1
fi

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

echo "=== YoungPortal VPS harden ==="
echo "  app=$APP_DIR  ssh_port=$SSH_PORT  swap=${SWAP_GB}G  lock_ssh=$LOCK_SSH"

# ── packages ───────────────────────────────────────────────────────
echo "==> [1/8] Base packages"
if [[ $DRY_RUN -eq 0 ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y \
    ca-certificates curl gnupg lsb-release ufw fail2ban \
    unattended-upgrades apt-listchanges needrestart \
    logrotate rsync openssl dnsutils iproute2 cron \
    nginx
fi

# ── swap (small VPS) ───────────────────────────────────────────────
echo "==> [2/8] Swap"
SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
if [[ $SKIP_SWAP -eq 1 ]]; then
  echo "  skip swap"
elif [[ "${SWAP_MB:-0}" -ge $((SWAP_GB * 900)) ]]; then
  echo "  swap already ${SWAP_MB}MB"
else
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[dry-run] would create /swapfile ${SWAP_GB}G"
  else
    if [[ ! -f /swapfile ]]; then
      fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=progress
      chmod 600 /swapfile
      mkswap /swapfile
      swapon /swapfile
      if ! grep -qE '^/swapfile\s' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
      fi
      echo "  created /swapfile ${SWAP_GB}G"
    else
      swapon /swapfile 2>/dev/null || true
      echo "  enabled existing /swapfile"
    fi
    # Prefer keeping some free RAM under load
    sysctl -w vm.swappiness=10 >/dev/null || true
  fi
fi

# ── sysctl ─────────────────────────────────────────────────────────
echo "==> [3/8] Kernel / network sysctl"
SYSCTL_FILE=/etc/sysctl.d/99-yp-hardening.conf
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] write $SYSCTL_FILE"
else
  cat > "$SYSCTL_FILE" <<'SYS'
# YoungPortal VPS hardening
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.log_martians = 1
fs.file-max = 2097152
vm.swappiness = 10
SYS
  sysctl --system >/dev/null 2>&1 || sysctl -p "$SYSCTL_FILE" || true
fi

# ── unattended upgrades ────────────────────────────────────────────
echo "==> [4/8] Unattended security upgrades"
if [[ $DRY_RUN -eq 0 ]]; then
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AU'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
AU
  # Prefer security-only auto install (Debian/Ubuntu defaults usually OK)
  if [[ -f /etc/apt/apt.conf.d/50unattended-upgrades ]]; then
    sed -i 's|^//\s*"\${distro_id}:\${distro_codename}-security";|"${distro_id}:${distro_codename}-security";|' \
      /etc/apt/apt.conf.d/50unattended-upgrades || true
  fi
  systemctl enable --now unattended-upgrades 2>/dev/null || true
fi

# ── SSH ────────────────────────────────────────────────────────────
echo "==> [5/8] SSH + fail2ban + UFW"
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/99-yp-hardening.conf <<SSH
# Managed by scripts/vps-secure-harden.sh — YoungPortal
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
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh
    touch /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
    if ! grep -qxF "$SSH_PUBKEY" /root/.ssh/authorized_keys 2>/dev/null; then
      echo "$SSH_PUBKEY" >> /root/.ssh/authorized_keys
      echo "  added SSH pubkey to /root/.ssh/authorized_keys"
    fi
  fi

  if [[ $LOCK_SSH -eq 1 ]]; then
    if [[ ! -s /root/.ssh/authorized_keys ]]; then
      echo "ERROR: --lock-ssh requires a key in /root/.ssh/authorized_keys (pass --ssh-key)"
      exit 1
    fi
    cat >> /etc/ssh/sshd_config.d/99-yp-hardening.conf <<'LOCK'
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
LOCK
    echo "  SSH locked to key-only (root)"
  else
    cat >> /etc/ssh/sshd_config.d/99-yp-hardening.conf <<'SOFT'
# Soft mode: keep password until you add a key and re-run with --lock-ssh
PermitRootLogin yes
PasswordAuthentication yes
PubkeyAuthentication yes
SOFT
    echo "  SSH soft mode (password still allowed). Re-run with --lock-ssh after adding a key."
  fi

  # Keep Port also in main config for older sshd that ignore drop-ins poorly
  if [[ -f /etc/ssh/sshd_config ]]; then
    if ! grep -qE "^Port ${SSH_PORT}$" /etc/ssh/sshd_config; then
      sed -i 's/^#\?Port .*/Port '"${SSH_PORT}"'/' /etc/ssh/sshd_config || true
      if ! grep -qE "^Port ${SSH_PORT}$" /etc/ssh/sshd_config; then
        echo "Port ${SSH_PORT}" >> /etc/ssh/sshd_config
      fi
    fi
  fi

  sshd -t && (systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true)

  ufw default deny incoming || true
  ufw default allow outgoing || true
  ufw allow "${SSH_PORT}/tcp" comment 'yp-ssh' || true
  ufw allow 80/tcp comment 'http' || true
  ufw allow 443/tcp comment 'https' || true
  # Keep 22 open briefly if we moved port — remove after you confirm new port works
  if [[ "$SSH_PORT" != "22" ]]; then
    ufw allow 22/tcp comment 'ssh-legacy-temp' || true
  fi
  ufw --force enable || true

  cat > /etc/fail2ban/jail.d/yp-sshd.local <<JAIL
[sshd]
enabled = true
port = ${SSH_PORT},22
filter = sshd
maxretry = 5
findtime = 600
bantime = 86400
JAIL
  systemctl enable --now fail2ban
  systemctl restart fail2ban || true
fi

# ── Docker daemon limits ───────────────────────────────────────────
echo "==> [6/8] Docker daemon log rotation"
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p /etc/docker
  if [[ -f /etc/docker/daemon.json ]]; then
    # Don't clobber custom daemon.json — merge lightly only if empty/simple
    if ! grep -q '"log-driver"' /etc/docker/daemon.json 2>/dev/null; then
      echo "  WARN: /etc/docker/daemon.json exists without log-driver — leave unchanged"
    else
      echo "  docker daemon.json already has log-driver"
    fi
  else
    cat > /etc/docker/daemon.json <<'DJ'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "25m",
    "max-file": "5"
  },
  "live-restore": true,
  "userland-proxy": false
}
DJ
    systemctl restart docker 2>/dev/null || true
  fi
fi

# ── logrotate / journal ────────────────────────────────────────────
echo "==> [7/8] Logrotate + journald caps"
if [[ $DRY_RUN -eq 0 ]]; then
  cat > /etc/logrotate.d/yp-portal <<LR
/var/log/sochi-backup.log
/var/log/yp-*.log
{
  weekly
  rotate 8
  missingok
  notifempty
  compress
  delaycompress
  copytruncate
}
LR
  mkdir -p /etc/systemd/journald.conf.d
  cat > /etc/systemd/journald.conf.d/yp-size.conf <<'J'
[Journal]
SystemMaxUse=200M
RuntimeMaxUse=100M
J
  systemctl restart systemd-journald 2>/dev/null || true
fi

# ── app dirs / secrets perms ──────────────────────────────────────
echo "==> [8/8] App dirs + secret permissions"
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p "$APP_DIR" /var/backups/sochi-portal /var/log /etc/yp-portal
  chmod 700 /etc/yp-portal /var/backups/sochi-portal
  if [[ -f "$APP_DIR/.env" ]]; then
    chmod 600 "$APP_DIR/.env"
    chown root:root "$APP_DIR/.env" 2>/dev/null || true
  fi
  # security.txt stub for nginx well-known (domain filled later by install)
  mkdir -p /etc/nginx/well-known
  if [[ ! -f /etc/nginx/well-known/security.txt ]]; then
    cat > /etc/nginx/well-known/security.txt <<'ST'
Contact: mailto:security@localhost
Preferred-Languages: ru, en
Canonical: https://localhost/.well-known/security.txt
ST
  fi
fi

cat <<DONE

Harden complete.
  Next: bash scripts/vps-auto-setup.sh --domain …   (or install-fresh-vps.sh)
  After SSH key works: re-run with --lock-ssh and then:
    ufw delete allow 22/tcp
DONE
