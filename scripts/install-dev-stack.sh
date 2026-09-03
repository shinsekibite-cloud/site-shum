#!/usr/bin/env bash
# YoungPortal — быстрая установка ТЕСТА + ПРОДА с текущего комплекта.
#
# Профили (рекомендуется):
#   --client      клиенту: чистая БД + ОДИН первый ADMIN (email/пароль)
#   --developer   разработчику: --demo (роли) или --full (клон данных)
#   --modules     all|core|content|key1,key2  (выбор модулей при установке)
#   --modules-off games,eco                   (доп. выключения)
#   --seed-org    демо-контент организации (после админа / ролей)
#
# Варианты данных:
#   --clean / VARIANT=clean     чистый проект, пустая БД
#   --demo  / VARIANT=demo      чистый + учётки всех ролей + лёгкий демо-контент
#   --full  / VARIANT=full      полный клон с текущими данными (snapshot/)
#   --reinstall                 полная переустановка (снести стек/БД и поставить заново)
#
# Клиент (пример):
#   bash INSTALL.sh --client --yes --prod-domain a.example.ru --staging-domain b.example.ru \
#     --admin-email admin@a.example.ru --admin-password 'StrongPass1!'
#   # без --admin-password пароль сгенерируется и сохранится в /etc/yp-portal/admin-credentials.txt
#
# Разработчик:
#   bash INSTALL.sh --developer --demo --yes --prod-domain a.example.ru --staging-domain b.example.ru
#   bash INSTALL.sh --developer --full --yes ...
#
# TLS_MODE: letsencrypt | custom | selfsigned | skip
# RATE_PROFILE: young | strict | off
set -euo pipefail

SELF="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
SELF_DIR="$(cd "$(dirname "$SELF")" && pwd)"

KIT_ROOT="$SELF_DIR"
if [[ -d "$SELF_DIR/source" || -d "$SELF_DIR/snapshot" || -f "$SELF_DIR/INSTALL.sh" ]]; then
  KIT_ROOT="$SELF_DIR"
elif [[ -f "$SELF_DIR/install-dev-stack.sh" && -d "$SELF_DIR/../deploy" ]]; then
  KIT_ROOT="$(cd "$SELF_DIR/.." && pwd)"
elif [[ -f "$SELF_DIR/../docker-compose.yml" ]]; then
  KIT_ROOT="$(cd "$SELF_DIR/.." && pwd)"
fi

MODE="${MODE:-dual}"
APP_DIR="${APP_DIR:-/opt/sochi-portal}"
STAGING_DIR="${STAGING_DIR:-/opt/sochi-portal-staging}"
PROD_DOMAIN="${PROD_DOMAIN:-${DOMAIN:-}}"
STAGING_DOMAIN="${STAGING_DOMAIN:-}"
SITE_NAME="${SITE_NAME:-Молодёжь Сочи}"
LE_EMAIL="${LE_EMAIL:-${LETSENCRYPT_EMAIL:-}}"
TLS_MODE="${TLS_MODE:-letsencrypt}"
TLS_CERT="${TLS_CERT:-}"
TLS_KEY="${TLS_KEY:-}"
RATE_PROFILE="${RATE_PROFILE:-young}"
SSH_PORT="${SSH_PORT:-${SSH_HARDEN_PORT:-0}}"
SWAP_GB="${SWAP_GB:-2}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
ADMIN_PASSWORD_GENERATED=0
INSTALL_PROFILE="${INSTALL_PROFILE:-}"
REQUIRE_ADMIN="${REQUIRE_ADMIN:-0}"
RESTORE_DATA="${RESTORE_DATA:-}"
VARIANT="${VARIANT:-}"
SEED_ROLES="${SEED_ROLES:-0}"
SEED_PASSWORD="${SEED_PASSWORD:-InstallSeed1!}"
SEED_DOMAIN="${SEED_DOMAIN:-}"
REINSTALL="${REINSTALL:-0}"
WIPE_UPLOADS="${WIPE_UPLOADS:-0}"
ENABLE_UFW="${ENABLE_UFW:-1}"
ENABLE_FAIL2BAN="${ENABLE_FAIL2BAN:-1}"
ENABLE_HSTS="${ENABLE_HSTS:-1}"
ENABLE_UNATTENDED="${ENABLE_UNATTENDED:-1}"
LOCK_SSH="${LOCK_SSH:-0}"
SSH_PUBKEY="${SSH_PUBKEY:-}"
ASSUME_YES="${ASSUME_YES:-0}"
RECONFIGURE=0
DRY_RUN=0
FORCE=0
SNAPSHOT_DIR="${SNAPSHOT_DIR:-}"
SOURCE_TGZ="${SOURCE_TGZ:-}"
MODULES="${MODULES:-all}"
MODULES_OFF="${MODULES_OFF:-}"
OFF_MODE="${OFF_MODE:-hide}"
# empty = auto (client/demo/clean → seed org starter); 0/1 = explicit
SEED_ORG="${SEED_ORG:-}"

usage() { sed -n '2,32p' "$0" | sed 's/^# \?//' | sed '/^set /,$d'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --reconfigure) RECONFIGURE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    --reinstall|--wipe) REINSTALL=1; FORCE=1; shift ;;
    --wipe-uploads) WIPE_UPLOADS=1; shift ;;
    --client)
      INSTALL_PROFILE=client
      REQUIRE_ADMIN=1
      VARIANT="${VARIANT:-clean}"
      RESTORE_DATA=0
      SEED_ROLES=0
      shift
      ;;
    --developer|--dev)
      INSTALL_PROFILE=developer
      if [[ -z "$VARIANT" ]]; then
        VARIANT=demo
        RESTORE_DATA=0
        SEED_ROLES=1
      fi
      shift
      ;;
    --clean) VARIANT=clean; RESTORE_DATA=0; SEED_ROLES=0; shift ;;
    --demo|--seeded|--with-roles) VARIANT=demo; RESTORE_DATA=0; SEED_ROLES=1; shift ;;
    --full|--with-data|--clone) VARIANT=full; RESTORE_DATA=1; SEED_ROLES=0; shift ;;
    --seed-roles) SEED_ROLES=1; shift ;;
    --seed-password) SEED_PASSWORD="$2"; shift 2 ;;
    --seed-domain) SEED_DOMAIN="$2"; shift 2 ;;
    --variant) VARIANT="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --from-snapshot) SNAPSHOT_DIR="$2"; shift 2 ;;
    --from-source) SOURCE_TGZ="$2"; shift 2 ;;
    --domain|--prod-domain) PROD_DOMAIN="$2"; shift 2 ;;
    --staging-domain) STAGING_DOMAIN="$2"; shift 2 ;;
    --site-name) SITE_NAME="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --staging-dir) STAGING_DIR="$2"; shift 2 ;;
    --tls-mode) TLS_MODE="$2"; shift 2 ;;
    --tls-cert) TLS_CERT="$2"; shift 2 ;;
    --tls-key) TLS_KEY="$2"; shift 2 ;;
    --le-email) LE_EMAIL="$2"; shift 2 ;;
    --rate-profile) RATE_PROFILE="$2"; shift 2 ;;
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --modules) MODULES="$2"; shift 2 ;;
    --modules-off) MODULES_OFF="$2"; shift 2 ;;
    --off-mode) OFF_MODE="$2"; shift 2 ;;
    --seed-org) SEED_ORG=1; shift ;;
    --no-seed-org) SEED_ORG=0; shift ;;
    --skip-data) RESTORE_DATA=0; [[ "$VARIANT" == "full" ]] && VARIANT=clean; shift ;;
    --skip-ufw) ENABLE_UFW=0; shift ;;
    --skip-fail2ban) ENABLE_FAIL2BAN=0; shift ;;
    --no-hsts) ENABLE_HSTS=0; shift ;;
    --lock-ssh) LOCK_SSH=1; shift ;;
    --ssh-key) SSH_PUBKEY="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; usage; exit 1 ;;
  esac
done

# --full никогда не должен сбрасывать пароли ролей
if [[ "$VARIANT" == "full" ]]; then
  SEED_ROLES=0
  RESTORE_DATA=1
fi

# Автосид демо-контента организации: client/demo/clean без клона данных
if [[ -z "$SEED_ORG" ]]; then
  if [[ "$RESTORE_DATA" == "1" || "$VARIANT" == "full" ]]; then
    SEED_ORG=0
  elif [[ "$INSTALL_PROFILE" == "client" || "$VARIANT" == "demo" || "$VARIANT" == "clean" ]]; then
    SEED_ORG=1
  else
    SEED_ORG=0
  fi
fi
if [[ "$VARIANT" == "full" || "$RESTORE_DATA" == "1" ]]; then
  SEED_ORG=0
fi

normalize_domain() {
  local d="$1"
  d="${d#https://}"
  d="${d#http://}"
  d="${d%%/*}"
  d="${d%%:*}"
  echo "$d"
}

ask() {
  local var="$1" prompt="$2" default="${3:-}"
  local cur="${!var:-}"
  if [[ -n "$cur" && $ASSUME_YES -eq 1 ]]; then
    return 0
  fi
  if [[ $ASSUME_YES -eq 1 ]]; then
    printf -v "$var" '%s' "$default"
    return 0
  fi
  local ans=""
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " ans || true
    printf -v "$var" '%s' "${ans:-$default}"
  else
    read -r -p "$prompt: " ans || true
    printf -v "$var" '%s' "$ans"
  fi
}

ask_yn() {
  local var="$1" prompt="$2" default="$3"
  local def_s="n"
  [[ "$default" == "1" ]] && def_s="y"
  local cur="${!var:-}"
  if [[ $ASSUME_YES -eq 1 ]]; then
    [[ -n "$cur" ]] || printf -v "$var" '%s' "$default"
    return 0
  fi
  local ans=""
  read -r -p "$prompt [$def_s]: " ans || true
  ans="${ans:-$def_s}"
  case "${ans,,}" in
    y|yes|д|да|1) printf -v "$var" '%s' "1" ;;
    *) printf -v "$var" '%s' "0" ;;
  esac
}

ask_secret() {
  local var="$1" prompt="$2"
  if [[ -n "${!var:-}" ]]; then return 0; fi
  if [[ $ASSUME_YES -eq 1 ]]; then return 0; fi
  local ans=""
  read -r -s -p "$prompt: " ans || true
  echo
  printf -v "$var" '%s' "$ans"
}

die() { echo "ERROR: $*" >&2; exit 1; }

want_prod() { [[ "$MODE" == "dual" || "$MODE" == "prod" ]]; }
want_staging() { [[ "$MODE" == "dual" || "$MODE" == "staging" ]]; }

reject_bad_domain() {
  local d="$1" label="$2"
  [[ -n "$d" ]] || die "$label: домен пустой"
  case "$d" in
    *example.com|*example.ru|portal.example.ru|test.example.ru|localhost|*.local)
      die "$label: укажите реальный домен (не $d)"
      ;;
  esac
  [[ "$d" == *.* ]] || die "$label: домен должен содержать точку ($d)"
}

if [[ $DRY_RUN -eq 0 && $(id -u) -ne 0 ]]; then
  die "Запустите от root: sudo bash $0"
fi

case "$MODE" in
  dual|prod|staging) ;;
  *) die "MODE должен быть dual|prod|staging" ;;
esac

if [[ -z "$SNAPSHOT_DIR" ]]; then
  if [[ -d "$KIT_ROOT/snapshot" ]]; then
    SNAPSHOT_DIR="$KIT_ROOT/snapshot"
  fi
fi
if [[ -z "$SOURCE_TGZ" && -f "$KIT_ROOT/source/app.tgz" ]]; then
  SOURCE_TGZ="$KIT_ROOT/source/app.tgz"
fi

find_template() {
  local name="$1"
  local c
  for c in \
    "$KIT_ROOT/templates/$name" \
    "$KIT_ROOT/deploy/$name" \
    "$SELF_DIR/../deploy/$name" \
    "$APP_DIR/deploy/$name"
  do
    if [[ -f "$c" ]]; then echo "$c"; return 0; fi
  done
  return 1
}

repo_tree_ok() {
  [[ -f "$KIT_ROOT/docker-compose.yml" && -d "$KIT_ROOT/src" && -f "$KIT_ROOT/Dockerfile" ]]
}

# Early locate snapshot for variant defaults
HAS_SNAPSHOT_DATA=0
if [[ -n "${SNAPSHOT_DIR:-}" && ( -f "$SNAPSHOT_DIR/db.dump" || -f "$SNAPSHOT_DIR/uploads.tgz" || -f "$SNAPSHOT_DIR/images.tar.gz" ) ]]; then
  HAS_SNAPSHOT_DATA=1
fi

echo
echo "════════════════════════════════════════════════════════════"
echo "  YoungPortal — установка теста и/или прода"
echo "════════════════════════════════════════════════════════════"
echo

if [[ $RECONFIGURE -eq 1 ]]; then
  echo "Режим: перенастройка существующего портала"
  [[ -f "$APP_DIR/docker-compose.yml" ]] || die "Не найден $APP_DIR/docker-compose.yml"
fi

# Профиль client: всегда чистая БД + обязательный первый ADMIN
if [[ "$INSTALL_PROFILE" == "client" ]]; then
  REQUIRE_ADMIN=1
  VARIANT=clean
  RESTORE_DATA=0
  SEED_ROLES=0
fi

# Variant: clean / demo (roles) / full clone
if [[ -z "$VARIANT" ]]; then
  if [[ $ASSUME_YES -eq 1 ]]; then
    if [[ "$INSTALL_PROFILE" == "developer" ]]; then
      VARIANT=demo
    elif [[ -n "$RESTORE_DATA" ]]; then
      [[ "$RESTORE_DATA" == "1" ]] && VARIANT=full || VARIANT=clean
    elif [[ "$SEED_ROLES" == "1" ]]; then
      VARIANT=demo
    elif [[ "$HAS_SNAPSHOT_DATA" == "1" ]]; then
      VARIANT=full
    else
      VARIANT=clean
    fi
  else
    echo "Вариант установки:"
    echo "  1) Клиенту: чистый + первый ADMIN"
    echo "  2) Разработчику: чистый + учётки всех ролей"
    echo "  3) Разработчику: полный клон данных"
    if [[ "$HAS_SNAPSHOT_DATA" != "1" ]]; then
      echo "     (в комплекте нет snapshot/ — пункт 3 недоступен)"
    fi
    local_var=""
    read -r -p "Выбор [1]: " local_var || true
    case "${local_var:-1}" in
      2) VARIANT=demo; INSTALL_PROFILE="${INSTALL_PROFILE:-developer}" ;;
      3) VARIANT=full; INSTALL_PROFILE="${INSTALL_PROFILE:-developer}" ;;
      *) VARIANT=clean; INSTALL_PROFILE=client; REQUIRE_ADMIN=1; SEED_ROLES=0 ;;
    esac
  fi
fi
case "$VARIANT" in
  clean)
    RESTORE_DATA=0
    [[ "$INSTALL_PROFILE" == "client" ]] && SEED_ROLES=0
    ;;
  demo|seeded)
    VARIANT=demo
    RESTORE_DATA=0
    SEED_ROLES=1
    INSTALL_PROFILE="${INSTALL_PROFILE:-developer}"
    ;;
  full)
    RESTORE_DATA=1
    INSTALL_PROFILE="${INSTALL_PROFILE:-developer}"
    if [[ "$HAS_SNAPSHOT_DATA" != "1" ]]; then
      echo "WARN: нет snapshot/db.dump — переключаю на demo (роли)"
      VARIANT=demo
      RESTORE_DATA=0
      SEED_ROLES=1
    fi
    ;;
  *) die "VARIANT должен быть clean|demo|full" ;;
esac
if [[ "$INSTALL_PROFILE" == "client" ]]; then
  VARIANT=clean
  RESTORE_DATA=0
  SEED_ROLES=0
  REQUIRE_ADMIN=1
fi

if [[ $ASSUME_YES -eq 0 && $RECONFIGURE -eq 0 ]]; then
  ask_yn REINSTALL "Полная переустановка (снести БД/контейнеры и поставить заново)" "$REINSTALL"
fi
if [[ "$REINSTALL" == "1" ]]; then
  FORCE=1
  echo "Режим: ПОЛНАЯ ПЕРЕУСТАНОВКА (wipe + install)"
fi

ask SITE_NAME "Название портала (шапка, письма, 2FA issuer)" "$SITE_NAME"
if [[ $ASSUME_YES -eq 0 && -z "${MODE_LOCKED:-}" ]]; then
  echo "Что поднять:"
  echo "  1) тест + прод на одном сервере  (рекомендуется)"
  echo "  2) только прод  (:3000)"
  echo "  3) только тест  (:3001, нужна уже работающая прод-сеть)"
  local_mode=""
  read -r -p "Выбор [1]: " local_mode || true
  case "${local_mode:-1}" in
    1) MODE=dual ;;
    2) MODE=prod ;;
    3) MODE=staging ;;
    *) MODE=dual ;;
  esac
fi

if want_prod; then
  if [[ $ASSUME_YES -eq 1 ]]; then
    [[ -n "$PROD_DOMAIN" ]] || die "Нужен --prod-domain (с --yes)"
  fi
  ask PROD_DOMAIN "Домен ПРОДА (без https://)" "${PROD_DOMAIN:-}"
  PROD_DOMAIN="$(normalize_domain "$PROD_DOMAIN")"
  reject_bad_domain "$PROD_DOMAIN" "Прод"
fi
if want_staging; then
  if [[ $ASSUME_YES -eq 1 ]]; then
    [[ -n "$STAGING_DOMAIN" ]] || die "Нужен --staging-domain (с --yes)"
  fi
  ask STAGING_DOMAIN "Домен ТЕСТА (без https://)" "${STAGING_DOMAIN:-}"
  STAGING_DOMAIN="$(normalize_domain "$STAGING_DOMAIN")"
  reject_bad_domain "$STAGING_DOMAIN" "Тест"
fi
if want_prod && want_staging && [[ "$PROD_DOMAIN" == "$STAGING_DOMAIN" ]]; then
  die "Домены теста и прода должны отличаться"
fi

ask APP_DIR "Каталог ПРОДА" "$APP_DIR"
if want_staging; then
  ask STAGING_DIR "Каталог ТЕСТА" "$STAGING_DIR"
fi

PRIMARY_DOMAIN="${PROD_DOMAIN:-$STAGING_DOMAIN}"
PUBLIC_URL="https://${PRIMARY_DOMAIN}"
STAGING_URL=""
[[ -n "$STAGING_DOMAIN" ]] && STAGING_URL="https://${STAGING_DOMAIN}"
[[ "$TLS_MODE" == "skip" ]] && PUBLIC_URL="http://${PRIMARY_DOMAIN}"
[[ "$TLS_MODE" == "skip" && -n "$STAGING_DOMAIN" ]] && STAGING_URL="http://${STAGING_DOMAIN}"

if [[ $ASSUME_YES -eq 0 ]]; then
  echo
  echo "Сертификаты TLS:"
  echo "  1) Let's Encrypt (A-записи доменов на этот сервер)"
  echo "  2) Свои файлы (fullchain.pem + privkey.pem) — один набор на оба домена"
  echo "  3) Самоподписанный (для теста)"
  echo "  4) Без TLS, только HTTP"
  local_tls=""
  read -r -p "Выбор [1]: " local_tls || true
  case "${local_tls:-1}" in
    1) TLS_MODE=letsencrypt ;;
    2) TLS_MODE=custom ;;
    3) TLS_MODE=selfsigned ;;
    4) TLS_MODE=skip ;;
    *) TLS_MODE=letsencrypt ;;
  esac
fi

case "$TLS_MODE" in
  letsencrypt)
    ask LE_EMAIL "Email для Let's Encrypt" "${LE_EMAIL:-admin@${PRIMARY_DOMAIN}}"
    PUBLIC_URL="https://${PRIMARY_DOMAIN}"
    [[ -n "$STAGING_DOMAIN" ]] && STAGING_URL="https://${STAGING_DOMAIN}"
    ;;
  custom)
    ask TLS_CERT "Путь к fullchain.pem" "${TLS_CERT:-/etc/yp-portal/tls/fullchain.pem}"
    ask TLS_KEY "Путь к privkey.pem" "${TLS_KEY:-/etc/yp-portal/tls/privkey.pem}"
    PUBLIC_URL="https://${PRIMARY_DOMAIN}"
    [[ -n "$STAGING_DOMAIN" ]] && STAGING_URL="https://${STAGING_DOMAIN}"
    ;;
  selfsigned)
    PUBLIC_URL="https://${PRIMARY_DOMAIN}"
    [[ -n "$STAGING_DOMAIN" ]] && STAGING_URL="https://${STAGING_DOMAIN}"
    ;;
  skip)
    PUBLIC_URL="http://${PRIMARY_DOMAIN}"
    [[ -n "$STAGING_DOMAIN" ]] && STAGING_URL="http://${STAGING_DOMAIN}"
    ENABLE_HSTS=0
    ;;
  *) die "TLS_MODE должен быть letsencrypt|custom|selfsigned|skip" ;;
esac

echo
echo "Защита и безопасность:"
ask_yn ENABLE_UFW "Включить UFW (80, 443, SSH)" "$ENABLE_UFW"
ask_yn ENABLE_FAIL2BAN "Включить fail2ban (ssh + nginx)" "$ENABLE_FAIL2BAN"
ask SSH_PORT "Порт SSH (0 = не менять)" "$SSH_PORT"
ask_yn LOCK_SSH "Запретить пароль SSH (только ключ)" "$LOCK_SSH"
if [[ "$LOCK_SSH" == "1" && -z "$SSH_PUBKEY" && $ASSUME_YES -eq 0 ]]; then
  ask SSH_PUBKEY "Публичный SSH-ключ (одна строка, пусто = уже в authorized_keys)" ""
fi
if [[ $ASSUME_YES -eq 0 ]]; then
  echo "Nginx rate-limit:"
  echo "  1) как на young (40/30/5 r/s)  — рекомендуется"
  echo "  2) жёстче (20/15/3)"
  echo "  3) выключить лимиты"
  local_rp=""
  read -r -p "Выбор [1]: " local_rp || true
  case "${local_rp:-1}" in
    1) RATE_PROFILE=young ;;
    2) RATE_PROFILE=strict ;;
    3) RATE_PROFILE=off ;;
    *) RATE_PROFILE=young ;;
  esac
fi
ask_yn ENABLE_HSTS "HSTS (только при HTTPS)" "$ENABLE_HSTS"
ask_yn ENABLE_UNATTENDED "Автообновления безопасности ОС" "$ENABLE_UNATTENDED"

gen_admin_password() {
  # letters+digits, >=12 chars (seed-bootstrap-admin rules)
  local p
  p="$(openssl rand -base64 18 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 14)"
  [[ ${#p} -ge 12 ]] || p="Yp$(openssl rand -hex 6)9"
  # ensure both letter and digit
  [[ "$p" =~ [A-Za-z] ]] || p="A${p}"
  [[ "$p" =~ [0-9] ]] || p="${p}1"
  echo "$p"
}

if [[ $RECONFIGURE -eq 0 ]]; then
  echo
  case "$INSTALL_PROFILE" in
    client) echo "Профиль: КЛИЕНТ — чистая БД + выдача первого ADMIN." ;;
    developer) echo "Профиль: РАЗРАБОТЧИК — стенд для разработки / клон." ;;
  esac
  case "$VARIANT" in
    full) echo "Данные: полный клон из snapshot/ (БД + uploads)." ;;
    demo) echo "Данные: чистая БД + учётки всех ролей (SEED_PASSWORD)." ;;
    *) echo "Данные: чистый проект (пустая БД, prisma db push)." ;;
  esac
  if [[ "$REINSTALL" == "1" ]]; then
    echo "Переустановка: контейнеры и Postgres будут снесены."
  fi
  if [[ "$SEED_ROLES" == "1" ]]; then
    ask SEED_PASSWORD "Общий пароль учёток ролей" "$SEED_PASSWORD"
  fi
  if [[ "$REQUIRE_ADMIN" == "1" || "$SEED_ROLES" != "1" ]]; then
    if [[ "$REQUIRE_ADMIN" == "1" ]]; then
      ask ADMIN_EMAIL "Email первого администратора" "${ADMIN_EMAIL:-admin@${PRIMARY_DOMAIN}}"
      [[ -n "$ADMIN_EMAIL" ]] || die "Для профиля client нужен --admin-email"
      if [[ -z "$ADMIN_PASSWORD" ]]; then
        if [[ $ASSUME_YES -eq 1 ]]; then
          ADMIN_PASSWORD="$(gen_admin_password)"
          ADMIN_PASSWORD_GENERATED=1
          echo "  пароль админа сгенерирован (будет в /etc/yp-portal/admin-credentials.txt)"
        else
          ask_secret ADMIN_PASSWORD "Пароль администратора (пусто = сгенерировать)"
          if [[ -z "$ADMIN_PASSWORD" ]]; then
            ADMIN_PASSWORD="$(gen_admin_password)"
            ADMIN_PASSWORD_GENERATED=1
            echo "  сгенерирован пароль админа"
          fi
        fi
      fi
    else
      ask ADMIN_EMAIL "Email администратора (пусто = пропустить)" "${ADMIN_EMAIL:-}"
      if [[ -n "$ADMIN_EMAIL" ]]; then
        ask_secret ADMIN_PASSWORD "Пароль администратора (мин. 10, буквы+цифры)"
      fi
    fi
  fi
fi

# Client non-interactive: generate password if missing
if [[ "$REQUIRE_ADMIN" == "1" ]]; then
  [[ -n "$ADMIN_EMAIL" ]] || die "Профиль client: укажите --admin-email"
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD="$(gen_admin_password)"
    ADMIN_PASSWORD_GENERATED=1
  fi
fi

echo
echo "──────── план ────────"
echo "  Профиль:      ${INSTALL_PROFILE:-—}"
echo "  Вариант:      $VARIANT"
echo "  Переуст.:     $REINSTALL"
echo "  Seed roles:   $SEED_ROLES"
echo "  Режим:        $MODE"
echo "  Название:     $SITE_NAME"
want_prod && echo "  Прод:         $PUBLIC_URL  → $APP_DIR  :3000"
want_staging && echo "  Тест:         $STAGING_URL  → $STAGING_DIR  :3001"
echo "  TLS:          $TLS_MODE"
echo "  Rate-limit:   $RATE_PROFILE"
echo "  UFW:          $ENABLE_UFW   fail2ban: $ENABLE_FAIL2BAN   HSTS: $ENABLE_HSTS"
echo "  SSH порт:     $SSH_PORT   lock-ssh: $LOCK_SSH"
echo "  Данные:       $RESTORE_DATA"
echo "  Админ:        ${ADMIN_EMAIL:-не задан}${ADMIN_PASSWORD_GENERATED:+ (пароль будет сгенерирован)}"
echo "  Исходники:    ${SOURCE_TGZ:-$(repo_tree_ok && echo "$KIT_ROOT (репозиторий)" || echo "нет")}"
echo "  Снимок:       ${SNAPSHOT_DIR:-нет}"
echo "─────────────────────"
if [[ $ASSUME_YES -eq 0 ]]; then
  conf=""
  read -r -p "Продолжить? [y/N]: " conf || true
  case "${conf,,}" in y|yes|д|да) ;; *) echo "Отменено."; exit 2 ;; esac
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] остановка здесь"
  exit 0
fi

if [[ $RECONFIGURE -eq 0 ]]; then
  if [[ -z "$SOURCE_TGZ" && ! -f "${SNAPSHOT_DIR:-/no}/host-app.tgz" && ! repo_tree_ok ]]; then
    die "Нет source/app.tgz, snapshot/host-app.tgz и дерева репозитория. Распакуйте kit или запускайте из клона."
  fi
fi

export DEBIAN_FRONTEND=noninteractive

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

compose_prod() {
  (cd "$APP_DIR" && compose "$@")
}

compose_staging() {
  (cd "$STAGING_DIR" && compose -p sochi-staging -f docker-compose.staging.yml "$@")
}

db_ctr() {
  docker ps --format '{{.Names}}' | grep -E '^sochi-portal(_|-)db' | head -1
}

web_ctr() {
  docker ps --format '{{.Names}}' | grep -E '^sochi-portal(_|-)web' | head -1
}

redis_ctr() {
  docker ps --format '{{.Names}}' | grep -E '^sochi-portal(_|-)redis' | head -1
}

# ── packages ──────────────────────────────────────────────────────
echo "==> [1] Пакеты ОС"
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git ufw openssl \
  nginx rsync cron dnsutils iproute2 tar gzip python3
if [[ "$ENABLE_FAIL2BAN" == "1" ]]; then
  apt-get install -y fail2ban
fi
if [[ "$ENABLE_UNATTENDED" == "1" ]]; then
  apt-get install -y unattended-upgrades apt-listchanges
fi
if [[ "$TLS_MODE" == "letsencrypt" ]]; then
  apt-get install -y certbot python3-certbot-nginx || apt-get install -y certbot || true
fi

OS_ID="$(. /etc/os-release && echo "${ID:-debian}")"
OS_CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-bookworm}")"
DOCKER_DISTRO="debian"
[[ "$OS_ID" == "ubuntu" ]] && DOCKER_DISTRO="ubuntu"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${DOCKER_DISTRO}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DOCKER_DISTRO} ${OS_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
if ! command -v docker-compose >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  printf '%s\n' '#!/bin/sh' 'exec docker compose "$@"' > /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# ── swap + harden ─────────────────────────────────────────────────
echo "==> [2] Swap / sysctl / SSH / firewall"
SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
if [[ "${SWAP_MB:-0}" -lt $((SWAP_GB * 900)) && ! -f /swapfile ]]; then
  fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=none
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -qE '^/swapfile\s' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null 2>&1 || true
cat > /etc/sysctl.d/99-yp-hardening.conf <<'SYS'
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
vm.swappiness = 10
SYS
sysctl --system >/dev/null 2>&1 || true

if [[ "$ENABLE_UNATTENDED" == "1" ]]; then
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AU'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AU
  systemctl enable --now unattended-upgrades 2>/dev/null || true
fi

if [[ "$SSH_PORT" != "0" ]]; then
  mkdir -p /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/99-yp-hardening.conf <<SSH
Port ${SSH_PORT}
Protocol 2
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 4
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowAgentForwarding no
AllowTcpForwarding no
DebianBanner no
SSH
  if [[ -n "$SSH_PUBKEY" ]]; then
    mkdir -p /root/.ssh && chmod 700 /root/.ssh
    touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
    grep -qxF "$SSH_PUBKEY" /root/.ssh/authorized_keys 2>/dev/null || echo "$SSH_PUBKEY" >> /root/.ssh/authorized_keys
  fi
  if [[ "$LOCK_SSH" == "1" ]]; then
    [[ -s /root/.ssh/authorized_keys ]] || die "--lock-ssh нужен ключ в /root/.ssh/authorized_keys"
    cat >> /etc/ssh/sshd_config.d/99-yp-hardening.conf <<'LOCK'
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
LOCK
  else
    cat >> /etc/ssh/sshd_config.d/99-yp-hardening.conf <<'SOFT'
PermitRootLogin yes
PasswordAuthentication yes
PubkeyAuthentication yes
SOFT
  fi
  if [[ -f /etc/ssh/sshd_config ]] && ! grep -qE "^Port ${SSH_PORT}$" /etc/ssh/sshd_config; then
    sed -i 's/^#\?Port .*/Port '"${SSH_PORT}"'/' /etc/ssh/sshd_config || true
    grep -qE "^Port ${SSH_PORT}$" /etc/ssh/sshd_config || echo "Port ${SSH_PORT}" >> /etc/ssh/sshd_config
  fi
  sshd -t && (systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true)
fi

if [[ "$ENABLE_UFW" == "1" ]]; then
  ufw default deny incoming || true
  ufw default allow outgoing || true
  ufw allow 80/tcp comment 'http' || true
  ufw allow 443/tcp comment 'https' || true
  if [[ "$SSH_PORT" != "0" ]]; then
    ufw allow "${SSH_PORT}/tcp" comment 'yp-ssh' || true
    [[ "$SSH_PORT" != "22" ]] && ufw allow 22/tcp comment 'ssh-legacy-temp' || true
  else
    ufw allow OpenSSH || ufw allow 22/tcp || true
  fi
  ufw --force enable || true
fi

if [[ "$ENABLE_FAIL2BAN" == "1" ]]; then
  F2B_PORT="22"
  [[ "$SSH_PORT" != "0" ]] && F2B_PORT="${SSH_PORT},22"
  cat > /etc/fail2ban/jail.d/yp-sshd.local <<JAIL
[sshd]
enabled = true
port = ${F2B_PORT}
filter = sshd
maxretry = 5
findtime = 600
bantime = 86400
JAIL
  F2B_NGINX="$(find_template fail2ban-yp-nginx.local || true)"
  if [[ -n "$F2B_NGINX" ]]; then
    cp -f "$F2B_NGINX" /etc/fail2ban/jail.d/yp-nginx.local
  fi
  systemctl enable --now fail2ban
  systemctl restart fail2ban || true
fi

mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'DJ'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "25m", "max-file": "5" },
  "live-restore": true,
  "userland-proxy": false
}
DJ
  systemctl restart docker 2>/dev/null || true
fi

mkdir -p /var/backups/sochi-portal /var/log /etc/yp-portal /var/www/html
chmod 700 /etc/yp-portal /var/backups/sochi-portal

wipe_existing_stack() {
  echo "==> [2b] Полная переустановка: останавливаю стеки и чищу Postgres"
  if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
    (cd "$APP_DIR" && compose down --remove-orphans) 2>/dev/null || true
  fi
  if [[ -f "$STAGING_DIR/docker-compose.staging.yml" ]]; then
    (cd "$STAGING_DIR" && compose -p sochi-staging -f docker-compose.staging.yml down --remove-orphans) 2>/dev/null || true
  fi
  docker rm -f sochi-portal_web_1 sochi-portal_db_1 sochi-portal_redis_1 \
    sochi-staging_web_1 sochi-portal-staging_web_1 2>/dev/null || true
  # Бэкап старой БД на всякий случай
  if [[ -d "$APP_DIR/data/postgres" ]]; then
    local bak="/var/backups/sochi-portal/wipe-postgres-$(date -u +%Y%m%d-%H%M%S).tgz"
    tar -czf "$bak" -C "$APP_DIR/data" postgres 2>/dev/null || true
    echo "  бэкап старой БД: $bak"
    rm -rf "$APP_DIR/data/postgres"
  fi
  if [[ "$WIPE_UPLOADS" == "1" ]]; then
    rm -rf "$APP_DIR/public/uploads"
    mkdir -p "$APP_DIR/public/uploads"
  fi
  # Новые секреты при полной переустановке
  rm -f "$APP_DIR/.env" "$STAGING_DIR/.env"
  echo "  wipe done"
}

if [[ "$REINSTALL" == "1" && $RECONFIGURE -eq 0 ]]; then
  wipe_existing_stack
fi

rsync_app_into() {
  local dest="$1"
  mkdir -p "$dest"
  local src=""
  local stage=""
  if [[ -n "$SOURCE_TGZ" && -f "$SOURCE_TGZ" ]]; then
    stage="/tmp/yp-devkit-extract-$$"
    rm -rf "$stage"
    mkdir -p "$stage"
    tar -xzf "$SOURCE_TGZ" -C "$stage"
    if [[ -d "$stage/sochi-portal" ]]; then
      src="$stage/sochi-portal"
    else
      src="$stage"
    fi
  elif [[ -f "${SNAPSHOT_DIR:-/no}/host-app.tgz" ]]; then
    stage="/tmp/yp-devkit-extract-$$"
    rm -rf "$stage"
    mkdir -p "$stage"
    tar -xzf "$SNAPSHOT_DIR/host-app.tgz" -C "$stage"
    src="$stage/sochi-portal"
    [[ -d "$src" ]] || src="$stage"
  elif repo_tree_ok; then
    src="$KIT_ROOT"
  else
    die "Нечего распаковывать в $dest"
  fi
  rsync -a \
    --exclude '.env' --exclude '.env.*' \
    --exclude 'data/postgres/' --exclude 'public/uploads/' \
    --exclude 'node_modules/' --exclude '.next/' --exclude '.git/' \
    --exclude '*.tgz' --exclude '*.tar.gz' --exclude '*.zip' \
    "$src/" "$dest/"
  mkdir -p "$dest/public/uploads" "$dest/data" "$dest/certs" "$dest/backups"
  chmod 755 "$dest/public/uploads"
  # Клиент: не тащить docs/tests из архива (даже если попали в app.tgz)
  if [[ "${INSTALL_PROFILE:-}" == "client" ]]; then
    rm -rf "$dest/docs" "$dest/tests" "$dest/qa-screenshots" "$dest/.cursor" 2>/dev/null || true
  fi
  if [[ -n "$stage" ]]; then
    rm -rf "$stage"
  fi
}

env_get() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | tr -d '"' || true
}

write_env_prod() {
  local envf="$APP_DIR/.env"
  local pw rp secret cron
  pw="$(env_get "$envf" POSTGRES_PASSWORD)"
  rp="$(env_get "$envf" REDIS_PASSWORD)"
  secret="$(env_get "$envf" NEXTAUTH_SECRET)"
  cron="$(env_get "$envf" CRON_SECRET)"
  pw="${pw:-$(openssl rand -hex 16)}"
  rp="${rp:-$(openssl rand -hex 16)}"
  secret="${secret:-$(openssl rand -hex 32)}"
  cron="${cron:-$(openssl rand -hex 24)}"
  local extra=""
  if [[ -f "$envf" ]]; then
    extra="$(grep -E '^(RESEND_|TELEGRAM_|VAPID_|ALERT_|BACKUP_|YANDEX_|VK_|TECH_)' "$envf" || true)"
  fi
  umask 077
  cat > "$envf" <<EOF
COMPOSE_PROJECT_NAME=sochi-portal
POSTGRES_USER=sochi
POSTGRES_PASSWORD=${pw}
POSTGRES_DB=sochi_portal
DATABASE_URL=postgresql://sochi:${pw}@db:5432/sochi_portal?schema=public
REDIS_PASSWORD=${rp}
REDIS_URL=redis://:${rp}@redis:6379
NEXTAUTH_URL=${PUBLIC_URL}
NEXTAUTH_SECRET=${secret}
NEXT_PUBLIC_SITE_URL=${PUBLIC_URL}
CRON_SECRET=${cron}
UPLOAD_DIR=/app/uploads
NODE_ENV=production
EMAIL_SMTP_BLOCKED=1
EMAIL_PROVIDER=resend
RESEND_FROM=noreply@${PRIMARY_DOMAIN}
VAPID_SUBJECT=mailto:noreply@${PRIMARY_DOMAIN}
EOF
  if [[ -n "$extra" ]]; then
    echo "$extra" >> "$envf"
  fi
  chmod 600 "$envf"
}

write_env_staging() {
  local envf="$STAGING_DIR/.env"
  local prod_env="$APP_DIR/.env"
  local pw rp secret cron dbhost redishost
  if [[ -f "$prod_env" ]]; then
    pw="$(env_get "$prod_env" POSTGRES_PASSWORD)"
    rp="$(env_get "$prod_env" REDIS_PASSWORD)"
    secret="$(env_get "$prod_env" NEXTAUTH_SECRET)"
    cron="$(env_get "$prod_env" CRON_SECRET)"
  fi
  if [[ -f "$envf" ]]; then
    pw="${pw:-$(env_get "$envf" POSTGRES_PASSWORD)}"
    rp="${rp:-$(env_get "$envf" REDIS_PASSWORD)}"
    secret="${secret:-$(env_get "$envf" NEXTAUTH_SECRET)}"
    cron="${cron:-$(env_get "$envf" CRON_SECRET)}"
  fi
  pw="${pw:-$(openssl rand -hex 16)}"
  rp="${rp:-$(openssl rand -hex 16)}"
  secret="${secret:-$(openssl rand -hex 32)}"
  cron="${cron:-$(openssl rand -hex 24)}"
  dbhost="$(db_ctr)"
  redishost="$(redis_ctr)"
  dbhost="${dbhost:-sochi-portal_db_1}"
  redishost="${redishost:-sochi-portal_redis_1}"
  local extra=""
  if [[ -f "$prod_env" ]]; then
    extra="$(grep -E '^(RESEND_|TELEGRAM_|VAPID_|ALERT_|BACKUP_|YANDEX_|VK_|TECH_)' "$prod_env" || true)"
  elif [[ -f "$envf" ]]; then
    extra="$(grep -E '^(RESEND_|TELEGRAM_|VAPID_|ALERT_|BACKUP_|YANDEX_|VK_|TECH_)' "$envf" || true)"
  fi
  umask 077
  cat > "$envf" <<EOF
COMPOSE_PROJECT_NAME=sochi-staging
POSTGRES_USER=sochi
POSTGRES_PASSWORD=${pw}
POSTGRES_DB=sochi_portal
DATABASE_URL=postgresql://sochi:${pw}@${dbhost}:5432/sochi_portal?schema=public
REDIS_PASSWORD=${rp}
REDIS_URL=redis://:${rp}@${redishost}:6379
NEXTAUTH_URL=${STAGING_URL}
NEXTAUTH_SECRET=${secret}
NEXT_PUBLIC_SITE_URL=${STAGING_URL}
CRON_SECRET=${cron}
UPLOAD_DIR=/app/uploads
NODE_ENV=production
EMAIL_SMTP_BLOCKED=1
EMAIL_PROVIDER=resend
RESEND_FROM=noreply@${STAGING_DOMAIN}
VAPID_SUBJECT=mailto:noreply@${STAGING_DOMAIN}
EOF
  if [[ -n "$extra" ]]; then
    echo "$extra" >> "$envf"
  fi
  chmod 600 "$envf"
}

if [[ $RECONFIGURE -eq 0 ]]; then
  echo "==> [3] Распаковка исходников"
  if want_prod; then
    if [[ -f "$APP_DIR/docker-compose.yml" && "$FORCE" != "1" ]]; then
      echo "  $APP_DIR уже есть — синхронизируем код, секреты .env не затираем"
    fi
    rsync_app_into "$APP_DIR"
    write_env_prod
    if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
      sed -i "s|NEXTAUTH_URL=\${NEXTAUTH_URL:-https://[^}]*}|NEXTAUTH_URL=\${NEXTAUTH_URL:-${PUBLIC_URL}}|" \
        "$APP_DIR/docker-compose.yml" || true
    fi
    # Проверка целостности kit до сборки/запуска
    if [[ "$INSTALL_PROFILE" == "client" && -f "$KIT_ROOT/INTEGRITY.json" && -f "${SOURCE_TGZ:-}" ]]; then
      expect="$(python3 -c "import json; print(json.load(open('$KIT_ROOT/INTEGRITY.json')).get('appTgz',''))" 2>/dev/null || true)"
      if [[ -n "$expect" ]]; then
        got="$(sha256sum "$SOURCE_TGZ" | awk '{print $1}')"
        [[ "$got" == "$expect" ]] || die "INTEGRITY: source/app.tgz не совпадает с INTEGRITY.json"
        echo "  INTEGRITY source/app.tgz OK"
      fi
    fi
  fi
  if want_staging; then
    rsync_app_into "$STAGING_DIR"
    if [[ -d "$APP_DIR/public/uploads" ]]; then
      rm -rf "$STAGING_DIR/public/uploads"
      ln -sfn "$APP_DIR/public/uploads" "$STAGING_DIR/public/uploads"
    fi
  fi
else
  echo "==> [3] Перенастройка .env (URL)"
  want_prod && write_env_prod
fi

# ── images + stacks ───────────────────────────────────────────────
echo "==> [4] Docker-образы и стек"
HAS_IMAGES=0
if [[ -n "$SNAPSHOT_DIR" && ( -f "$SNAPSHOT_DIR/images.tar.gz" || -f "$SNAPSHOT_DIR/sochi-portal_web-image.tar.gz" ) ]]; then
  HAS_IMAGES=1
fi

if [[ $RECONFIGURE -eq 0 && "$HAS_IMAGES" == "1" ]]; then
  if [[ -f "$SNAPSHOT_DIR/images.tar.gz" ]]; then
    echo "  docker load images.tar.gz…"
    gunzip -c "$SNAPSHOT_DIR/images.tar.gz" | docker load
  else
    gunzip -c "$SNAPSHOT_DIR/sochi-portal_web-image.tar.gz" | docker load
    docker pull postgres:16-alpine || true
    docker pull redis:7-alpine || true
  fi
  if docker image inspect sochi-portal_web:latest >/dev/null 2>&1; then
    docker tag sochi-portal_web:latest sochi-staging_web:latest 2>/dev/null || true
  fi
fi

if want_prod; then
  cd "$APP_DIR"
  if [[ "$HAS_IMAGES" == "1" ]] && docker image inspect sochi-portal_web:latest >/dev/null 2>&1; then
    compose_prod up -d db redis
  else
    echo "  сборка prod web из исходников (несколько минут, следите за RAM)…"
    docker image prune -f >/dev/null 2>&1 || true
    compose_prod build web
    compose_prod up -d db redis
  fi
  echo "  ждём Postgres…"
  for i in $(seq 1 60); do
    compose_prod exec -T db pg_isready >/dev/null 2>&1 && break
    sleep 2
  done
  compose_prod exec -T db pg_isready >/dev/null 2>&1 || die "Postgres не поднялся"
fi

if [[ $RECONFIGURE -eq 0 && "$RESTORE_DATA" == "1" ]] && want_prod; then
  echo "==> [5] Восстановление БД и загрузок"
  if [[ -f "$SNAPSHOT_DIR/uploads.tgz" ]]; then
    tar -xzf "$SNAPSHOT_DIR/uploads.tgz" -C "$APP_DIR/public"
  fi
  if [[ -f "$SNAPSHOT_DIR/db.dump" ]]; then
    compose_prod exec -T db psql -U sochi -d postgres -v ON_ERROR_STOP=1 -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='sochi_portal' AND pid <> pg_backend_pid();" \
      >/dev/null 2>&1 || true
    docker exec -i "$(db_ctr)" pg_restore -U sochi -d sochi_portal --clean --if-exists --no-owner \
      < "$SNAPSHOT_DIR/db.dump" || echo "WARN: pg_restore завершился с предупреждениями (часто нормально)"
  fi
elif want_prod; then
  echo "==> [5] Данные: пустая схема"
fi

if want_prod; then
  echo "==> [6] Запуск prod web :3000"
  if [[ "$HAS_IMAGES" == "1" ]] && docker image inspect sochi-portal_web:latest >/dev/null 2>&1; then
    compose_prod up -d --no-build web || compose_prod up -d --build web
  else
    compose_prod up -d web
  fi
  sleep 8
  if [[ "$RESTORE_DATA" != "1" || $RECONFIGURE -eq 1 ]]; then
    compose_prod exec -T web npx prisma db push --accept-data-loss >/dev/null 2>&1 || true
  fi
  for i in $(seq 1 40); do
    if curl -fsS --max-time 5 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      echo "  prod web healthy"
      break
    fi
    sleep 3
  done
fi

if want_staging; then
  echo "==> [6b] Запуск staging web :3001"
  docker network inspect sochi-portal_default >/dev/null 2>&1 \
    || die "Нет сети sochi-portal_default — сначала поднимите прод (MODE=dual или prod)"
  write_env_staging
  if [[ "$HAS_IMAGES" == "1" ]] && docker image inspect sochi-staging_web:latest >/dev/null 2>&1; then
    compose_staging up -d --no-build web || compose_staging up -d --build web
  else
    echo "  сборка staging web из исходников…"
    compose_staging up -d --build web
  fi
  sleep 8
  for i in $(seq 1 40); do
    if curl -fsS --max-time 5 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
      echo "  staging web healthy"
      break
    fi
    sleep 3
  done
fi

if want_prod; then
  echo "==> [7] Название портала и URL в БД"
  SITE_SQL="$(SITE_NAME="$SITE_NAME" PUBLIC_URL="$PUBLIC_URL" python3 - <<'PY'
import os
def sql_quote(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"
sn = sql_quote(os.environ["SITE_NAME"])
su = sql_quote(os.environ["PUBLIC_URL"])
print(f"""
INSERT INTO "SiteSettings" (id, "siteName", "publicSiteUrl")
VALUES ('1', {sn}, {su})
ON CONFLICT (id) DO UPDATE
SET "siteName" = EXCLUDED."siteName", "publicSiteUrl" = EXCLUDED."publicSiteUrl";
""")
PY
)"
  if [[ -n "$(db_ctr)" ]]; then
    docker exec -i "$(db_ctr)" psql -U sochi -d sochi_portal -v ON_ERROR_STOP=0 -c "$SITE_SQL" || true
  fi
  if [[ -n "$ADMIN_EMAIL" && -n "$ADMIN_PASSWORD" ]]; then
    echo "  сид администратора $ADMIN_EMAIL"
    W="$(web_ctr)"
    if [[ -n "$W" ]]; then
      docker exec -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
        -e SITE_NAME="$SITE_NAME" -e PUBLIC_URL="$PUBLIC_URL" \
        "$W" node /app/scripts/seed-bootstrap-admin.mjs || \
      docker exec -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
        -e SITE_NAME="$SITE_NAME" -e PUBLIC_URL="$PUBLIC_URL" \
        "$W" node scripts/seed-bootstrap-admin.mjs || \
        echo "WARN: не удалось создать админа (проверьте логи web)"
      mkdir -p /etc/yp-portal
      umask 077
      {
        echo "# YoungPortal — первый администратор"
        echo "# Создано: $(date -Is)"
        echo "PROFILE=${INSTALL_PROFILE:-manual}"
        echo "URL=${PUBLIC_URL}"
        echo "EMAIL=${ADMIN_EMAIL}"
        echo "PASSWORD=${ADMIN_PASSWORD}"
        [[ "$ADMIN_PASSWORD_GENERATED" == "1" ]] && echo "GENERATED=1"
      } > /etc/yp-portal/admin-credentials.txt
      chmod 600 /etc/yp-portal/admin-credentials.txt
      echo "  учётные данные: /etc/yp-portal/admin-credentials.txt"
    fi
  fi
fi

if [[ "$SEED_ROLES" == "1" ]] && want_prod; then
  echo "==> [7b] Первичные учётки всех ролей"
  SEED_DOMAIN="${SEED_DOMAIN:-${PRIMARY_DOMAIN}}"
  # TECH через .env
  if [[ -f "$APP_DIR/.env" ]]; then
    grep -qE '^TECH_EMAIL=' "$APP_DIR/.env" || echo "TECH_EMAIL=tech@${SEED_DOMAIN}" >> "$APP_DIR/.env"
    if ! grep -qE '^TECH_BOOTSTRAP_PASSWORD=' "$APP_DIR/.env"; then
      echo "TECH_BOOTSTRAP_PASSWORD=${SEED_PASSWORD}" >> "$APP_DIR/.env"
    else
      sed -i "s|^TECH_BOOTSTRAP_PASSWORD=.*|TECH_BOOTSTRAP_PASSWORD=${SEED_PASSWORD}|" "$APP_DIR/.env" || true
    fi
    # подхватить TECH в уже запущенном web
    compose_prod up -d --no-build web >/dev/null 2>&1 || true
    sleep 3
  fi
  W="$(web_ctr)"
  SEED_SCRIPT=""
  for cand in \
    "$APP_DIR/scripts/seed-install-roles.mjs" \
    "$KIT_ROOT/scripts/seed-install-roles.mjs" \
    "$KIT_ROOT/source/../scripts/seed-install-roles.mjs"
  do
    [[ -f "$cand" ]] && SEED_SCRIPT="$cand" && break
  done
  if [[ -n "$W" && -n "$SEED_SCRIPT" ]]; then
    docker cp "$SEED_SCRIPT" "$W:/app/scripts/seed-install-roles.mjs" 2>/dev/null || true
    docker exec \
      -e SEED_PASSWORD="$SEED_PASSWORD" \
      -e SEED_DOMAIN="$SEED_DOMAIN" \
      -e SEED_RESET_PASSWORDS=1 \
      -e SITE_NAME="$SITE_NAME" \
      -e PUBLIC_URL="$PUBLIC_URL" \
      -e SEED_ACCOUNTS_FILE=/tmp/yp-seed-accounts.txt \
      "$W" node /app/scripts/seed-install-roles.mjs \
      && docker cp "$W:/tmp/yp-seed-accounts.txt" /etc/yp-portal/seed-accounts.txt 2>/dev/null || true
    chmod 600 /etc/yp-portal/seed-accounts.txt 2>/dev/null || true
  else
    echo "WARN: нет web-контейнера или seed-install-roles.mjs"
  fi
fi

if want_prod; then
  echo "==> [7c] Модули сайта (MODULES=${MODULES}${MODULES_OFF:+ off=${MODULES_OFF}})"
  W="$(web_ctr)"
  APPLY_SCRIPT=""
  for cand in \
    "$APP_DIR/scripts/apply-module-selection.mjs" \
    "$KIT_ROOT/scripts/apply-module-selection.mjs"
  do
    [[ -f "$cand" ]] && APPLY_SCRIPT="$cand" && break
  done
  if [[ -n "$W" && -n "$APPLY_SCRIPT" ]]; then
    docker cp "$APPLY_SCRIPT" "$W:/app/scripts/apply-module-selection.mjs" 2>/dev/null || true
    docker exec \
      -e MODULES="$MODULES" \
      -e MODULES_OFF="$MODULES_OFF" \
      -e OFF_MODE="$OFF_MODE" \
      "$W" node /app/scripts/apply-module-selection.mjs \
      || echo "WARN: apply-module-selection не выполнился"
  else
    echo "WARN: нет apply-module-selection.mjs — модули остаются все включёнными"
  fi
fi

if [[ "$SEED_ORG" == "1" ]] && want_prod; then
  echo "==> [7d] Стартовый контент организации"
  W="$(web_ctr)"
  ORG_SCRIPT=""
  for cand in \
    "$APP_DIR/scripts/seed-org-starter.mjs" \
    "$KIT_ROOT/scripts/seed-org-starter.mjs"
  do
    [[ -f "$cand" ]] && ORG_SCRIPT="$cand" && break
  done
  if [[ -n "$W" && -n "$ORG_SCRIPT" ]]; then
    docker cp "$ORG_SCRIPT" "$W:/app/scripts/seed-org-starter.mjs" 2>/dev/null || true
    docker exec \
      -e SITE_NAME="$SITE_NAME" \
      -e PUBLIC_URL="$PUBLIC_URL" \
      -e CONTACT_EMAIL="${ADMIN_EMAIL:-admin@${PRIMARY_DOMAIN}}" \
      -e SEED_ORG_DEMO=1 \
      "$W" node /app/scripts/seed-org-starter.mjs \
      || echo "WARN: seed-org-starter не выполнился"
  else
    echo "WARN: нет seed-org-starter.mjs"
  fi
fi

# ── nginx + TLS ───────────────────────────────────────────────────
echo "==> [8] Nginx + сертификаты"
mkdir -p /etc/nginx/snippets /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/well-known

cat > /etc/nginx/snippets/yp-proxy.conf <<'PX'
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header X-Request-Id $request_id;
PX

COLLECTIBLES=""
case "$RATE_PROFILE" in
  strict)
    cat > /etc/nginx/conf.d/yp-limits.conf <<'LIM'
limit_req_zone $binary_remote_addr zone=yp_general:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=yp_api:10m rate=15r/s;
limit_req_zone $binary_remote_addr zone=yp_auth:10m rate=3r/s;
limit_conn_zone $binary_remote_addr zone=yp_conn:10m;
LIM
    RATE_AUTH='limit_req zone=yp_auth burst=8 nodelay;'
    RATE_API='limit_req zone=yp_api burst=20 nodelay;'
    RATE_GENERAL='limit_req zone=yp_general burst=40 nodelay;'
    LIMIT_CONN='limit_conn yp_conn 20;'
    ;;
  off)
    echo "# rate limits disabled by installer" > /etc/nginx/conf.d/yp-limits.conf
    RATE_AUTH=''
    RATE_API=''
    RATE_GENERAL=''
    LIMIT_CONN=''
    ;;
  *)
    TPL_LIM="$(find_template nginx-yp-limits.conf || true)"
    if [[ -n "$TPL_LIM" ]]; then
      cp -f "$TPL_LIM" /etc/nginx/conf.d/yp-limits.conf
    else
      cat > /etc/nginx/conf.d/yp-limits.conf <<'LIM'
limit_req_zone $binary_remote_addr zone=yp_general:10m rate=40r/s;
limit_req_zone $binary_remote_addr zone=yp_api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=yp_auth:10m rate=5r/s;
limit_conn_zone $binary_remote_addr zone=yp_conn:10m;
LIM
    fi
    RATE_AUTH='limit_req zone=yp_auth burst=20 nodelay;'
    RATE_API='limit_req zone=yp_api burst=80 nodelay;'
    RATE_GENERAL='limit_req zone=yp_general burst=100 nodelay;'
    LIMIT_CONN='limit_conn yp_conn 40;'
    ;;
esac

HSTS_LINE=""
if [[ "$ENABLE_HSTS" == "1" && "$TLS_MODE" != "skip" ]]; then
  HSTS_LINE='add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
fi

CONTACT_MAIL="${LE_EMAIL:-admin@${PRIMARY_DOMAIN}}"
cat > /etc/nginx/well-known/security.txt <<ST
Contact: mailto:${CONTACT_MAIL}
Preferred-Languages: ru, en
Canonical: ${PUBLIC_URL}/.well-known/security.txt
ST

render_via_python() {
  local tpl="$1" dest="$2"
  python3 - "$tpl" "$dest" <<'PY'
import os, pathlib, sys
t = pathlib.Path(sys.argv[1]).read_text()
keys = [
    "DOMAIN", "APP_DIR", "PROD_DOMAIN", "STAGING_DOMAIN",
    "PROD_APP_DIR", "STAGING_APP_DIR",
    "RATE_AUTH", "RATE_API", "RATE_GENERAL", "LIMIT_CONN",
    "COLLECTIBLES", "HSTS",
    "LISTEN_SSL", "SSL_CERT", "SSL_KEY",
    "PROD_LISTEN_SSL", "PROD_SSL_CERT", "PROD_SSL_KEY",
    "STAGING_LISTEN_SSL", "STAGING_SSL_CERT", "STAGING_SSL_KEY",
    "SSL_INCLUDE", "SSL_DHPARAM",
    "HTTP_ROOT", "PROD_HTTP_ROOT", "STAGING_HTTP_ROOT",
]
for k in keys:
    t = t.replace("__" + k + "__", os.environ.get("YP_NGX_" + k, ""))
pathlib.Path(sys.argv[2]).write_text(t)
PY
}

export_ngx_common() {
  export YP_NGX_RATE_AUTH="$RATE_AUTH" YP_NGX_RATE_API="$RATE_API" \
    YP_NGX_RATE_GENERAL="$RATE_GENERAL" YP_NGX_LIMIT_CONN="$LIMIT_CONN" \
    YP_NGX_COLLECTIBLES="$COLLECTIBLES" YP_NGX_HSTS="$HSTS_LINE" \
    YP_NGX_SSL_INCLUDE="${1:-}" YP_NGX_SSL_DHPARAM="${2:-}"
}

ssl_include_for() {
  local cert="$1"
  if [[ -n "$cert" && -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    echo "include /etc/letsencrypt/options-ssl-nginx.conf;"
  elif [[ -n "$cert" ]]; then
    echo "ssl_protocols TLSv1.2 TLSv1.3; ssl_prefer_server_ciphers off;"
  fi
}

ssl_dh_for() {
  local cert="$1"
  if [[ -n "$cert" && -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
    echo "ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  fi
}

render_nginx() {
  local prod_listen="${1:-}" prod_cert="${2:-}" prod_key="${3:-}"
  local st_listen="${4:-}" st_cert="${5:-}" st_key="${6:-}"
  local http_prod="${7:-}" http_st="${8:-}"
  local tmp="/tmp/yp-nginx-$$.conf"
  local inc dh
  inc="$(ssl_include_for "${prod_cert:-$st_cert}")"
  dh="$(ssl_dh_for "${prod_cert:-$st_cert}")"
  export_ngx_common "$inc" "$dh"

  if [[ "$MODE" == "dual" ]]; then
    local tpl
    tpl="$(find_template nginx-dual-site.conf.tpl || true)"
    [[ -n "$tpl" ]] || die "Нет шаблона nginx-dual-site.conf.tpl"
    export YP_NGX_PROD_DOMAIN="$PROD_DOMAIN" YP_NGX_STAGING_DOMAIN="$STAGING_DOMAIN" \
      YP_NGX_PROD_APP_DIR="$APP_DIR" YP_NGX_STAGING_APP_DIR="$STAGING_DIR" \
      YP_NGX_PROD_LISTEN_SSL="$prod_listen" \
      YP_NGX_PROD_SSL_CERT="${prod_cert:+ssl_certificate ${prod_cert};}" \
      YP_NGX_PROD_SSL_KEY="${prod_key:+ssl_certificate_key ${prod_key};}" \
      YP_NGX_STAGING_LISTEN_SSL="$st_listen" \
      YP_NGX_STAGING_SSL_CERT="${st_cert:+ssl_certificate ${st_cert};}" \
      YP_NGX_STAGING_SSL_KEY="${st_key:+ssl_certificate_key ${st_key};}" \
      YP_NGX_PROD_HTTP_ROOT="$http_prod" YP_NGX_STAGING_HTTP_ROOT="$http_st"
    render_via_python "$tpl" "$tmp"
  else
    local tpl domain appdir listen cert key http_root
    tpl="$(find_template nginx-clone-site.conf.tpl || true)"
    [[ -n "$tpl" ]] || die "Нет шаблона nginx-clone-site.conf.tpl"
    if [[ "$MODE" == "staging" ]]; then
      domain="$STAGING_DOMAIN"
      appdir="$STAGING_DIR"
      listen="$st_listen"
      cert="$st_cert"
      key="$st_key"
      http_root="$http_st"
    else
      domain="$PROD_DOMAIN"
      appdir="$APP_DIR"
      listen="$prod_listen"
      cert="$prod_cert"
      key="$prod_key"
      http_root="$http_prod"
    fi
    export YP_NGX_DOMAIN="$domain" YP_NGX_APP_DIR="$appdir" \
      YP_NGX_LISTEN_SSL="$listen" \
      YP_NGX_SSL_CERT="${cert:+ssl_certificate ${cert};}" \
      YP_NGX_SSL_KEY="${key:+ssl_certificate_key ${key};}" \
      YP_NGX_HTTP_ROOT="$http_root"
    render_via_python "$tpl" "$tmp"
    if [[ "$MODE" == "staging" ]]; then
      sed -i 's/127.0.0.1:3000/127.0.0.1:3001/g' "$tmp"
    fi
  fi
  cp -f "$tmp" /etc/nginx/sites-available/sochi-portal
  rm -f "$tmp"
}

HTTP_PROXY_PROD='proxy_pass http://yp_web_prod; include /etc/nginx/snippets/yp-proxy.conf;'
HTTP_PROXY_ST='proxy_pass http://yp_web_staging; include /etc/nginx/snippets/yp-proxy.conf;'
HTTP_PROXY_SINGLE='proxy_pass http://yp_web; include /etc/nginx/snippets/yp-proxy.conf;'
HTTP_REDIRECT='return 301 https://$host$request_uri;'

if [[ "$MODE" == "dual" ]]; then
  render_nginx "" "" "" "" "" "" "$HTTP_PROXY_PROD" "$HTTP_PROXY_ST"
else
  render_nginx "" "" "" "" "" "" "$HTTP_PROXY_SINGLE" "$HTTP_PROXY_SINGLE"
fi

# Убрать чужие site-конфиги с теми же server_name (иначе ACME → 404)
disable_conflicting_nginx_sites() {
  local domains=("$@")
  local f base
  shopt -s nullglob
  for f in /etc/nginx/sites-enabled/*; do
    base="$(basename "$f")"
    [[ "$base" == "sochi-portal" ]] && continue
    for d in "${domains[@]}"; do
      [[ -z "$d" ]] && continue
      if grep -qE "server_name[[:space:]]+.*\b${d}\b" "$f" 2>/dev/null; then
        echo "  отключаю конфликтующий nginx site: $base (домен $d)"
        rm -f "$f"
        break
      fi
    done
  done
  # часто лежат дубликаты в conf.d
  for f in /etc/nginx/conf.d/*.conf; do
    base="$(basename "$f")"
    [[ "$base" == "yp-limits.conf" ]] && continue
    for d in "${domains[@]}"; do
      [[ -z "$d" ]] && continue
      if grep -qE "server_name[[:space:]]+.*\b${d}\b" "$f" 2>/dev/null; then
        echo "  отключаю конфликтующий conf.d: $base → ${base}.yp-disabled"
        mv -f "$f" "${f}.yp-disabled" 2>/dev/null || rm -f "$f"
        break
      fi
    done
  done
  shopt -u nullglob
}
disable_conflicting_nginx_sites "${PROD_DOMAIN:-}" "${STAGING_DOMAIN:-}"

ln -sfn /etc/nginx/sites-available/sochi-portal /etc/nginx/sites-enabled/sochi-portal
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx

this_server_ips() {
  hostname -I 2>/dev/null || true
  ip -4 addr show scope global 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1 || true
}

dns_points_here() {
  local domain="$1"
  local ips resolved hit extra
  ips="$(this_server_ips | tr ' ' '\n' | grep -E '^[0-9.]+$' | sort -u)"
  resolved="$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u)"
  [[ -n "$resolved" ]] || resolved="$(dig +short A "$domain" 2>/dev/null | grep -E '^[0-9.]+$' | sort -u)"
  if [[ -z "$resolved" ]]; then
    echo "  DNS: $domain — нет A-записи"
    return 1
  fi
  echo "  DNS: $domain → $(echo "$resolved" | tr '\n' ' ')"
  echo "  этот сервер: $(echo "$ips" | tr '\n' ' ')"
  hit=0
  extra=0
  while read -r rip; do
    [[ -z "$rip" ]] && continue
    if echo "$ips" | grep -qx "$rip"; then
      hit=1
    else
      extra=1
      echo "  ERROR: лишний A $domain → $rip (не этот сервер)"
    fi
  done <<< "$resolved"
  if [[ "$extra" == "1" ]]; then
    echo "  → оставьте ОДНУ A-запись на IP этого сервера, иначе Let's Encrypt не выпустится"
    return 1
  fi
  [[ "$hit" == "1" ]]
}

wait_dns_here() {
  local domain="$1" tries="${2:-12}"
  local i
  for i in $(seq 1 "$tries"); do
    if dns_points_here "$domain"; then return 0; fi
    echo "  жду DNS для $domain… ($i/$tries, 5с)"
    sleep 5
  done
  return 1
}

issue_le() {
  local domain="$1"
  mkdir -p /var/www/html/.well-known/acme-challenge
  echo ok > /var/www/html/.well-known/acme-challenge/yp-ping
  chmod -R a+rX /var/www/html/.well-known || true
  systemctl reload nginx 2>/dev/null || true

  if ! wait_dns_here "$domain" 8; then
    echo "WARN: DNS $domain не готов (нет A / лишние A) — пропускаю certbot"
    return 1
  fi

  local ping
  ping="$(curl -sS --max-time 5 -H "Host: $domain" "http://127.0.0.1/.well-known/acme-challenge/yp-ping" || true)"
  if [[ "$ping" != "ok" ]]; then
    echo "WARN: ACME webroot локально не отдаёт ok (получили: '${ping:-пусто}'). Чиню location и пробую снова."
    disable_conflicting_nginx_sites "$domain"
    nginx -t && systemctl reload nginx
    ping="$(curl -sS --max-time 5 -H "Host: $domain" "http://127.0.0.1/.well-known/acme-challenge/yp-ping" || true)"
    if [[ "$ping" != "ok" ]]; then
      echo "WARN: ACME path всё ещё недоступен для $domain — certbot скорее всего упадёт"
    fi
  fi

  certbot certonly --webroot -w /var/www/html -d "$domain" \
    --non-interactive --agree-tos -m "$LE_EMAIL" --keep-until-expiring --preferred-challenges http
}

ensure_selfsigned() {
  local kind="$1" domain="$2"
  mkdir -p /etc/yp-portal/tls
  local cert="/etc/yp-portal/tls/${kind}-fullchain.pem"
  local key="/etc/yp-portal/tls/${kind}-privkey.pem"
  if [[ ! -f "$cert" || ! -f "$key" ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "$key" -out "$cert" \
      -subj "/CN=${domain}/O=${SITE_NAME}" >/dev/null 2>&1
    chmod 600 "$key"
  fi
  printf '%s|%s\n' "$cert" "$key"
}

# Only enable HTTPS listen when cert AND key files are readable.
ssl_listen_line() {
  local cert="${1:-}" key="${2:-}"
  if [[ -n "$cert" && -n "$key" && -f "$cert" && -f "$key" ]]; then
    echo "listen 443 ssl http2;"
  fi
}

PROD_CERT=""
PROD_KEY=""
ST_CERT=""
ST_KEY=""
TLS_EFFECTIVE="$TLS_MODE"
LE_FAILED_DOMAINS=()
case "$TLS_MODE" in
  letsencrypt)
    mkdir -p /var/www/html
    if ! command -v certbot >/dev/null 2>&1; then
      apt-get install -y certbot python3-certbot-nginx || apt-get install -y certbot || true
    fi
    # Fresh certbot often lacks options-ssl-nginx.conf until first successful run
    if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
      mkdir -p /etc/letsencrypt
      cat > /etc/letsencrypt/options-ssl-nginx.conf <<'OPT'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
OPT
    fi
    if command -v certbot >/dev/null 2>&1; then
      if want_prod; then
        if issue_le "$PROD_DOMAIN" && [[ -f "/etc/letsencrypt/live/${PROD_DOMAIN}/fullchain.pem" ]]; then
          PROD_CERT="/etc/letsencrypt/live/${PROD_DOMAIN}/fullchain.pem"
          PROD_KEY="/etc/letsencrypt/live/${PROD_DOMAIN}/privkey.pem"
        else
          echo "WARN: Let's Encrypt не выпустился для $PROD_DOMAIN. Ставлю временный self-signed."
          LE_FAILED_DOMAINS+=("$PROD_DOMAIN")
          IFS='|' read -r PROD_CERT PROD_KEY < <(ensure_selfsigned prod "$PROD_DOMAIN")
          TLS_EFFECTIVE=selfsigned
        fi
      fi
      if want_staging; then
        if issue_le "$STAGING_DOMAIN" && [[ -f "/etc/letsencrypt/live/${STAGING_DOMAIN}/fullchain.pem" ]]; then
          ST_CERT="/etc/letsencrypt/live/${STAGING_DOMAIN}/fullchain.pem"
          ST_KEY="/etc/letsencrypt/live/${STAGING_DOMAIN}/privkey.pem"
        else
          echo "WARN: Let's Encrypt не выпустился для $STAGING_DOMAIN. Ставлю временный self-signed."
          LE_FAILED_DOMAINS+=("$STAGING_DOMAIN")
          IFS='|' read -r ST_CERT ST_KEY < <(ensure_selfsigned staging "$STAGING_DOMAIN")
          TLS_EFFECTIVE=selfsigned
        fi
      fi
      if [[ -f "/etc/letsencrypt/live/${PROD_DOMAIN:-_}/fullchain.pem" || -f "/etc/letsencrypt/live/${STAGING_DOMAIN:-_}/fullchain.pem" ]]; then
        systemctl enable certbot.timer 2>/dev/null || true
        cat > /etc/cron.d/yp-certbot-renew <<'CRON'
17 3 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'
CRON
        chmod 644 /etc/cron.d/yp-certbot-renew
      fi
    else
      echo "WARN: certbot не установлен — self-signed"
      TLS_EFFECTIVE=selfsigned
      want_prod && IFS='|' read -r PROD_CERT PROD_KEY < <(ensure_selfsigned prod "$PROD_DOMAIN")
      want_staging && IFS='|' read -r ST_CERT ST_KEY < <(ensure_selfsigned staging "$STAGING_DOMAIN")
    fi
    # HSTS нельзя включать на self-signed — браузер «запомнит» и сайт «сломается»
    if [[ "$TLS_EFFECTIVE" == "selfsigned" ]]; then
      ENABLE_HSTS=0
    fi
    ;;
  custom)
    [[ -f "$TLS_CERT" && -f "$TLS_KEY" ]] || die "Нет файлов сертификата: $TLS_CERT / $TLS_KEY"
    mkdir -p /etc/yp-portal/tls
    cp -f "$TLS_CERT" /etc/yp-portal/tls/fullchain.pem
    cp -f "$TLS_KEY" /etc/yp-portal/tls/privkey.pem
    chmod 600 /etc/yp-portal/tls/privkey.pem
    PROD_CERT=/etc/yp-portal/tls/fullchain.pem
    PROD_KEY=/etc/yp-portal/tls/privkey.pem
    ST_CERT="$PROD_CERT"
    ST_KEY="$PROD_KEY"
    TLS_EFFECTIVE=custom
    ;;
  selfsigned)
    want_prod && IFS='|' read -r PROD_CERT PROD_KEY < <(ensure_selfsigned prod "$PROD_DOMAIN")
    want_staging && IFS='|' read -r ST_CERT ST_KEY < <(ensure_selfsigned staging "$STAGING_DOMAIN")
    TLS_EFFECTIVE=selfsigned
    ENABLE_HSTS=0
    ;;
  skip)
    PROD_CERT=""
    PROD_KEY=""
    ST_CERT=""
    ST_KEY=""
    TLS_EFFECTIVE=skip
    ENABLE_HSTS=0
    ;;
esac

# Validate files — never point nginx at missing certs (causes :443 reset)
if [[ -n "$PROD_CERT" && ( ! -f "$PROD_CERT" || ! -f "$PROD_KEY" ) ]]; then
  echo "WARN: битый prod cert — self-signed"
  IFS='|' read -r PROD_CERT PROD_KEY < <(ensure_selfsigned prod "$PROD_DOMAIN")
fi
if [[ -n "$ST_CERT" && ( ! -f "$ST_CERT" || ! -f "$ST_KEY" ) ]]; then
  echo "WARN: битый staging cert — self-signed"
  IFS='|' read -r ST_CERT ST_KEY < <(ensure_selfsigned staging "$STAGING_DOMAIN")
fi

PROD_LISTEN="$(ssl_listen_line "$PROD_CERT" "$PROD_KEY")"
ST_LISTEN="$(ssl_listen_line "$ST_CERT" "$ST_KEY")"
# Redirect HTTP→HTTPS only for vhosts that actually have working SSL
HTTP_ROOT_PROD="$HTTP_PROXY_PROD"
HTTP_ROOT_ST="$HTTP_PROXY_ST"
[[ "$MODE" != "dual" ]] && HTTP_ROOT_PROD="$HTTP_PROXY_SINGLE" && HTTP_ROOT_ST="$HTTP_PROXY_SINGLE"
[[ -n "$PROD_LISTEN" ]] && HTTP_ROOT_PROD="$HTTP_REDIRECT"
[[ -n "$ST_LISTEN" ]] && HTTP_ROOT_ST="$HTTP_REDIRECT"

if [[ -n "$PROD_LISTEN" || -n "$ST_LISTEN" ]]; then
  if [[ "$MODE" == "dual" ]]; then
    render_nginx "$PROD_LISTEN" "$PROD_CERT" "$PROD_KEY" \
      "$ST_LISTEN" "$ST_CERT" "$ST_KEY" \
      "$HTTP_ROOT_PROD" "$HTTP_ROOT_ST"
  else
    render_nginx "$PROD_LISTEN" "$PROD_CERT" "$PROD_KEY" \
      "$ST_LISTEN" "$ST_CERT" "$ST_KEY" \
      "$HTTP_ROOT_PROD" "$HTTP_ROOT_ST"
  fi
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
  else
    echo "ERROR: nginx -t failed after TLS — откатываю на HTTP-only"
    if [[ "$MODE" == "dual" ]]; then
      render_nginx "" "" "" "" "" "" "$HTTP_PROXY_PROD" "$HTTP_PROXY_ST"
    else
      render_nginx "" "" "" "" "" "" "$HTTP_PROXY_SINGLE" "$HTTP_PROXY_SINGLE"
    fi
    nginx -t && systemctl reload nginx
  fi
  # Smoke TLS: if handshake resets, fall back to HTTP for that vhost
  if [[ -n "$PROD_LISTEN" ]] && ! echo | openssl s_client -connect 127.0.0.1:443 -servername "$PROD_DOMAIN" >/dev/null 2>&1; then
    echo "WARN: TLS handshake fail for $PROD_DOMAIN — проверяю listen/certs"
  fi
fi

echo "==> [9] Cron бэкапа"
if [[ -x "$APP_DIR/scripts/full-backup.sh" ]]; then
  cat > /etc/cron.d/yp-full-backup <<CRON
15 3 * * * root $APP_DIR/scripts/full-backup.sh >> /var/log/sochi-backup.log 2>&1
CRON
  chmod 644 /etc/cron.d/yp-full-backup
fi

sleep 2
HEALTH_PROD="$(curl -sS --max-time 15 http://127.0.0.1:3000/api/health 2>/dev/null || true)"
HEALTH_STAGING="$(curl -sS --max-time 15 http://127.0.0.1:3001/api/health 2>/dev/null || true)"
CURL_PUB=(curl -sS --max-time 20)
[[ "$TLS_EFFECTIVE" == "selfsigned" ]] && CURL_PUB=(curl -skS --max-time 20)
HEALTH_PUB_PROD="$("${CURL_PUB[@]}" "${PUBLIC_URL}/api/health" 2>/dev/null || true)"
HEALTH_PUB_ST=""
[[ -n "$STAGING_URL" ]] && HEALTH_PUB_ST="$("${CURL_PUB[@]}" "${STAGING_URL}/api/health" 2>/dev/null || true)"
SW_VER="$(grep -o 'sochi-shell-v[0-9a-z-]*' "$APP_DIR/public/sw.js" 2>/dev/null | head -1 || true)"
APP_VER="$(grep -E '"version"' "$APP_DIR/package.json" 2>/dev/null | head -1 | tr -d ' ",' | cut -d: -f2 || true)"

mkdir -p "$APP_DIR/docs/ops" /etc/yp-portal
# helper для выпуска LE после правки DNS
for cand in "$KIT_ROOT/scripts/fix-tls-after-kit.sh" "$KIT_ROOT/fix-tls-after-kit.sh" "$SELF_DIR/fix-tls-after-kit.sh"; do
  if [[ -f "$cand" ]]; then
    cp -f "$cand" "$APP_DIR/scripts/fix-tls-after-kit.sh"
    chmod +x "$APP_DIR/scripts/fix-tls-after-kit.sh"
    break
  fi
done

python3 - <<PY
import json, pathlib
pathlib.Path("/etc/yp-portal/install-meta.json").write_text(json.dumps({
    "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "profile": "${INSTALL_PROFILE:-}",
    "mode": "${MODE}",
    "siteName": """${SITE_NAME}""",
    "prodDomain": "${PROD_DOMAIN}",
    "stagingDomain": "${STAGING_DOMAIN}",
    "prodUrl": "${PUBLIC_URL}",
    "stagingUrl": "${STAGING_URL}",
    "appDir": "${APP_DIR}",
    "stagingDir": "${STAGING_DIR}",
    "tlsMode": "${TLS_MODE}",
    "tlsEffective": "${TLS_EFFECTIVE}",
    "leFailedDomains": """${LE_FAILED_DOMAINS[*]:-}""".split(),
    "leEmail": "${LE_EMAIL}",
    "rateProfile": "${RATE_PROFILE}",
    "sw": "${SW_VER}",
    "appVersion": "${APP_VER}",
    "source": "youngportal-kit",
}, ensure_ascii=False, indent=2) + "\n")
PY
chmod 600 /etc/yp-portal/install-meta.json

# Клиент: harden (без docs, read-only src, LICENSE)
if [[ "$INSTALL_PROFILE" == "client" && $RECONFIGURE -eq 0 ]]; then
  HARDEN=""
  for cand in \
    "$KIT_ROOT/scripts/client-harden.sh" \
    "$APP_DIR/scripts/client-harden.sh" \
    "$SELF_DIR/client-harden.sh"
  do
    [[ -f "$cand" ]] && HARDEN="$cand" && break
  done
  if [[ -n "$HARDEN" ]]; then
    echo "==> [9b] client-harden"
    bash "$HARDEN" "$APP_DIR" "$KIT_ROOT" || echo "WARN: client-harden завершился с ошибкой"
    want_staging && bash "$HARDEN" "$STAGING_DIR" "$KIT_ROOT" 2>/dev/null || true
  fi
fi

if [[ "$SELF" != "$APP_DIR/scripts/install-dev-stack.sh" ]]; then
  mkdir -p "$APP_DIR/scripts" "$APP_DIR/deploy"
  cp -f "$SELF" "$APP_DIR/scripts/install-dev-stack.sh"
  chmod +x "$APP_DIR/scripts/install-dev-stack.sh"
  for t in nginx-dual-site.conf.tpl nginx-clone-site.conf.tpl nginx-yp-limits.conf fail2ban-yp-nginx.local; do
    src="$(find_template "$t" || true)"
    [[ -n "$src" ]] && cp -f "$src" "$APP_DIR/deploy/$t"
  done
  # не перезаписывать docs у клиента полной документацией
  if [[ "$INSTALL_PROFILE" != "client" ]]; then
    mkdir -p "$APP_DIR/docs/ops"
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
cat <<SUMMARY

══════════════════════════════════════════════════════════════
  Установка завершена
══════════════════════════════════════════════════════════════
  Профиль:    ${INSTALL_PROFILE:-—}
  Режим:      ${MODE}
  Вариант:    ${VARIANT}   reinstall=${REINSTALL}
  Название:   ${SITE_NAME}
  Версия:     ${APP_VER:-unknown}  SW: ${SW_VER:-unknown}
  IP:         ${IP:-unknown}
  TLS запрос: ${TLS_MODE}
  TLS факт:   ${TLS_EFFECTIVE}
SUMMARY
if [[ -f /etc/yp-portal/admin-credentials.txt ]]; then
  echo "  --- первый ADMIN ---"
  sed 's/^/  /' /etc/yp-portal/admin-credentials.txt
  echo "  --------------------"
  echo "  файл: /etc/yp-portal/admin-credentials.txt"
fi
if [[ -f /etc/yp-portal/seed-accounts.txt ]]; then
  echo "  --- учётки ролей ---"
  sed 's/^/  /' /etc/yp-portal/seed-accounts.txt
  echo "  --------------------"
fi
want_prod && cat <<P
  ПРОД:       ${PUBLIC_URL}
              каталог ${APP_DIR}  upstream :3000
              health :3000  ${HEALTH_PROD:-'(нет ответа)'}
              health pub    ${HEALTH_PUB_PROD:-'(проверьте DNS / TLS)'}
              DNS: A ${PROD_DOMAIN} → ${IP:-this-server}  (только этот IP!)
P
want_staging && cat <<S
  ТЕСТ:       ${STAGING_URL}
              каталог ${STAGING_DIR}  upstream :3001
              health :3001  ${HEALTH_STAGING:-'(нет ответа)'}
              health pub    ${HEALTH_PUB_ST:-'(проверьте DNS / TLS)'}
              DNS: A ${STAGING_DOMAIN} → ${IP:-this-server}  (только этот IP!)
S
if [[ "$TLS_EFFECTIVE" == "selfsigned" || ${#LE_FAILED_DOMAINS[@]} -gt 0 ]]; then
cat <<TLSFIX

  ⚠ HTTPS сейчас ВРЕМЕННЫЙ (self-signed), не Let's Encrypt.
  Домены без LE: ${LE_FAILED_DOMAINS[*]:—(см. выше)}

  1) В DNS оставьте ОДНУ A-запись на ${IP:-этот-сервер}
  2) Выпустите сертификаты:
       PROD_DOMAIN=${PROD_DOMAIN:-} STAGING_DOMAIN=${STAGING_DOMAIN:-} \\
       LE_EMAIL=${LE_EMAIL:-ops@${PROD_DOMAIN:-example.ru}} \\
       bash ${APP_DIR}/scripts/fix-tls-after-kit.sh

  Проверка с -k (пока self-signed):
    curl -skS ${PUBLIC_URL}/api/health
TLSFIX
fi
if [[ "$INSTALL_PROFILE" == "client" ]]; then
cat <<FOOT

  Клиенту передайте:
    URL:   ${PUBLIC_URL}
    Логин: ${ADMIN_EMAIL:-см. admin-credentials.txt}
    Пароль: /etc/yp-portal/admin-credentials.txt

  Проверки:
    curl -skS ${PUBLIC_URL}/api/health
    docker ps
══════════════════════════════════════════════════════════════
FOOT
else
cat <<FOOT

  Дальше как разработчик:
    bash scripts/workflow-deploy-staging.sh
    APPROVE=YES bash scripts/workflow-promote-to-young.sh

  Переустановка:
    sudo bash ${APP_DIR}/scripts/install-dev-stack.sh --reinstall --demo --yes \\
      --prod-domain ${PROD_DOMAIN:-} --staging-domain ${STAGING_DOMAIN:-}

  Проверки:
    curl -skS ${PUBLIC_URL}/api/health
    docker ps
══════════════════════════════════════════════════════════════
FOOT
fi
