#!/usr/bin/env bash
# Bump product version in package.json + src/lib/app-version.ts and print CHANGELOG hint.
# Usage:
#   bash scripts/bump-version.sh 1.5.4
#   bash scripts/bump-version.sh patch   # 1.5.3 → 1.5.4
#   bash scripts/bump-version.sh minor   # 1.5.3 → 1.6.0
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/package.json"
APP="$ROOT/src/lib/app-version.ts"
CUR="$(python3 -c "import json; print(json.load(open('$PKG'))['version'])")"

arg="${1:-}"
if [[ -z "$arg" ]]; then
  echo "Usage: $0 <x.y.z|patch|minor|major>" >&2
  echo "Current: $CUR" >&2
  exit 1
fi

if [[ "$arg" =~ ^(patch|minor|major)$ ]]; then
  NEW="$(python3 - "$CUR" "$arg" <<'PY'
import sys
maj, mi, pa = map(int, sys.argv[1].split("."))
kind = sys.argv[2]
if kind == "patch":
    pa += 1
elif kind == "minor":
    mi += 1
    pa = 0
else:
    maj += 1
    mi = 0
    pa = 0
print(f"{maj}.{mi}.{pa}")
PY
)"
else
  NEW="$arg"
  if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Bad version: $NEW" >&2
    exit 1
  fi
fi

python3 - "$PKG" "$NEW" <<'PY'
import json, sys
path, ver = sys.argv[1], sys.argv[2]
data = json.load(open(path))
data["version"] = ver
json.dump(data, open(path, "w"), ensure_ascii=False, indent=2)
open(path, "a").write("\n")
PY

cat > "$APP" <<EOF
/** Public product version shown in the footer. Keep in sync with package.json + CHANGELOG.md. */
export const APP_VERSION = '$NEW';
EOF

echo "Bumped $CUR → $NEW"
echo "Next: edit CHANGELOG.md section ## [$NEW] — $(date -u +%Y-%m-%d)"
echo "Then: commit, deploy staging, verify footer + /api/health"
