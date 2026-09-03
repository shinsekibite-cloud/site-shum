#!/usr/bin/env bash
# Exchange HA SSH keys between this node and a peer (idempotent).
#
# Run as root on PRIMARY (or from workstation with --local-host / --peer-host).
#
# On primary:
#   bash scripts/bootstrap-ha-ssh.sh \
#     --peer-host 203.0.113.20 \
#     --peer-ssh-port 4488 \
#     --peer-root-pass   # optional if using SSHPASS for first bootstrap
#
# Env:
#   SSHPASS — password for initial root@peer (only to install yp-ha pubkey once)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
HA_USER="${HA_USER:-yp-ha}"
PEER_HOST=""
PEER_SSH_PORT="4488"
PEER_BOOTSTRAP_USER="root"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --peer-host) PEER_HOST="$2"; shift 2 ;;
    --peer-ssh-port) PEER_SSH_PORT="$2"; shift 2 ;;
    --peer-bootstrap-user) PEER_BOOTSTRAP_USER="$2"; shift 2 ;;
    --ha-user) HA_USER="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

[[ -n "$PEER_HOST" ]] || { echo "--peer-host required"; exit 1; }

if [[ $(id -u) -ne 0 && $DRY_RUN -eq 0 ]]; then
  echo "Run as root on the local node"; exit 1
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] would ensure $HA_USER keys and install mutual authorized_keys with $PEER_HOST:$PEER_SSH_PORT"
  exit 0
fi

# Ensure local project users + key
bash "$APP_DIR/scripts/setup-project-users.sh" --app-dir "$APP_DIR" --ha-user "$HA_USER" --with-keys

LOCAL_PUB="/home/${HA_USER}/.ssh/id_ed25519.pub"
[[ -f "$LOCAL_PUB" ]] || { echo "Missing $LOCAL_PUB"; exit 1; }
LOCAL_PUBKEY="$(cat "$LOCAL_PUB")"

ssh_peer_root() {
  local opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -p "$PEER_SSH_PORT")
  if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -e ssh "${opts[@]}" "${PEER_BOOTSTRAP_USER}@${PEER_HOST}" "$@"
  else
    ssh "${opts[@]}" "${PEER_BOOTSTRAP_USER}@${PEER_HOST}" "$@"
  fi
}

echo "==> Ensuring peer project users + installing our HA pubkey"
ssh_peer_root "bash -s" <<REMOTE
set -euo pipefail
APP='$APP_DIR'
HA='$HA_USER'
PUB='$LOCAL_PUBKEY'
if [[ -x "\$APP/scripts/setup-project-users.sh" ]]; then
  bash "\$APP/scripts/setup-project-users.sh" --app-dir "\$APP" --ha-user "\$HA" --with-keys
else
  echo "WARN: peer missing setup-project-users.sh — creating user minimally"
  getent group docker >/dev/null || groupadd docker
  id "\$HA" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash --groups docker "\$HA"
  usermod -aG docker "\$HA"
  mkdir -p /home/\$HA/.ssh
  chmod 700 /home/\$HA/.ssh
  touch /home/\$HA/.ssh/authorized_keys
  chown -R \$HA:\$HA /home/\$HA/.ssh
fi
grep -qxF "\$PUB" /home/\$HA/.ssh/authorized_keys || echo "\$PUB" >> /home/\$HA/.ssh/authorized_keys
chown \$HA:\$HA /home/\$HA/.ssh/authorized_keys
chmod 600 /home/\$HA/.ssh/authorized_keys
# Print peer pubkey for local install
if [[ -f /home/\$HA/.ssh/id_ed25519.pub ]]; then
  cat /home/\$HA/.ssh/id_ed25519.pub
else
  sudo -u \$HA ssh-keygen -t ed25519 -N '' -f /home/\$HA/.ssh/id_ed25519 -C "yp-ha@peer" >/dev/null
  cat /home/\$HA/.ssh/id_ed25519.pub
fi
REMOTE

# Capture peer pubkey (last non-empty line of ssh output that looks like a key)
PEER_PUBKEY="$(ssh_peer_root "cat /home/${HA_USER}/.ssh/id_ed25519.pub")"
PEER_PUBKEY="$(echo "$PEER_PUBKEY" | grep -E '^ssh-' | tail -1)"
[[ -n "$PEER_PUBKEY" ]] || { echo "Could not read peer pubkey"; exit 1; }

grep -qxF "$PEER_PUBKEY" "/home/${HA_USER}/.ssh/authorized_keys" \
  || echo "$PEER_PUBKEY" >> "/home/${HA_USER}/.ssh/authorized_keys"
chown "${HA_USER}:${HA_USER}" "/home/${HA_USER}/.ssh/authorized_keys"
chmod 600 "/home/${HA_USER}/.ssh/authorized_keys"

# known_hosts + connectivity as yp-ha
sudo -u "$HA_USER" ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12 \
  -p "$PEER_SSH_PORT" "${HA_USER}@${PEER_HOST}" "echo peer-ok && id" || {
  echo "WARN: ${HA_USER}@${PEER_HOST} login failed — check authorized_keys / firewall"
  exit 1
}

echo "HA SSH mutual trust OK: ${HA_USER} ↔ ${PEER_HOST}:${PEER_SSH_PORT}"
