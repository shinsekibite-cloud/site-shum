#!/usr/bin/env bash
# Install local uptime cron + optional Healthchecks.io ping.
# Usage: HEALTHCHECKS_PING_URL=https://hc-ping.com/UUID sudo bash scripts/install-uptime-cron.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
BASE_URL="${BASE_URL:-https://young.idivles.ru}"
PING="${HEALTHCHECKS_PING_URL:-}"
LINE="*/2 * * * * BASE_URL=${BASE_URL} HEALTHCHECKS_PING_URL=${PING} ${NODE} ${ROOT}/scripts/uptime-check.mjs >>/var/log/yp-uptime.log 2>&1"
(crontab -l 2>/dev/null | grep -v 'uptime-check.mjs' || true; echo "$LINE") | crontab -
touch /var/log/yp-uptime.log 2>/dev/null || true
echo "Installed cron: $LINE"
echo "Tip: create a check at https://healthchecks.io and set HEALTHCHECKS_PING_URL"
