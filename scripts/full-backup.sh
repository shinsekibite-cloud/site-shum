#!/usr/bin/env bash
set -euo pipefail
STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
D="/var/backups/sochi-portal"
mkdir -p "$D"

resolve_db_container() {
  local c
  for c in sochi-portal-db-1 sochi-portal_db_1; do
    if docker inspect "$c" >/dev/null 2>&1; then
      echo "$c"
      return 0
    fi
  done
  c="$(docker ps --format '{{.Names}}' | grep -E 'sochi-portal.*db' | head -1 || true)"
  [[ -n "$c" ]] || return 1
  echo "$c"
}

DB_CTR="$(resolve_db_container)" || {
  echo "ERROR: postgres container not found" >&2
  exit 1
}
docker exec "$DB_CTR" pg_dump -U sochi -Fc sochi_portal > "$D/db-${STAMP}.dump"
tar -czf "$D/full-${STAMP}.tar.gz" -C /opt \
  --exclude='sochi-portal/node_modules' \
  --exclude='sochi-portal/.next' \
  --exclude='sochi-portal/data/postgres' \
  sochi-portal
sha256sum "$D/full-${STAMP}.tar.gz" > "$D/full-${STAMP}.sha256"
# keep last 7 full archives and 14 db dumps
ls -1t "$D"/full-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f || true
ls -1t "$D"/full-*.sha256 2>/dev/null | tail -n +8 | xargs -r rm -f || true
ls -1t "$D"/db-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f || true
# prune old tgz naming from earlier scripts
ls -1t "$D"/sochi-portal-*.tgz 2>/dev/null | tail -n +5 | xargs -r rm -f || true
ln -sfn "$D/full-${STAMP}.tar.gz" "$D/full-latest.tar.gz"
echo "backup done $D/full-${STAMP}.tar.gz"

