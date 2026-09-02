#!/usr/bin/env bash
# Smoke probes for vacancies / contests / captcha (2026-08-08)
set -euo pipefail
BASE="${1:-http://127.0.0.1:3000}"
PASS="${QA_PASS:-RolePass123!}"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

ok=0
fail=0
check() {
  local name="$1" cond="$2"
  if eval "$cond"; then
    echo "OK  $name"
    ok=$((ok + 1))
  else
    echo "FAIL $name"
    fail=$((fail + 1))
  fi
}

echo "== public pages =="
for path in /vacancies /contests /api/vacancies /api/contests /api/captcha/challenge /api/health; do
  code=$(curl -sS -o /tmp/smoke-body.json -w "%{http_code}" --max-time 20 "$BASE$path" || echo 000)
  check "$path->$code" "[[ \"$code\" == \"200\" ]]"
done

echo "== captcha challenge payload =="
chal=$(curl -sS "$BASE/api/captcha/challenge")
check "challengeId" "echo \"$chal\" | grep -q challengeId"
check "question" "echo \"$chal\" | grep -q question"

echo "== csrf/login session admin =="
csrf=$(curl -sS -c "$COOKIE_JAR" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$csrf" \
  --data-urlencode "email=qa-admin@sochi.ru" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "redirect=false" \
  --data-urlencode "json=true" \
  -o /tmp/smoke-login.json || true
sess=$(curl -sS -b "$COOKIE_JAR" "$BASE/api/auth/session")
check "admin session" "echo \"$sess\" | grep -q qa-admin@sochi.ru"

echo "== admin APIs =="
for path in /api/admin/vacancies /api/admin/contests; do
  code=$(curl -sS -o /tmp/smoke-admin.json -w "%{http_code}" -b "$COOKIE_JAR" --max-time 20 "$BASE$path" || echo 000)
  check "admin$path->$code" "[[ \"$code\" == \"200\" ]]"
done

echo "== admin pages =="
for path in /admin/vacancies /admin/contests; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" --max-time 20 "$BASE$path" || echo 000)
  check "page$path->$code" "[[ \"$code\" == \"200\" ]]"
done

echo "== mod ACL on vacancies API =="
JAR2=$(mktemp)
csrf2=$(curl -sS -c "$JAR2" "$BASE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
curl -sS -c "$JAR2" -b "$JAR2" -X POST "$BASE/api/auth/callback/credentials" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$csrf2" \
  --data-urlencode "email=mod@sochi.ru" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "json=true" -o /dev/null || true
code=$(curl -sS -o /tmp/smoke-mod.json -w "%{http_code}" -b "$JAR2" "$BASE/api/admin/vacancies" || echo 000)
check "mod vacancies ACL ($code)" "[[ \"$code\" == \"200\" || \"$code\" == \"403\" ]]"
rm -f "$JAR2"

echo "RESULT ok=$ok fail=$fail"
[[ "$fail" -eq 0 ]]
