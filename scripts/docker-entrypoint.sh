#!/bin/sh
# Only load MinTsifry / Russian Trusted CA when the PEM is present.
# Avoids Node warning: "Ignoring extra certs … No such file or directory"
CERT="${RUSSIAN_TRUSTED_CA_PATH:-/app/certs/russian_trusted_ca.pem}"
if [ -f "$CERT" ] && [ -s "$CERT" ]; then
  export NODE_EXTRA_CA_CERTS="$CERT"
else
  unset NODE_EXTRA_CA_CERTS
fi
exec "$@"
