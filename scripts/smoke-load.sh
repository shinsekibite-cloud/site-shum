#!/usr/bin/env bash
# Lightweight sequential smoke against live origin.
# Usage: BASE_URL=https://young.idivles.ru REQUESTS=40 bash scripts/smoke-load.sh
set -euo pipefail
BASE_URL="${BASE_URL:-https://young.idivles.ru}"
REQUESTS="${REQUESTS:-40}"
PATHS=(/ /api/health /api/public/status /events /projects /login /news)
ok=0
fail=0
total_ms=0
echo "smoke-load $BASE_URL x$REQUESTS"
for i in $(seq 1 "$REQUESTS"); do
  p="${PATHS[$(( (i - 1) % ${#PATHS[@]} ))]}"
  out=$(curl -sS -o /dev/null -w "%{http_code} %{time_total}" --max-time 12 "${BASE_URL}${p}" || echo "000 0")
  code=${out%% *}
  secs=${out##* }
  ms=$(python3 -c "print(int(float('$secs')*1000))" 2>/dev/null || echo 0)
  total_ms=$((total_ms + ms))
  if [[ "$code" =~ ^2 ]]; then ok=$((ok+1)); else fail=$((fail+1)); echo "FAIL $code $p"; fi
done
avg=$(( REQUESTS > 0 ? total_ms / REQUESTS : 0 ))
echo "OK=$ok FAIL=$fail AVG_MS=$avg"
[[ "$fail" -eq 0 ]]
