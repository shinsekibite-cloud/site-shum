#!/usr/bin/env bash
# Скачать YoungPortal kit ТОЛЬКО с IP хранилища бэкапов (77.110.125.241).
#
# Клиент (по умолчанию):
#   bash scripts/download-kit.sh
#   bash scripts/download-kit.sh /root/yp-kit/kit.tgz
#
# Организация (код + живой контент БД/uploads):
#   KIT_PROFILE=org bash scripts/download-kit.sh
#
# Исходник для модернизации:
#   KIT_PROFILE=source bash scripts/download-kit.sh
#
# Разработчик (полный эталон):
#   KIT_PROFILE=developer bash scripts/download-kit.sh
#
# Свой token/path:
#   KIT_URL='https://77.110.125.241/backups/<token>/file.tgz' bash scripts/download-kit.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/kit-download.sh"

KIT_STORAGE_IP="${KIT_STORAGE_IP:-77.110.125.241}"
KIT_PROFILE="${KIT_PROFILE:-client}"
OUT="${1:-./youngportal-kit.tgz}"

case "$KIT_PROFILE" in
  client|slim)
    KIT_URL="${KIT_URL:-https://${KIT_STORAGE_IP}/backups/98c517ba79be6e0a8f82a63293dbc64c/youngportal-client-kit-20260815-100750.tgz}"
    KIT_SHA256="${KIT_SHA256:-fc3711f8a3f7f4e806e67349413a2a49ac908b7a2908e1ecfde018b42e026a1d}"
    ;;
  org|organization|with-live)
    # Полный орг-кит: код + снимок БД/uploads/образов (персональные данные!)
    KIT_URL="${KIT_URL:-https://py.idivles.ru/backups/8694c332fe0530d051329de0ca2322ce/youngportal-org-kit-20260817-222141.tgz}"
    KIT_SHA256="${KIT_SHA256:-f28a741ba3814f4f81e41b520b958af38e848eabc4a9f95d9e2017cf5153a366}"
    ;;
  source|modernize|sale)
    KIT_URL="${KIT_URL:-https://py.idivles.ru/backups/879d87b363d76416fd5c295abe26e152/youngportal-sale-source-20260817-222141.tgz}"
    KIT_SHA256="${KIT_SHA256:-8e16efcfcd0c257a5e20f9776c9de4b9d439cccd32e8782487f26a7315da47e7}"
    ;;
  portable|dev-portable)
    KIT_URL="${KIT_URL:-https://py.idivles.ru/backups/947feea2b4f93b2d1c244e26ea41160c/youngportal-portable-dev-20260817-222141.tgz}"
    KIT_SHA256="${KIT_SHA256:-2f3a13353536ee1fcd1a7a34cdf5b6253218f58da3331661b6252f96695b747a}"
    ;;
  developer|reference|full)
    KIT_URL="${KIT_URL:-https://py.idivles.ru/backups/879d87b363d76416fd5c295abe26e152/youngportal-sale-source-20260817-222141.tgz}"
    KIT_SHA256="${KIT_SHA256:-8e16efcfcd0c257a5e20f9776c9de4b9d439cccd32e8782487f26a7315da47e7}"
    ;;
  *)
    echo "KIT_PROFILE=client|org|sale|portable|source|developer" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname "$OUT")"
yp_kit_fetch "$OUT"
echo "OK: $OUT"
echo "Дальше:"
echo "  tar -xzf $OUT && cd youngportal-*-kit-* && sudo bash START.sh --help"
