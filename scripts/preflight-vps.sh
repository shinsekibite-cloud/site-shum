#!/usr/bin/env bash
# Preflight checks before YoungPortal install on a VPS (run as root on target).
# Usage:
#   bash scripts/preflight-vps.sh --domain tyoung.idivles.ru
#   bash scripts/preflight-vps.sh --domain example.ru --app-dir /opt/sochi-portal
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

note() { echo "  · $*"; }
ok() { echo "OK   $*"; }
warn() { echo "WARN $*"; WARN=$((WARN + 1)); }
fail() { echo "FAIL $*"; FAIL=$((FAIL + 1)); }

echo "=== YoungPortal preflight ==="
echo "Host: $(hostname -f 2>/dev/null || hostname)  IP(s): $(hostname -I 2>/dev/null | xargs)"
echo

# OS
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  ok "OS $PRETTY_NAME"
else
  warn "No /etc/os-release"
fi

# Root
if [[ $(id -u) -eq 0 ]]; then ok "Running as root"; else warn "Not root — install will need root"; fi

# RAM / swap
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
note "RAM ${MEM_MB} MB, swap ${SWAP_MB} MB"
if [[ "$MEM_MB" -lt 1800 ]]; then
  fail "RAM < 1.8 GB — next build likely OOM without heavy swap / stopping services"
elif [[ "$MEM_MB" -lt 3500 ]]; then
  warn "RAM < 4 GB — stop netdata/x-ui before docker build; ensure swap ≥ 2 GB"
  [[ "$SWAP_MB" -lt 1500 ]] && fail "Swap < 1.5 GB on a small VPS"
else
  ok "RAM looks comfortable"
fi

# Disk
DISK_G=$(df -BG / | awk 'NR==2{gsub(/G/,"",$4); print $4}')
note "Free on / : ${DISK_G}G"
if [[ "${DISK_G:-0}" -lt 8 ]]; then
  fail "Need roughly ≥ 8G free for images + build"
else
  ok "Disk free ${DISK_G}G"
fi

# Ports
who_port() {
  local p="$1"
  ss -tlnp 2>/dev/null | awk -v p=":$p" '$4 ~ p"$" || $4 ~ p" "' | head -3
}
echo
echo "-- listeners --"
for p in 80 443 3000 4488 22 8443 10443; do
  L="$(who_port "$p" || true)"
  if [[ -n "$L" ]]; then
    note ":$p → $L"
  fi
done

if who_port 443 | grep -qiE 'xray|x-ui|sing-box|v2ray'; then
  warn "443 occupied by proxy/VPN stack — use webroot cert + scripts/setup-https-sni-xray.sh"
elif who_port 443 | grep -qi nginx; then
  ok "443 already nginx"
elif who_port 443 >/dev/null && [[ -n "$(who_port 443)" ]]; then
  warn "443 busy by something else — inspect before certbot --nginx"
else
  ok "443 free (classic nginx TLS possible)"
fi

if who_port 80 | grep -qi nginx || [[ -z "$(who_port 80)" ]]; then
  ok "80 usable for ACME/nginx"
else
  warn "80 busy — ACME http-01 may fail"
fi

# DNS
if [[ -n "$DOMAIN" ]]; then
  echo
  MY_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)"
  note "Domain $DOMAIN resolves to ${RESOLVED:-'(none)'}; this host ${MY_IP:-?}"
  if [[ -z "$RESOLVED" ]]; then
    warn "No A record yet — use --skip-ssl until DNS propagates"
  elif [[ -n "$MY_IP" && "$RESOLVED" != "$MY_IP" ]]; then
    # may still be ok if multiple IPs / NAT
    warn "DNS A ($RESOLVED) ≠ primary local IP ($MY_IP) — confirm this is the right VPS"
  else
    ok "DNS A matches this host"
  fi
  AAAA="$(getent ahostsv6 "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)"
  if [[ -n "$AAAA" ]]; then
    warn "AAAA present ($AAAA) — ensure nginx listens on [::]:80 or remove AAAA for LE"
  fi
fi

# Docker / nginx / tools
echo
command -v docker >/dev/null && ok "docker present" || note "docker will be installed"
command -v nginx >/dev/null && ok "nginx present" || note "nginx will be installed"
command -v certbot >/dev/null && ok "certbot present" || note "certbot will be installed"
[[ -d /etc/x-ui || -d /usr/local/x-ui ]] && warn "x-ui detected — plan SNI coexistence"
[[ -f /etc/x-ui/x-ui.db ]] && note "x-ui.db found"

# App dir
if [[ -d "$APP_DIR" ]]; then
  if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
    ok "App dir $APP_DIR has compose file"
  else
    warn "$APP_DIR exists but no docker-compose.yml"
  fi
  if [[ -f "$APP_DIR/.env" ]]; then
    warn "$APP_DIR/.env already exists — install will merge/set keys, not wipe blindly"
  fi
else
  note "App dir $APP_DIR will be created"
fi

echo
echo "==== result: FAIL=$FAIL WARN=$WARN ===="
echo "See docs/VPS-INSTALL-PITFALLS.md"
[[ "$FAIL" -eq 0 ]]
