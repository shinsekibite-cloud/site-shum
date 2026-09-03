#!/usr/bin/env bash
# Cheap HTTP smoke for ty + py. No browser. Exit 1 on failure.
#   bash scripts/smoke-sites.sh
#   bash scripts/smoke-sites.sh --prod-only
set -euo pipefail
PROD="${PROD_DOMAIN:-py.idivles.ru}"
STAGING="${STAGING_DOMAIN:-ty.idivles.ru}"
MODE="${1:-both}"
fail=0

check() {
  local name="$1" url="$2" want="${3:-200}"
  local code body
  code=$(curl -sS --http1.1 -o /tmp/yp-smoke.body -w "%{http_code}" --max-time 20 "$url" || echo 000)
  body=$(head -c 180 /tmp/yp-smoke.body 2>/dev/null || true)
  if [[ "$code" == "$want" ]] && ! grep -q "отключён\|Упс!" /tmp/yp-smoke.body 2>/dev/null; then
    echo "OK  $name $code"
  else
    echo "FAIL $name $code ${body//$'\n'/ }"
    fail=$((fail + 1))
  fi
}

if [[ "$MODE" != "--staging-only" ]]; then
  check "$PROD /api/health" "https://$PROD/api/health"
  check "$PROD /" "https://$PROD/"
  check "$PROD /login" "https://$PROD/login"
fi
if [[ "$MODE" != "--prod-only" ]]; then
  check "$STAGING /api/health" "https://$STAGING/api/health"
  check "$STAGING /" "https://$STAGING/"
fi

echo "SMOKE fail=$fail"
[[ "$fail" -eq 0 ]]
