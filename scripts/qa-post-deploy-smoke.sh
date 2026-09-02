#!/usr/bin/env bash
# Lightweight post-deploy smoke (non-interactive)
set -euo pipefail
BASE="${1:-http://127.0.0.1:3000}"
ok=0; fail=0
check() { if eval "$2"; then echo "OK  $1"; ok=$((ok+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }

for path in /api/health /api/public/status /vacancies /contests /terms /messages; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$BASE$path" || echo 000)
  if [[ "$path" == "/messages" ]]; then
    check "$path->$code" "[[ \"$code\" == \"200\" || \"$code\" == \"307\" || \"$code\" == \"302\" ]]"
  else
    check "$path->$code" "[[ \"$code\" == \"200\" ]]"
  fi
done

mods=$(curl -sS --max-time 10 "$BASE/api/public/status" || true)
check "modules in status" "echo \"$mods\" | grep -q modules"

echo "SMOKE ok=$ok fail=$fail"
[[ "$fail" -eq 0 ]]
