#!/usr/bin/env bash
# Full automation: standardize accounts + wire primary↔standby HA from a workstation.
#
# Prerequisites:
#   - Both VPS already have the app installed (install-fresh-vps.sh) OR primary is live
#     and standby was installed with the SAME domain / NEXTAUTH_SECRET.
#   - Root (or bootstrap) SSH access to both hosts for the first run.
#
# Usage:
#   SSHPASS='root-pass' ./scripts/setup-replica-pair.sh \
#     --primary root@176.124.204.53 --primary-port 4488 \
#     --standby root@203.0.113.20 --standby-port 4488 \
#     --shared-secret 'long-random' \
#     --failover-mode dns-ttl \
#     --sync-interval-min 15
#
# Optional:
#   PRIMARY_SSHPASS / STANDBY_SSHPASS (or TYOUNG_SSHPASS) — different root passwords per node
#   SSHPASS — fallback for both
#   --auto-promote          enable standby watchdog auto-promote
#   --dns-hook 'cmd…'       run on promote (Cloudflare/Yandex API etc.)
#   --skip-bootstrap-keys   assume yp-ha keys already mutual
#   --app-dir /opt/sochi-portal
#   --dry-run
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${APP_DIR:-/opt/sochi-portal}"
PRIMARY=""
PRIMARY_PORT="4488"
STANDBY=""
STANDBY_PORT="4488"
SHARED_SECRET=""
FAILOVER_MODE="manual"
SYNC_INTERVAL_MIN="15"
AUTO_PROMOTE=0
DNS_HOOK=""
SKIP_KEYS=0
DRY_RUN=0
HA_USER="yp-ha"

usage() { sed -n '2,28p' "$0" | sed 's/^# \?//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --primary) PRIMARY="$2"; shift 2 ;;
    --primary-port) PRIMARY_PORT="$2"; shift 2 ;;
    --standby) STANDBY="$2"; shift 2 ;;
    --standby-port) STANDBY_PORT="$2"; shift 2 ;;
    --shared-secret) SHARED_SECRET="$2"; shift 2 ;;
    --failover-mode) FAILOVER_MODE="$2"; shift 2 ;;
    --sync-interval-min) SYNC_INTERVAL_MIN="$2"; shift 2 ;;
    --auto-promote) AUTO_PROMOTE=1; shift ;;
    --dns-hook) DNS_HOOK="$2"; shift 2 ;;
    --skip-bootstrap-keys) SKIP_KEYS=1; shift ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1"; usage; exit 1 ;;
  esac
done

[[ -n "$PRIMARY" && -n "$STANDBY" ]] || { echo "--primary and --standby required"; exit 1; }
[[ -n "$SHARED_SECRET" ]] || SHARED_SECRET="$(openssl rand -hex 24)"
[[ "$FAILOVER_MODE" == "manual" || "$FAILOVER_MODE" == "dns-ttl" || "$FAILOVER_MODE" == "floating-ip" ]] || {
  echo "--failover-mode must be manual|dns-ttl|floating-ip"; exit 1;
}

primary_ip="${PRIMARY#*@}"
standby_ip="${STANDBY#*@}"

pass_for() {
  local host="$1"
  if [[ "$host" == "$STANDBY" || "$host" == *"$standby_ip"* ]]; then
    echo "${STANDBY_SSHPASS:-${TYOUNG_SSHPASS:-${SSHPASS:-}}}"
  else
    echo "${PRIMARY_SSHPASS:-${SSHPASS:-}}"
  fi
}

ssh_to() {
  local host="$1" port="$2"; shift 2
  local opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -p "$port")
  local pass; pass="$(pass_for "$host")"
  if [[ -n "$pass" ]] && command -v sshpass >/dev/null 2>&1; then
    SSHPASS="$pass" sshpass -e ssh "${opts[@]}" "$host" "$@"
  else
    ssh "${opts[@]}" "$host" "$@"
  fi
}

scp_to() {
  local port="$1" src="$2" dest="$3"
  local host="${dest%%:*}"
  local opts=(-o StrictHostKeyChecking=accept-new -P "$port")
  local pass; pass="$(pass_for "$host")"
  if [[ -n "$pass" ]] && command -v sshpass >/dev/null 2>&1; then
    SSHPASS="$pass" sshpass -e scp "${opts[@]}" "$src" "$dest"
  else
    scp "${opts[@]}" "$src" "$dest"
  fi
}

if [[ $DRY_RUN -eq 1 ]]; then
  cat <<PLAN
[dry-run] setup-replica-pair
  primary=$PRIMARY:$PRIMARY_PORT ($primary_ip)
  standby=$STANDBY:$STANDBY_PORT ($standby_ip)
  app=$APP_DIR ha_user=$HA_USER
  mode=$FAILOVER_MODE interval=$SYNC_INTERVAL_MIN auto_promote=$AUTO_PROMOTE
PLAN
  exit 0
fi

echo "==> [1/5] Sync HA helper scripts to both nodes"
for pair in "$PRIMARY:$PRIMARY_PORT" "$STANDBY:$STANDBY_PORT"; do
  host="${pair%%:*}"; port="${pair##*:}"
  ssh_to "$host" "$port" "mkdir -p '$APP_DIR/scripts'"
  for f in setup-project-users.sh bootstrap-ha-ssh.sh setup-replica-ha.sh yp-ha-sync.sh setup-replica-pair.sh; do
    scp_to "$port" "$ROOT/scripts/$f" "$host:$APP_DIR/scripts/$f"
    ssh_to "$host" "$port" "chmod +x '$APP_DIR/scripts/$f'"
  done
done

echo "==> [2/5] Standardize project users on both nodes"
ssh_to "$PRIMARY" "$PRIMARY_PORT" "bash '$APP_DIR/scripts/setup-project-users.sh' --app-dir '$APP_DIR' --with-keys"
ssh_to "$STANDBY" "$STANDBY_PORT" "bash '$APP_DIR/scripts/setup-project-users.sh' --app-dir '$APP_DIR' --with-keys"

if [[ $SKIP_KEYS -eq 0 ]]; then
  echo "==> [3/5] Mutual HA SSH trust (yp-ha ↔ yp-ha)"
  PEER_PASS_FROM_PRIMARY="$(pass_for "$STANDBY")"
  PEER_PASS_FROM_STANDBY="$(pass_for "$PRIMARY")"
  ssh_to "$PRIMARY" "$PRIMARY_PORT" \
    "SSHPASS='${PEER_PASS_FROM_PRIMARY}' bash '$APP_DIR/scripts/bootstrap-ha-ssh.sh' \
      --peer-host '$standby_ip' --peer-ssh-port '$STANDBY_PORT' --app-dir '$APP_DIR' --ha-user '$HA_USER'" \
    || {
      echo "WARN: primary→standby key bootstrap failed; trying reverse…"
      ssh_to "$STANDBY" "$STANDBY_PORT" \
        "SSHPASS='${PEER_PASS_FROM_STANDBY}' bash '$APP_DIR/scripts/bootstrap-ha-ssh.sh' \
          --peer-host '$primary_ip' --peer-ssh-port '$PRIMARY_PORT' --app-dir '$APP_DIR' --ha-user '$HA_USER'"
      ssh_to "$PRIMARY" "$PRIMARY_PORT" \
        "SSHPASS='${PEER_PASS_FROM_PRIMARY}' bash '$APP_DIR/scripts/bootstrap-ha-ssh.sh' \
          --peer-host '$standby_ip' --peer-ssh-port '$STANDBY_PORT' --app-dir '$APP_DIR' --ha-user '$HA_USER'"
    }
else
  echo "==> [3/5] Skipping key bootstrap"
fi

HA_ARGS_COMMON=(
  --peer-ssh-user "$HA_USER"
  --shared-secret "$SHARED_SECRET"
  --failover-mode "$FAILOVER_MODE"
  --sync-interval-min "$SYNC_INTERVAL_MIN"
  --app-dir "$APP_DIR"
)
[[ -n "$DNS_HOOK" ]] && HA_ARGS_COMMON+=(--dns-hook "$DNS_HOOK")

echo "==> [4/5] Configure PRIMARY"
ssh_to "$PRIMARY" "$PRIMARY_PORT" "bash '$APP_DIR/scripts/setup-replica-ha.sh' \
  --role primary --peer-host '$standby_ip' --peer-ssh-port '$STANDBY_PORT' \
  --priority 100 ${HA_ARGS_COMMON[*]}"

echo "==> [5/5] Configure STANDBY"
PROMOTE_FLAG=""
[[ $AUTO_PROMOTE -eq 1 ]] && PROMOTE_FLAG="--auto-promote"
ssh_to "$STANDBY" "$STANDBY_PORT" "bash '$APP_DIR/scripts/setup-replica-ha.sh' \
  --role standby --peer-host '$primary_ip' --peer-ssh-port '$PRIMARY_PORT' \
  --priority 50 $PROMOTE_FLAG ${HA_ARGS_COMMON[*]}"

cat <<SUMMARY

══════════════════════════════════════════════════════════════
  Replica pair configured
══════════════════════════════════════════════════════════════
  Primary:  $PRIMARY  (priority 100)
  Standby:  $STANDBY  (priority 50)
  HA user:  $HA_USER
  Secret:   (stored in /etc/yp-ha.conf on both nodes)
  Mode:     $FAILOVER_MODE
  Auto-promote: $AUTO_PROMOTE

  Verify:
    ssh -p $PRIMARY_PORT $PRIMARY 'yp-ha-sync status'
    ssh -p $STANDBY_PORT $STANDBY 'yp-ha-sync status'
    ssh -p $STANDBY_PORT $STANDBY 'sudo -u $HA_USER yp-ha-sync sync'

  DNS A for the public domain must point at PRIMARY until failover.
  Docs: docs/VPS-REPLICA-FAILOVER.md
══════════════════════════════════════════════════════════════
SUMMARY
