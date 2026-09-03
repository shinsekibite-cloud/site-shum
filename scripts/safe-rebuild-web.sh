#!/usr/bin/env bash
# One-at-a-time rebuild — prevents OOM on 2GB VPS
set -euo pipefail
LOCK=/var/lock/sochi-rebuild.lock
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "Another rebuild is running — abort"
  exit 1
fi
cd /opt/sochi-portal

# stop leftover build processes
pkill -9 -f 'next build' 2>/dev/null || true
pkill -9 -f 'docker build' 2>/dev/null || true

echo "Stopping web to free RAM before build..."
docker-compose stop web >/dev/null 2>&1 || true
sleep 2
sync || true
# drop caches if possible (best-effort)
echo 3 >/proc/sys/vm/drop_caches 2>/dev/null || true

export NODE_OPTIONS='--max-old-space-size=1536'
docker system prune -f >/dev/null 2>&1 || true

AVAIL_MB=$(awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
echo "MemAvailable≈${AVAIL_MB}MB — Building web (single process)..."
if [[ "${AVAIL_MB}" -gt 0 && "${AVAIL_MB}" -lt 400 ]]; then
  echo "WARN: low memory (<400MB). Build may OOM — consider reboot first."
fi

docker-compose up -d --build web
sleep 8
curl -sS --max-time 20 http://127.0.0.1:3000/api/health || true
echo
# optional post-deploy smoke (non-fatal)
if [[ -x scripts/qa-post-deploy-smoke.sh ]]; then
  bash scripts/qa-post-deploy-smoke.sh http://127.0.0.1:3000 || echo "smoke warned"
fi
echo "Done."
