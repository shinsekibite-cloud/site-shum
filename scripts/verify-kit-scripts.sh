#!/usr/bin/env bash
# Проверка синтаксиса и dry-run вариантов kit-установщика.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

check() {
  local name="$1"; shift
  echo "==> $name"
  if "$@"; then
    echo "    OK"
  else
    echo "    FAIL"; fail=1
  fi
}

check "bash -n install-dev-stack" bash -n "$ROOT/scripts/install-dev-stack.sh"
check "bash -n start-kit" bash -n "$ROOT/scripts/start-kit.sh"
check "bash -n install-remote" bash -n "$ROOT/scripts/install-remote.sh"
check "bash -n install-from-url" bash -n "$ROOT/scripts/install-from-url.sh"
check "bash -n pack-dev-deploy-kit" bash -n "$ROOT/scripts/pack-dev-deploy-kit.sh"
check "bash -n fix-tls-after-kit" bash -n "$ROOT/scripts/fix-tls-after-kit.sh"
check "bash -n run-install" bash -n "$ROOT/scripts/run-install.sh"
check "bash -n download-kit" bash -n "$ROOT/scripts/download-kit.sh"
check "node syntax seed-install-roles" node --check "$ROOT/scripts/seed-install-roles.mjs"
check "node syntax seed-bootstrap-admin" node --check "$ROOT/scripts/seed-bootstrap-admin.mjs"

# Не example.ru — reject_bad_domain их блокирует
PROD_V=verify-prod.idivles.ru
STAG_V=verify-test.idivles.ru

run_dry() {
  local label="$1"; shift
  echo "==> dry-run: $label"
  if SITE_NAME=Test PROD_DOMAIN="$PROD_V" STAGING_DOMAIN="$STAG_V" \
      TLS_MODE=skip "$@" >/tmp/yp-kit-dry-$$.log 2>&1; then
    if grep -q '\[dry-run\]' /tmp/yp-kit-dry-$$.log; then
      echo "    OK ($(grep -E 'Вариант:|Переуст|Seed' /tmp/yp-kit-dry-$$.log | tr '\n' '; '))"
    else
      echo "    FAIL: no dry-run marker"; cat /tmp/yp-kit-dry-$$.log; fail=1
    fi
  else
    echo "    FAIL"; cat /tmp/yp-kit-dry-$$.log; fail=1
  fi
  rm -f /tmp/yp-kit-dry-$$.log
}

run_dry "clean" bash "$ROOT/scripts/install-dev-stack.sh" --clean --yes --dry-run --ssh-port 0 \
  --prod-domain "$PROD_V" --staging-domain "$STAG_V"
run_dry "demo" bash "$ROOT/scripts/install-dev-stack.sh" --demo --yes --dry-run --ssh-port 0 \
  --prod-domain "$PROD_V" --staging-domain "$STAG_V" --seed-password 'InstallSeed1!'
run_dry "full(no snapshot→demo)" bash "$ROOT/scripts/install-dev-stack.sh" --full --yes --dry-run --ssh-port 0 \
  --prod-domain "$PROD_V" --staging-domain "$STAG_V"
run_dry "reinstall+demo" bash "$ROOT/scripts/install-dev-stack.sh" --reinstall --demo --yes --dry-run --ssh-port 0 \
  --prod-domain "$PROD_V" --staging-domain "$STAG_V"
run_dry "client+admin" bash "$ROOT/scripts/install-dev-stack.sh" --client --yes --dry-run --ssh-port 0 \
  --prod-domain "$PROD_V" --staging-domain "$STAG_V" \
  --admin-email "admin@${PROD_V}" --admin-password 'StrongPass1!'
run_dry "developer+demo" bash "$ROOT/scripts/install-dev-stack.sh" --developer --demo --yes --dry-run --ssh-port 0 \
  --prod-domain "$PROD_V" --staging-domain "$STAG_V"

echo "==> reject placeholder domains"
if bash "$ROOT/scripts/install-dev-stack.sh" --clean --yes --dry-run --ssh-port 0 \
    --prod-domain portal.example.ru --staging-domain test.example.ru >/tmp/yp-kit-rej-$$.log 2>&1; then
  echo "    FAIL: placeholder domains accepted"; cat /tmp/yp-kit-rej-$$.log; fail=1
else
  if grep -q 'реальный домен' /tmp/yp-kit-rej-$$.log; then echo "    OK"; else
    echo "    FAIL unexpected"; cat /tmp/yp-kit-rej-$$.log; fail=1
  fi
fi
rm -f /tmp/yp-kit-rej-$$.log

echo "==> START --yes without domains fails"
if bash "$ROOT/scripts/start-kit.sh" --client --yes >/tmp/yp-kit-nodom-$$.log 2>&1; then
  echo "    FAIL"; fail=1
else
  if grep -qiE 'prod-domain|доме' /tmp/yp-kit-nodom-$$.log; then echo "    OK"; else
    echo "    FAIL"; cat /tmp/yp-kit-nodom-$$.log; fail=1
  fi
fi
rm -f /tmp/yp-kit-nodom-$$.log

echo "==> run-install requires profile"
if bash "$ROOT/scripts/run-install.sh" >/tmp/yp-ri-$$.log 2>&1; then
  echo "    FAIL: should exit nonzero"; fail=1
else
  if grep -q 'client' /tmp/yp-ri-$$.log; then echo "    OK"; else
    echo "    FAIL"; cat /tmp/yp-ri-$$.log; fail=1
  fi
fi
rm -f /tmp/yp-ri-$$.log

check "START.sh --help" bash "$ROOT/scripts/start-kit.sh" --help
check "install-remote --help" bash "$ROOT/scripts/install-remote.sh" --help

if [[ "$fail" -ne 0 ]]; then
  echo "VERIFY FAILED"; exit 1
fi
echo "VERIFY OK"
