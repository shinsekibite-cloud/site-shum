#!/usr/bin/env bash
# Self-check for install / HA scripts (no remote VPS required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ok=0
fail=0
check() {
  local name="$1"; shift
  if "$@"; then
    echo "OK  $name"
    ok=$((ok + 1))
  else
    echo "FAIL $name"
    fail=$((fail + 1))
  fi
}

check "bash -n install-fresh-vps" bash -n scripts/install-fresh-vps.sh
check "bash -n setup-replica-ha" bash -n scripts/setup-replica-ha.sh
check "bash -n yp-ha-sync" bash -n scripts/yp-ha-sync.sh
check "bash -n debian-bootstrap" bash -n scripts/debian-bootstrap.sh
check "bash -n preflight-vps" bash -n scripts/preflight-vps.sh
check "bash -n setup-https-sni-xray" bash -n scripts/setup-https-sni-xray.sh
check "bash -n setup-project-users" bash -n scripts/setup-project-users.sh
check "bash -n bootstrap-ha-ssh" bash -n scripts/bootstrap-ha-ssh.sh
check "bash -n setup-replica-pair" bash -n scripts/setup-replica-pair.sh
check "install --help" bash scripts/install-fresh-vps.sh --help >/dev/null
check "replica --help" bash scripts/setup-replica-ha.sh --help >/dev/null
check "preflight --help" bash scripts/preflight-vps.sh --help >/dev/null
check "project-users --help" bash scripts/setup-project-users.sh --help >/dev/null
check "install dry-run" bash scripts/install-fresh-vps.sh --dry-run --yes \
  --domain example.test --admin-email admin@example.test --admin-password 'StrongPass1!' >/dev/null
check "replica dry-run" bash scripts/setup-replica-ha.sh --dry-run \
  --role primary --peer-host 203.0.113.10 --shared-secret testhasecret >/dev/null
check "replica-pair dry-run" bash scripts/setup-replica-pair.sh --dry-run \
  --primary root@203.0.113.10 --standby root@203.0.113.20 >/dev/null
check "project-users dry-run" bash scripts/setup-project-users.sh --dry-run >/dev/null
check "docs fresh exist" test -f docs/VPS-FRESH-INSTALL.md
check "docs pitfalls exist" test -f docs/VPS-INSTALL-PITFALLS.md
check "docs replica exist" test -f docs/VPS-REPLICA-FAILOVER.md
check "learning book exist" test -f docs/LEARNING_BOOK.md
check "seed script exist" test -f scripts/seed-bootstrap-admin.mjs
check "preflight script exist" test -f scripts/preflight-vps.sh
check "sni script exist" test -f scripts/setup-https-sni-xray.sh
check "accounts script exist" test -f scripts/setup-project-users.sh
check "pair script exist" test -f scripts/setup-replica-pair.sh

echo "----"
echo "passed=$ok failed=$fail"
[[ "$fail" -eq 0 ]]
