#!/usr/bin/env bash
# Скачать kit и поставить YoungPortal на ДРУГОЙ сервер одной командой.
#
# Скачивание архива — ТОЛЬКО с IP хранилища 77.110.125.241 (не через DNS young).
#
# ── Клиенту ──
#   SSHPASS='пароль' bash scripts/install-from-url.sh root@IP --client \
#     --prod-domain portal.example.ru --staging-domain test.example.ru \
#     --le-email ops@example.ru --admin-email admin@portal.example.ru
#
# ── Разработчику ──
#   bash scripts/install-from-url.sh root@IP --developer --demo ...
#
# Переопределение URL:
#   KIT_URL=... KIT_SHA256=... bash scripts/install-from-url.sh root@IP --client ...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/kit-download.sh"

KIT_STORAGE_IP="${KIT_STORAGE_IP:-77.110.125.241}"
FORCE_DOWNLOAD="${FORCE_DOWNLOAD:-0}"
WORK="${WORK_DIR:-/root/yp-kit-download}"

die() { echo "ERROR: $*" >&2; exit 1; }

REMOTE="${1:-}"
[[ -n "$REMOTE" && "$REMOTE" != --* ]] || die "Первый аргумент: root@IP
Пример:
  bash scripts/install-from-url.sh root@IP --client \\
    --prod-domain portal.example.ru --staging-domain test.example.ru \\
    --le-email ops@example.ru --admin-email admin@portal.example.ru"
shift

# Профиль из аргументов (до выбора URL), иначе KIT_PROFILE / client
KIT_PROFILE="${KIT_PROFILE:-}"
FORWARD_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --client)
      KIT_PROFILE=client
      FORWARD_ARGS+=(--client)
      shift
      ;;
    --developer|--dev)
      KIT_PROFILE=developer
      FORWARD_ARGS+=(--developer)
      shift
      ;;
    --force-download)
      FORCE_DOWNLOAD=1
      shift
      ;;
    *)
      FORWARD_ARGS+=("$1")
      shift
      ;;
  esac
done
KIT_PROFILE="${KIT_PROFILE:-client}"

case "$KIT_PROFILE" in
  developer|reference|full)
    KIT_URL="${KIT_URL:-https://${KIT_STORAGE_IP}/backups/youngportal-reference-kit-latest.tgz}"
    KIT_SHA256="${KIT_SHA256:-b4762b33d962ea23be1fb1f2091ec5e048ccf64a7b3f3da95dc111be81d59a31}"
    LOCAL_LATEST="/var/backups/sochi-portal/youngportal-reference-kit-latest.tgz"
    ;;
  *)
    KIT_URL="${KIT_URL:-https://${KIT_STORAGE_IP}/backups/youngportal-client-kit-latest.tgz}"
    KIT_SHA256="${KIT_SHA256:-fc3711f8a3f7f4e806e67349413a2a49ac908b7a2908e1ecfde018b42e026a1d}"
    LOCAL_LATEST="/var/backups/sochi-portal/youngportal-client-kit-latest.tgz"
    ;;
esac

# Кэш по профилю + sha — не смешиваем client/developer и старые архивы
CACHE_TAG="${KIT_SHA256:0:16}"
WORK="$WORK/${KIT_PROFILE}-${CACHE_TAG}"
mkdir -p "$WORK"
cd "$WORK"
TGZ="$WORK/kit.tgz"

need_fetch=1
if [[ "$FORCE_DOWNLOAD" != "1" && -f "$TGZ" ]]; then
  if [[ -n "$KIT_SHA256" ]] && echo "${KIT_SHA256}  ${TGZ}" | sha256sum -c >/dev/null 2>&1; then
    echo "==> кэш OK: $TGZ"
    need_fetch=0
  else
    echo "==> кэш устарел/битый — качаю заново"
    rm -f "$TGZ"
  fi
fi

if [[ "$need_fetch" == "1" ]]; then
  if [[ -f "$LOCAL_LATEST" ]]; then
    echo "==> локальный latest: $LOCAL_LATEST"
    cp -f "$LOCAL_LATEST" "$TGZ"
    if [[ -n "$KIT_SHA256" ]] && ! echo "${KIT_SHA256}  ${TGZ}" | sha256sum -c; then
      echo "==> локальный latest не совпал с KIT_SHA256 — качаю с ${KIT_STORAGE_IP}"
      rm -f "$TGZ"
      yp_kit_fetch "$TGZ"
    fi
  elif [[ -f /var/backups/sochi-portal/youngportal-dev-kit-latest.tgz && "$KIT_PROFILE" != "client" ]]; then
    echo "==> локальный dev latest"
    cp -f /var/backups/sochi-portal/youngportal-dev-kit-latest.tgz "$TGZ"
  else
    yp_kit_fetch "$TGZ"
  fi
fi

echo "==> распаковка"
rm -rf "$WORK/extract"
mkdir -p "$WORK/extract"
tar -xzf "$TGZ" -C "$WORK/extract"
KIT_DIR="$(find "$WORK/extract" -maxdepth 2 -type f -name install-remote.sh | head -1 | xargs -r dirname)"
[[ -n "$KIT_DIR" && -d "$KIT_DIR" ]] || die "В архиве нет install-remote.sh"

# Подкладываем свежие скрипты из репо (совместимость со старыми архивами)
for f in install-dev-stack.sh start-kit.sh install-remote.sh install-from-url.sh fix-tls-after-kit.sh \
         seed-install-roles.mjs seed-bootstrap-admin.mjs client-harden.sh download-kit.sh run-install.sh; do
  if [[ -f "$ROOT/scripts/$f" ]]; then
    mkdir -p "$KIT_DIR/scripts"
    cp -f "$ROOT/scripts/$f" "$KIT_DIR/scripts/$f" 2>/dev/null || true
    case "$f" in
      install-dev-stack.sh) cp -f "$ROOT/scripts/$f" "$KIT_DIR/INSTALL.sh"; chmod +x "$KIT_DIR/INSTALL.sh" ;;
      start-kit.sh) cp -f "$ROOT/scripts/$f" "$KIT_DIR/START.sh"; chmod +x "$KIT_DIR/START.sh" ;;
      install-remote.sh|install-from-url.sh|fix-tls-after-kit.sh|download-kit.sh|run-install.sh)
        cp -f "$ROOT/scripts/$f" "$KIT_DIR/$f"; chmod +x "$KIT_DIR/$f" ;;
    esac
  fi
done
mkdir -p "$KIT_DIR/scripts/lib"
[[ -f "$ROOT/scripts/lib/kit-download.sh" ]] && cp -f "$ROOT/scripts/lib/kit-download.sh" "$KIT_DIR/scripts/lib/"

cd "$KIT_DIR"
echo "==> профиль=$KIT_PROFILE → install-remote.sh $REMOTE ${FORWARD_ARGS[*]-}"
exec bash ./install-remote.sh "$REMOTE" --archive "$TGZ" "${FORWARD_ARGS[@]}"
