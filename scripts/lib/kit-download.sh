#!/usr/bin/env bash
# Общая логика скачивания kit-архива.
# Хранилище ТОЛЬКО на KIT_STORAGE_IP (по умолчанию 77.110.125.241).
# DNS young/tyoung для скачивания НЕ используются.
#
#   source scripts/lib/kit-download.sh
#   yp_kit_fetch /path/to/out.tgz
#
# Переменные:
#   KIT_STORAGE_IP   IP сервера с /backups (только этот)
#   KIT_URL          URL (hostname будет заменён на IP)
#   KIT_SHA256       ожидаемая сумма

yp_kit_defaults() {
  KIT_STORAGE_IP="${KIT_STORAGE_IP:-77.110.125.241}"
  if [[ -z "${KIT_URL:-}" ]]; then
    KIT_URL="https://${KIT_STORAGE_IP}/backups/youngportal-client-kit-latest.tgz"
  fi
  KIT_SHA256="${KIT_SHA256:-fc3711f8a3f7f4e806e67349413a2a49ac908b7a2908e1ecfde018b42e026a1d}"
}

# https://py.idivles.ru/backups/... → https://IP/backups/...
yp_kit_url_to_storage_ip() {
  local url="$1"
  local ip="${KIT_STORAGE_IP:-77.110.125.241}"
  if [[ "$url" =~ ^https?://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/ ]]; then
    # уже IP — проверим что это наш
    if [[ "$url" != "https://${ip}/"* && "$url" != "http://${ip}/"* ]]; then
      echo "ERROR: kit можно качать только с ${ip}, не с другого IP" >&2
      return 1
    fi
    echo "$url"
    return 0
  fi
  echo "$url" | sed -E "s|^https?://[^/]+|https://${ip}|"
}

yp_kit_ensure_curl() {
  if command -v curl >/dev/null 2>&1; then return 0; fi
  if [[ $(id -u) -eq 0 ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y >/dev/null
    apt-get install -y curl ca-certificates >/dev/null
  fi
  command -v curl >/dev/null 2>&1 || {
    echo "ERROR: нужен curl (apt-get install -y curl)" >&2
    return 1
  }
}

yp_kit_fetch() {
  local dest="$1"
  yp_kit_defaults
  yp_kit_ensure_curl || return 1
  local url
  url="$(yp_kit_url_to_storage_ip "$KIT_URL")" || return 1
  if [[ "$url" != "https://${KIT_STORAGE_IP}/"* && "$url" != "http://${KIT_STORAGE_IP}/"* ]]; then
    echo "ERROR: kit разрешено качать только с ${KIT_STORAGE_IP}" >&2
    return 1
  fi
  echo "==> kit download ONLY from ${KIT_STORAGE_IP}"
  echo "    $url"
  # -k: сертификат выписан на py.idivles.ru, коннект по IP
  curl -fkL --retry 5 --connect-timeout 30 -o "$dest" "$url" \
    || {
      # fallback: SNI/Host young + resolve на storage IP (если vhost только по имени)
      local path="${url#https://${KIT_STORAGE_IP}}"
      path="${path#http://${KIT_STORAGE_IP}}"
      echo "    fallback: Host py.idivles.ru → ${KIT_STORAGE_IP}"
      curl -fkL --retry 5 --connect-timeout 30 \
        --resolve "py.idivles.ru:443:${KIT_STORAGE_IP}" \
        -H "Host: py.idivles.ru" \
        -o "$dest" \
        "https://py.idivles.ru${path}"
    }
  if [[ -n "${KIT_SHA256:-}" ]]; then
    echo "${KIT_SHA256}  ${dest}" | sha256sum -c
  fi
  ls -lh "$dest"
}
