#!/usr/bin/env bash
# YoungPortal HA sync worker — installed to /usr/local/sbin/yp-ha-sync by setup-replica-ha.sh
# Config: /etc/yp-ha.conf
set -euo pipefail

CONF="${YP_HA_CONF:-/etc/yp-ha.conf}"
# shellcheck disable=SC1090
source "$CONF"

ROLE="${ROLE:-standalone}"
PEER_HOST="${PEER_HOST:-}"
PEER_SSH_PORT="${PEER_SSH_PORT:-4488}"
PEER_SSH_USER="${PEER_SSH_USER:-yp-ha}"
APP_DIR="${APP_DIR:-/opt/sochi-portal}"
SYNC_UPLOADS="${SYNC_UPLOADS:-1}"
SHARED_SECRET="${SHARED_SECRET:-}"
LOG="${LOG:-/var/log/yp-ha-sync.log}"
STATE_DIR="${STATE_DIR:-/var/lib/yp-ha}"
COMPOSE="${COMPOSE:-docker-compose}"

mkdir -p "$STATE_DIR"
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "$(ts) $*" | tee -a "$LOG"; }

ssh_peer() {
  ssh -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o ConnectTimeout=12 \
    -i "${HA_SSH_IDENTITY:-$HOME/.ssh/id_ed25519}" \
    -p "$PEER_SSH_PORT" "${PEER_SSH_USER}@${PEER_HOST}" "$@"
}

SSH_RSH="ssh -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -i ${HA_SSH_IDENTITY:-$HOME/.ssh/id_ed25519} -p $PEER_SSH_PORT"
SCP_OPTS=(-o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -i "${HA_SSH_IDENTITY:-$HOME/.ssh/id_ed25519}" -P "$PEER_SSH_PORT")


health_local() {
  curl -fsS --max-time 8 http://127.0.0.1:3000/api/health | grep -q '"ok":true'
}

health_peer() {
  # Prefer peer private health via SSH (does not need public DNS)
  ssh_peer "curl -fsS --max-time 8 http://127.0.0.1:3000/api/health" 2>/dev/null | grep -q '"ok":true'
}

write_status() {
  local status="$1"
  printf '%s\n' "$status" > "$STATE_DIR/last-status"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$STATE_DIR/last-sync-at"
}

# Pull DB (+ uploads) from primary onto this standby
sync_as_standby() {
  [[ -n "$PEER_HOST" ]] || { log "ERROR: PEER_HOST empty"; write_status error; return 1; }
  log "standby sync from $PEER_HOST"
  local dump="/tmp/yp-ha-$$.dump"
  ssh_peer "cd '$APP_DIR' && $COMPOSE exec -T db pg_dump -U sochi -Fc sochi_portal" > "$dump"
  cd "$APP_DIR"
  $COMPOSE exec -T db pg_restore -U sochi -d sochi_portal --clean --if-exists < "$dump" || true
  rm -f "$dump"
  if [[ "$SYNC_UPLOADS" == "1" ]]; then
    rsync -az --delete \
      -e "$SSH_RSH" \
      "${PEER_SSH_USER}@${PEER_HOST}:${APP_DIR}/public/uploads/" \
      "${APP_DIR}/public/uploads/" || true
  fi
  # Keep standby NEXTAUTH_URL pointing at public domain (same brand)
  write_status ok
  log "standby sync ok"
}

# Push snapshot to standby (primary initiates)
sync_as_primary() {
  [[ -n "$PEER_HOST" ]] || { log "ERROR: PEER_HOST empty"; write_status error; return 1; }
  log "primary push to $PEER_HOST"
  local dump="/tmp/yp-ha-$$.dump"
  cd "$APP_DIR"
  $COMPOSE exec -T db pg_dump -U sochi -Fc sochi_portal > "$dump"
  scp "${SCP_OPTS[@]}" \
    "$dump" "${PEER_SSH_USER}@${PEER_HOST}:/tmp/yp-ha-incoming.dump"
  ssh_peer "cd '$APP_DIR' && $COMPOSE exec -T db pg_restore -U sochi -d sochi_portal --clean --if-exists < /tmp/yp-ha-incoming.dump && rm -f /tmp/yp-ha-incoming.dump" || true
  rm -f "$dump"
  if [[ "$SYNC_UPLOADS" == "1" ]]; then
    rsync -az --delete \
      -e "$SSH_RSH" \
      "${APP_DIR}/public/uploads/" \
      "${PEER_SSH_USER}@${PEER_HOST}:${APP_DIR}/public/uploads/" || true
  fi
  write_status ok
  log "primary push ok"
}

promote() {
  log "PROMOTE → primary (manual or auto)"
  # Flip local role
  if grep -qE '^ROLE=' "$CONF"; then
    sed -i 's/^ROLE=.*/ROLE=primary/' "$CONF"
  else
    echo 'ROLE=primary' >> "$CONF"
  fi
  # Optional DNS hook (Cloudflare / Yandex / custom)
  if [[ -n "${DNS_FAILOVER_HOOK:-}" && -x "${DNS_FAILOVER_HOOK}" ]]; then
    log "Running DNS_FAILOVER_HOOK=$DNS_FAILOVER_HOOK"
    "$DNS_FAILOVER_HOOK" || log "WARN: DNS hook failed"
  else
    log "No DNS_FAILOVER_HOOK — update A-record manually to this host"
  fi
  echo primary > "$STATE_DIR/role"
  write_status ok
}

watchdog() {
  # Called on standby when AUTO_PROMOTE=1
  local fails="${FAIL_THRESHOLD:-3}"
  local count_file="$STATE_DIR/peer-fail-count"
  local n=0
  [[ -f "$count_file" ]] && n="$(cat "$count_file" 2>/dev/null || echo 0)"
  if health_peer; then
    echo 0 > "$count_file"
    log "peer healthy"
    return 0
  fi
  n=$((n + 1))
  echo "$n" > "$count_file"
  log "peer unhealthy ($n/$fails)"
  if [[ "$n" -ge "$fails" ]]; then
    if [[ "${AUTO_PROMOTE:-0}" == "1" ]]; then
      promote
    else
      log "AUTO_PROMOTE=0 — not promoting (manual failover)"
    fi
  fi
}

cmd="${1:-sync}"
case "$cmd" in
  sync)
    case "$ROLE" in
      primary) sync_as_primary ;;
      standby) sync_as_standby ;;
      *) log "ROLE=$ROLE — nothing to sync"; write_status unknown ;;
    esac
    ;;
  watchdog)
    [[ "$ROLE" == "standby" ]] || { log "watchdog only on standby"; exit 0; }
    watchdog
    ;;
  promote)
    promote
    ;;
  status)
    echo "role=$ROLE peer=$PEER_HOST"
    echo -n "local_health="; health_local && echo ok || echo fail
    [[ -f "$STATE_DIR/last-status" ]] && echo "last=$(cat "$STATE_DIR/last-status") at $(cat "$STATE_DIR/last-sync-at" 2>/dev/null || echo ?)"
    ;;
  *)
    echo "Usage: $0 {sync|watchdog|promote|status}"
    exit 1
    ;;
esac
