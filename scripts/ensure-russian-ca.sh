#!/usr/bin/env bash
# Ensure MinTsifry Russian Trusted Root CA is available for MAX/Gosuslugi TLS.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST_DIR="${1:-$ROOT_DIR/certs}"
DEST="$DEST_DIR/russian_trusted_ca.pem"
mkdir -p "$DEST_DIR"

if [[ -f "$DEST" && -s "$DEST" ]]; then
  if grep -q "BEGIN CERTIFICATE" "$DEST"; then
    echo "OK: $DEST already present"
    exit 0
  fi
fi

URLS=(
  "https://gu-st.ru/content/Other/doc/russian_trusted_root_ca.cer"
  "https://www.gosuslugi.ru/crt/russian_trusted_root_ca.cer"
)

tmp="$(mktemp)"
ok=0
for url in "${URLS[@]}"; do
  if curl -fsSL --connect-timeout 15 --max-time 60 "$url" -o "$tmp"; then
    if grep -q "BEGIN CERTIFICATE" "$tmp"; then
      ok=1
      break
    fi
    # DER → PEM
    if openssl x509 -inform DER -in "$tmp" -out "$DEST" 2>/dev/null; then
      echo "OK: wrote $DEST (from DER $url)"
      rm -f "$tmp"
      exit 0
    fi
  fi
done

if [[ "$ok" -eq 1 ]]; then
  cp -f "$tmp" "$DEST"
  chmod 644 "$DEST"
  rm -f "$tmp"
  echo "OK: wrote $DEST"
  exit 0
fi

rm -f "$tmp"
echo "FAIL: could not download Russian Trusted Root CA" >&2
exit 1
