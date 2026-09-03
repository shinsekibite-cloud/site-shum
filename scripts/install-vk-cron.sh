#!/usr/bin/env bash
# Install hourly VK news sync probe (Europe/Moscow).
# Actual hours/days are controlled in Admin → VK API (SiteSettings.vkSyncScheduleJson).
# The API no-ops outside the configured window unless ?force=1.
# Usage on VPS (as root): ./scripts/install-vk-cron.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sochi-portal}"
ENV_FILE="${APP_DIR}/.env"
DOMAIN="${PUBLIC_DOMAIN:-young.idivles.ru}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# Ensure CRON_SECRET exists
if ! grep -q '^CRON_SECRET=' "$ENV_FILE"; then
  SECRET="$(openssl rand -hex 24)"
  echo "CRON_SECRET=${SECRET}" >> "$ENV_FILE"
  echo "Added CRON_SECRET to .env"
else
  SECRET="$(grep '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
fi

CRON_FILE=/etc/cron.d/youngportal-vk-sync
cat > "$CRON_FILE" <<EOF
# YoungPortal VK news sync — hourly probe; schedule lives in admin (MSK hours/days)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
CRON_TZ=Europe/Moscow
5 * * * * root curl -fsS "https://${DOMAIN}/api/vk-sync?secret=${SECRET}" >/var/log/youngportal-vk-sync.log 2>&1 || true
EOF
chmod 644 "$CRON_FILE"
echo "Installed $CRON_FILE (hourly :05 MSK; window set in Admin → VK API)"
echo "Manual test: curl -fsS \"https://${DOMAIN}/api/vk-sync?secret=***&force=1\""
