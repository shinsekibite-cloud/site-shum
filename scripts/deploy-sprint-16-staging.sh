#!/usr/bin/env bash
# Apply 1.6.0 schema + rebuild staging (ty). Requires docker group / root.
set -euo pipefail
APP="${STAGING_APP_DIR:-/opt/sochi-portal-staging}"
cd "$APP"

echo "==> schema SQL"
if docker ps --format '{{.Names}}' | grep -q 'sochi-portal.*db\|sochi-portal_db'; then
  DB_CTR="$(docker ps --format '{{.Names}}' | grep -E 'sochi-portal.*db|sochi-portal_db' | head -1)"
  docker exec -i "$DB_CTR" psql -U "${POSTGRES_USER:-sochi}" -d "${POSTGRES_DB:-sochi_portal}" < scripts/apply-sprint-16-schema.sql
else
  echo "DB container not found — run SQL manually" >&2
  exit 1
fi

echo "==> rebuild staging web"
docker compose -p sochi-staging -f docker-compose.staging.yml build web
docker compose -p sochi-staging -f docker-compose.staging.yml up -d web

echo "==> health"
sleep 8
curl -fsS "https://ty.idivles.ru/api/health" || curl -fsS "http://127.0.0.1:3001/api/health"
echo
echo "OK — check https://ty.idivles.ru/"
