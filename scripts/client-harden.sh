#!/usr/bin/env bash
# Ужесточение клиентской установки: убрать docs/tests, проверить целостность,
# сделать исходники только для чтения (root всё ещё может chmod +w).
#
# Вызывается из install-dev-stack.sh при --client.
#   bash scripts/client-harden.sh /opt/sochi-portal [/path/to/kit]
set -euo pipefail

APP_DIR="${1:-/opt/sochi-portal}"
KIT_ROOT="${2:-}"

die() { echo "ERROR: $*" >&2; exit 1; }
[[ -d "$APP_DIR" ]] || die "Нет каталога $APP_DIR"

echo "==> client-harden: $APP_DIR"

# Лицензия
if [[ -f "$KIT_ROOT/LICENSE" ]]; then
  cp -f "$KIT_ROOT/LICENSE" "$APP_DIR/LICENSE"
elif [[ -f "$(dirname "$0")/../LICENSE" ]]; then
  cp -f "$(dirname "$0")/../LICENSE" "$APP_DIR/LICENSE" 2>/dev/null || true
fi

# Проверка sha256 source/app.tgz (если kit рядом)
if [[ -n "$KIT_ROOT" && -f "$KIT_ROOT/INTEGRITY.json" && -f "$KIT_ROOT/source/app.tgz" ]]; then
  expect="$(python3 -c "import json; print(json.load(open('$KIT_ROOT/INTEGRITY.json')).get('appTgz',''))" 2>/dev/null || true)"
  if [[ -n "$expect" ]]; then
    got="$(sha256sum "$KIT_ROOT/source/app.tgz" | awk '{print $1}')"
    if [[ "$got" != "$expect" ]]; then
      die "INTEGRITY: source/app.tgz повреждён (ожидали $expect, получили $got)"
    fi
    echo "  INTEGRITY app.tgz OK"
    if mkdir -p /etc/yp-portal 2>/dev/null; then
      cp -f "$KIT_ROOT/INTEGRITY.json" /etc/yp-portal/INTEGRITY.json
      chmod 644 /etc/yp-portal/INTEGRITY.json
    fi
  fi
fi

# Снести документацию и QA с диска клиента
rm -rf \
  "$APP_DIR/docs" \
  "$APP_DIR/tests" \
  "$APP_DIR/qa-screenshots" \
  "$APP_DIR/.cursor" \
  "$APP_DIR/.git" 2>/dev/null || true
find "$APP_DIR" -maxdepth 2 -type f \( -name '*.md' -o -name 'README*' -o -name 'CHANGELOG*' \) \
  ! -name 'LICENSE' -delete 2>/dev/null || true
# убрать скрипты разработчика, если попали
rm -f \
  "$APP_DIR/scripts"/qa-*.mjs \
  "$APP_DIR/scripts"/workflow-*.sh \
  "$APP_DIR/scripts"/pack-*.sh \
  "$APP_DIR/scripts"/manual-promote-to-young.sh \
  "$APP_DIR/scripts"/snapshot-live-site.sh \
  "$APP_DIR/scripts"/restore-live-snapshot.sh \
  "$APP_DIR/scripts"/publish-public-backup.sh 2>/dev/null || true

# Краткая карточка вместо docs
mkdir -p "$APP_DIR/docs"
cat > "$APP_DIR/docs/CLIENT.txt" <<'EOF'
YoungPortal — клиентский экземпляр.
Исходный код защищён лицензией LICENSE.
Изменение файлов приложения без согласия правообладателя запрещено.
Поддержка и обновления — через правообладателя.
Админ: /etc/yp-portal/admin-credentials.txt
EOF

# Только чтение для исходников (root может снять атрибут)
for d in src prisma public scripts deploy; do
  if [[ -d "$APP_DIR/$d" ]]; then
    find "$APP_DIR/$d" -type d -exec chmod u+rwx,go+rx {} \; 2>/dev/null || true
    find "$APP_DIR/$d" -type f -name '*.sh' -exec chmod a-w,u+rx {} \; 2>/dev/null || true
    find "$APP_DIR/$d" -type f ! -name '*.sh' -exec chmod a-w,u+r {} \; 2>/dev/null || true
  fi
done

# Маркер
if mkdir -p /etc/yp-portal 2>/dev/null; then
  cat > /etc/yp-portal/client-install.json <<EOF
{
  "profile": "client",
  "hardenedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "appDir": "$APP_DIR",
  "docsStripped": true,
  "sourceWritable": false,
  "license": "$APP_DIR/LICENSE"
}
EOF
  chmod 644 /etc/yp-portal/client-install.json
fi

echo "  docs/tests сняты; src/prisma/public → read-only; LICENSE на месте"
echo "client-harden OK"
