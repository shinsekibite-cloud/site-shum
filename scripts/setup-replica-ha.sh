#!/usr/bin/env bash
# Configure YoungPortal primary ↔ standby replication on two VPS.
#
# Prerequisites: both nodes already installed (scripts/install-fresh-vps.sh),
# SSH key auth between them, same DOMAIN A-record currently on PRIMARY.
#
# On PRIMARY:
#   bash scripts/setup-replica-ha.sh \
#     --role primary \
#     --peer-host 203.0.113.20 \
#     --peer-ssh-port 4488 \
#     --shared-secret 'long-random' \
#     --failover-mode dns-ttl \
#     --priority 100
#
# On STANDBY:
#   bash scripts/setup-replica-ha.sh \
#     --role standby \
#     --peer-host 203.0.113.10 \
#     --peer-ssh-port 4488 \
#     --shared-secret 'long-random' \
#     --failover-mode dns-ttl \
#     --priority 50 \
#     --auto-promote   # optional; default off
#
# Priority: higher = preferred primary when both healthy (documented for operators;
# auto-rebalance is manual unless DNS_FAILOVER_HOOK implements it).
#
# Domain strategy (see docs/VPS-REPLICA-FAILOVER.md):
#   manual      — change DNS A by hand after promote
#   dns-ttl     — low TTL + DNS API hook on promote
#   floating-ip — provider floating IP move (best RTO)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
ROLE=""
PEER_HOST=""
PEER_SSH_PORT="4488"
PEER_SSH_USER="yp-ha"
SHARED_SECRET=""
FAILOVER_MODE="manual"
AUTO_PROMOTE=0
PRIORITY="100"
SYNC_INTERVAL_MIN="15"
SYNC_UPLOADS=1
DRY_RUN=0
DNS_FAILOVER_HOOK=""

usage() { sed -n '2,35p' "$0" | sed 's/^# \?//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --role) ROLE="$2"; shift 2 ;;
    --peer-host) PEER_HOST="$2"; shift 2 ;;
    --peer-ssh-port) PEER_SSH_PORT="$2"; shift 2 ;;
    --peer-ssh-user) PEER_SSH_USER="$2"; shift 2 ;;
    --shared-secret) SHARED_SECRET="$2"; shift 2 ;;
    --failover-mode) FAILOVER_MODE="$2"; shift 2 ;;
    --priority) PRIORITY="$2"; shift 2 ;;
    --sync-interval-min) SYNC_INTERVAL_MIN="$2"; shift 2 ;;
    --no-uploads) SYNC_UPLOADS=0; shift ;;
    --auto-promote) AUTO_PROMOTE=1; shift ;;
    --dns-hook) DNS_FAILOVER_HOOK="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
done

[[ "$ROLE" == "primary" || "$ROLE" == "standby" ]] || { echo "--role primary|standby required"; exit 1; }
[[ -n "$PEER_HOST" ]] || { echo "--peer-host required"; exit 1; }
[[ -n "$SHARED_SECRET" ]] || SHARED_SECRET="$(openssl rand -hex 24)"
[[ "$FAILOVER_MODE" == "manual" || "$FAILOVER_MODE" == "dns-ttl" || "$FAILOVER_MODE" == "floating-ip" ]] || {
  echo "--failover-mode must be manual|dns-ttl|floating-ip"; exit 1;
}

if [[ $(id -u) -ne 0 && $DRY_RUN -eq 0 ]]; then
  echo "Run as root"; exit 1
fi

CONF=/etc/yp-ha.conf
SYNC_BIN=/usr/local/sbin/yp-ha-sync
STATE_DIR=/var/lib/yp-ha

echo "============================================================"
echo " HA setup: role=$ROLE peer=$PEER_HOST mode=$FAILOVER_MODE"
echo " priority=$PRIORITY auto_promote=$AUTO_PROMOTE"
echo "============================================================"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] would write $CONF and install $SYNC_BIN + cron"
  exit 0
fi

# Prefer dedicated project accounts (yp-deploy / yp-ha)
if [[ -x "$APP_DIR/scripts/setup-project-users.sh" ]]; then
  bash "$APP_DIR/scripts/setup-project-users.sh" --app-dir "$APP_DIR" --with-keys || true
fi
HA_RUN_USER="$PEER_SSH_USER"
id "$HA_RUN_USER" >/dev/null 2>&1 || HA_RUN_USER="root"

mkdir -p "$STATE_DIR" /var/log
install -m 755 "$APP_DIR/scripts/yp-ha-sync.sh" "$SYNC_BIN"
chown root:docker "$SYNC_BIN" 2>/dev/null || true
chmod 750 "$SYNC_BIN"

umask 077
cat > "$CONF" <<EOF
# YoungPortal HA — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
ROLE=$ROLE
PEER_HOST=$PEER_HOST
PEER_SSH_PORT=$PEER_SSH_PORT
PEER_SSH_USER=$PEER_SSH_USER
APP_DIR=$APP_DIR
SYNC_UPLOADS=$SYNC_UPLOADS
SHARED_SECRET=$SHARED_SECRET
FAILOVER_MODE=$FAILOVER_MODE
AUTO_PROMOTE=$AUTO_PROMOTE
PRIORITY=$PRIORITY
FAIL_THRESHOLD=3
COMPOSE=docker-compose
LOG=/var/log/yp-ha-sync.log
STATE_DIR=$STATE_DIR
DNS_FAILOVER_HOOK=$DNS_FAILOVER_HOOK
EOF
chmod 640 "$CONF"
chown root:docker "$CONF" 2>/dev/null || chmod 600 "$CONF"
echo "$ROLE" > "$STATE_DIR/role"
chown -R "${HA_RUN_USER}:docker" "$STATE_DIR" 2>/dev/null || true
touch /var/log/yp-ha-sync.log
chown "${HA_RUN_USER}:docker" /var/log/yp-ha-sync.log 2>/dev/null || true

# Cron: sync every N minutes; standby also runs watchdog every 2 min (as yp-ha when available)
CRON_FILE=/etc/cron.d/yp-ha
cat > "$CRON_FILE" <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/${SYNC_INTERVAL_MIN} * * * * $HA_RUN_USER $SYNC_BIN sync >> /var/log/yp-ha-sync.log 2>&1
CRON
if [[ "$ROLE" == "standby" ]]; then
  cat >> "$CRON_FILE" <<CRON
*/2 * * * * $HA_RUN_USER $SYNC_BIN watchdog >> /var/log/yp-ha-sync.log 2>&1
CRON
fi
chmod 644 "$CRON_FILE"

# Persist replicaJson hint into DB (best-effort; admin UI can refine)
if command -v docker-compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1; then
  cd "$APP_DIR"
  COMPOSE=docker-compose
  docker compose version >/dev/null 2>&1 && COMPOSE="docker compose" || true
  JSON=$(python3 - <<PY
import json
print(json.dumps({
  "enabled": True,
  "role": "$ROLE",
  "peerHost": "$PEER_HOST",
  "peerSshPort": int("$PEER_SSH_PORT"),
  "sharedSecret": "$SHARED_SECRET",
  "syncIntervalMin": int("$SYNC_INTERVAL_MIN"),
  "syncUploads": bool($SYNC_UPLOADS),
  "failoverMode": "$FAILOVER_MODE",
  "autoPromote": bool($AUTO_PROMOTE),
  "lastHeartbeatAt": None,
  "lastSyncAt": None,
  "lastSyncStatus": "unknown",
  "notes": "priority=$PRIORITY via setup-replica-ha.sh",
}, ensure_ascii=False))
PY
)
  ESCAPED=${JSON//\'/\'\'}
  $COMPOSE exec -T db psql -U sochi -d sochi_portal -c \
    "UPDATE \"SiteSettings\" SET \"replicaJson\" = '$ESCAPED', \"updatedAt\" = NOW() WHERE id = '1';" \
    </dev/null 2>/dev/null || true
fi

# First sync attempt
"$SYNC_BIN" status || true
if [[ "$ROLE" == "standby" || "$ROLE" == "primary" ]]; then
  "$SYNC_BIN" sync || echo "WARN: initial sync failed — check SSH keys to peer"
fi

cat <<SUMMARY

══════════════════════════════════════════════════════════════
  Replica HA configured
══════════════════════════════════════════════════════════════
  Role:           $ROLE (priority $PRIORITY)
  Peer:           $PEER_SSH_USER@$PEER_HOST:$PEER_SSH_PORT
  Config:         $CONF
  Sync binary:    $SYNC_BIN
  Failover mode:  $FAILOVER_MODE
  Auto-promote:   $AUTO_PROMOTE

  Domain how-to:
    • Prefer ONE public hostname (e.g. young.example.ru).
    • DNS A points to the active primary.
    • On promote: update A (manual) OR run DNS_FAILOVER_HOOK
      OR move floating IP (provider panel / API).
    • Keep TTL ≤ 120s if using dns-ttl mode.
    • Never let both nodes accept public write traffic (split-brain).

  Commands:
    yp-ha-sync status
    yp-ha-sync sync
    yp-ha-sync promote   # on standby when primary is dead

  Docs: docs/VPS-REPLICA-FAILOVER.md
══════════════════════════════════════════════════════════════
SUMMARY
