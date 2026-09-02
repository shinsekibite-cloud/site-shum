#!/usr/bin/env bash
# Post-install verification: security surface + service health (read-mostly).
#
# Usage (on VPS as root):
#   bash scripts/vps-post-install-check.sh --domain portal.example.ru
#   bash scripts/vps-post-install-check.sh --domain portal.example.ru --app-dir /opt/sochi-portal
set -euo pipefail

DOMAIN=""
APP_DIR="${APP_DIR:-/opt/sochi-portal}"
WARN=0
FAIL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

ok() { echo "OK   $*"; }
warn() { echo "WARN $*"; WARN=$((WARN + 1)); }
fail() { echo "FAIL $*"; FAIL=$((FAIL + 1)); }

echo "=== YoungPortal post-install check ==="
echo "  app=$APP_DIR  domain=${DOMAIN:-'(none)'}"
echo

# Docker stack
if command -v docker >/dev/null 2>&1; then
  ok "docker present"
  COMPOSE="docker compose"
  docker compose version >/dev/null 2>&1 || COMPOSE="docker-compose"
  if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
    cd "$APP_DIR"
    if $COMPOSE ps 2>/dev/null | grep -q web; then
      ok "compose web listed"
    else
      fail "compose web not running"
    fi
  else
    fail "missing $APP_DIR/docker-compose.yml"
  fi
else
  fail "docker missing"
fi

# Health
if curl -fsS --max-time 15 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  ok "local /api/health"
else
  fail "local /api/health"
fi

# Bindings: web must not be public
if ss -tlnp 2>/dev/null | grep -E ':3000\b' | grep -vE '127\.0\.0\.1:3000|\[::1\]:3000' | grep -q .; then
  fail "port 3000 exposed publicly — must be 127.0.0.1 only"
else
  ok "port 3000 localhost-only (or closed)"
fi

# db/redis should not publish host ports
if ss -tlnp 2>/dev/null | grep -qE ':5432\b'; then
  warn "5432 listening on host — prefer compose-internal only"
else
  ok "postgres not published on host"
fi
if ss -tlnp 2>/dev/null | grep -qE ':6379\b'; then
  warn "6379 listening on host — prefer compose-internal only"
else
  ok "redis not published on host"
fi

# .env secrets
if [[ -f "$APP_DIR/.env" ]]; then
  MODE=$(stat -c '%a' "$APP_DIR/.env" 2>/dev/null || echo '?')
  if [[ "$MODE" == "600" || "$MODE" == "400" ]]; then
    ok ".env mode $MODE"
  else
    fail ".env mode is $MODE (want 600)"
  fi
  for key in NEXTAUTH_SECRET POSTGRES_PASSWORD REDIS_PASSWORD CRON_SECRET; do
    if grep -qE "^${key}=.+" "$APP_DIR/.env"; then
      ok "$key set"
    else
      fail "$key missing in .env"
    fi
  done
  if grep -qE '^REDIS_URL=redis://:[^@]+@' "$APP_DIR/.env"; then
    ok "REDIS_URL includes password"
  else
    warn "REDIS_URL may lack password"
  fi
else
  fail "missing .env"
fi

# Firewall
if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -qi 'Status: active'; then
    ok "ufw active"
  else
    fail "ufw not active"
  fi
else
  warn "ufw missing"
fi

# fail2ban
if systemctl is-active --quiet fail2ban 2>/dev/null; then
  ok "fail2ban active"
else
  warn "fail2ban not active"
fi

# unattended-upgrades
if systemctl is-enabled --quiet unattended-upgrades 2>/dev/null || [[ -f /etc/apt/apt.conf.d/20auto-upgrades ]]; then
  ok "unattended-upgrades configured"
else
  warn "unattended-upgrades not configured"
fi

# nginx
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    ok "nginx -t"
  else
    fail "nginx -t failed"
  fi
  if [[ -n "$DOMAIN" ]]; then
    if [[ -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
      ok "TLS cert dir for $DOMAIN"
    else
      warn "no Let's Encrypt live dir for $DOMAIN (OK if --skip-ssl)"
    fi
  fi
else
  warn "nginx missing"
fi

# public HTTPS smoke
if [[ -n "$DOMAIN" ]]; then
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://${DOMAIN}/api/health" 2>/dev/null || echo 000)
  if [[ "$CODE" == "200" ]]; then
    ok "https://${DOMAIN}/api/health → 200"
  else
    warn "https://${DOMAIN}/api/health → $CODE"
  fi
fi

# smoke script if present
SMOKE="$APP_DIR/scripts/qa-post-deploy-smoke.sh"
if [[ -f "$SMOKE" ]]; then
  if bash "$SMOKE" "http://127.0.0.1:3000"; then
    ok "qa-post-deploy-smoke"
  else
    fail "qa-post-deploy-smoke"
  fi
fi

echo
echo "Summary: FAIL=$FAIL WARN=$WARN"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
