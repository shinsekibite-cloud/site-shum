#!/usr/bin/env bash
# Ручной выкат теста (y1) → прод (young).
# Шаги 4–5 из docs/WORKFLOW.md: live-бэкап + promote.
#
# Использование на машине с SSH к VPS (или прямо на VPS после sync кода):
#
#   bash scripts/manual-promote-to-young.sh
#   # скрипт спросит подтверждение; либо:
#   CONFIRM=PROMOTE_YOUNG APPROVE=YES bash scripts/manual-promote-to-young.sh
#
# После успеха пишет отметку в:
#   - docs/ops/promote-history.md  (в git / на сервере)
#   - docs/ops/LAST-PROMOTE.json
#   - /var/backups/sochi-portal/PROMOTE-LOG.txt (на VPS)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STAMP_LOCAL="$(date +%Y-%m-%d_%H%M%S 2>/dev/null || echo "$STAMP")"
OPERATOR="${SUDO_USER:-${USER:-unknown}}"
NOTE="${PROMOTE_NOTE:-manual promote}"
PROD_DOMAIN="${PROD_DOMAIN:-py.idivles.ru}"
STAGING_DOMAIN="${STAGING_DOMAIN:-ty.idivles.ru}"

mkdir -p docs/ops

cat <<EOF
════════════════════════════════════════════════════════
 Ручной promote: ${STAGING_DOMAIN}  →  ${PROD_DOMAIN}
 Оператор: ${OPERATOR}
 Время UTC: ${STAMP}
════════════════════════════════════════════════════════

Перед запуском вы должны проверить https://${STAGING_DOMAIN}
и явно одобрить выкат на прод.
EOF

NEED_PROMPT=1
if [[ "${CONFIRM:-}" == "PROMOTE_YOUNG" && "${APPROVE:-}" == "YES" ]]; then
  NEED_PROMPT=0
fi

if [[ "$NEED_PROMPT" -eq 1 ]]; then
  echo
  read -r -p "Введите PROMOTE_YOUNG для продолжения (или Ctrl+C): " answer
  if [[ "$answer" != "PROMOTE_YOUNG" ]]; then
    echo "Отменено." >&2
    exit 2
  fi
  export APPROVE=YES
fi

if [[ "${APPROVE:-}" != "YES" ]]; then
  echo "REFUSED: нужен APPROVE=YES" >&2
  exit 2
fi

echo "==> запуск workflow-promote-to-young.sh"
set +e
APPROVE=YES bash "$ROOT_DIR/scripts/workflow-promote-to-young.sh"
rc=$?
set -e

STATUS="failed"
if [[ "$rc" -eq 0 ]]; then
  STATUS="ok"
fi

# Smoke (best-effort) — same checks as scripts/smoke-sites.sh
YOUNG_HEALTH=""
Y1_HEALTH=""
YOUNG_HEALTH="$(curl -sS --http1.1 --max-time 20 "https://${PROD_DOMAIN}/api/health" 2>/dev/null || true)"
Y1_HEALTH="$(curl -sS --http1.1 --max-time 20 "https://${STAGING_DOMAIN}/api/health" 2>/dev/null || true)"
bash "$ROOT_DIR/scripts/smoke-sites.sh" || echo "WARN: smoke-sites failed (recorded anyway)"

RECORD_JSON=$(cat <<JSON
{
  "at": "$STAMP",
  "localStamp": "$STAMP_LOCAL",
  "operator": "$OPERATOR",
  "note": $(python3 -c 'import json,os; print(json.dumps(os.environ.get("PROMOTE_NOTE","manual promote")))' 2>/dev/null || echo "\"$NOTE\""),
  "status": "$STATUS",
  "exitCode": $rc,
  "prodDomain": "$PROD_DOMAIN",
  "stagingDomain": "$STAGING_DOMAIN",
  "youngHealth": $(python3 -c 'import json,os; print(json.dumps(os.environ.get("YH","")))' YH="$YOUNG_HEALTH" 2>/dev/null || echo "\"\""),
  "y1Health": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$Y1_HEALTH" 2>/dev/null || echo "\"\"")
}
JSON
)

# Prefer writing health via python for safe JSON
python3 - <<PY
import json, os
rec = {
  "at": "$STAMP",
  "localStamp": "$STAMP_LOCAL",
  "operator": "$OPERATOR",
  "note": os.environ.get("PROMOTE_NOTE", "manual promote"),
  "status": "$STATUS",
  "exitCode": $rc,
  "prodDomain": "$PROD_DOMAIN",
  "stagingDomain": "$STAGING_DOMAIN",
  "youngHealthRaw": """${YOUNG_HEALTH}""",
  "y1HealthRaw": """${Y1_HEALTH}""",
}
open("docs/ops/LAST-PROMOTE.json", "w", encoding="utf-8").write(json.dumps(rec, ensure_ascii=False, indent=2) + "\n")
print("Wrote docs/ops/LAST-PROMOTE.json")
PY

HISTORY="docs/ops/promote-history.md"
if [[ ! -f "$HISTORY" ]]; then
  cat > "$HISTORY" <<'HDR'
# История ручных promote (y1 → young)

Каждый успешный/неуспешный ручной запуск `scripts/manual-promote-to-young.sh` добавляет строку ниже.
Автоматические агенты **не** вызывают promote без вашей фразы «одобряю» / `CONFIRM=PROMOTE_YOUNG`.

| UTC | Оператор | Статус | Примечание |
|-----|----------|--------|------------|
HDR
fi

# Escape pipes in note
SAFE_NOTE="$(printf '%s' "$NOTE" | tr '|' '/')"
echo "| ${STAMP} | ${OPERATOR} | ${STATUS} (exit ${rc}) | ${SAFE_NOTE} |" >> "$HISTORY"

# Remote VPS log if we can reach it (promote script already SSHed; local mark is enough)
if [[ -d /var/backups/sochi-portal ]]; then
  {
    echo "[$STAMP] operator=$OPERATOR status=$STATUS exit=$rc note=$NOTE"
    echo "  young: $YOUNG_HEALTH"
    echo "  y1: $Y1_HEALTH"
  } >> /var/backups/sochi-portal/PROMOTE-LOG.txt
fi

if [[ "$rc" -ne 0 ]]; then
  echo "PROMOTE_FAILED exit=$rc — см. docs/ops/LAST-PROMOTE.json" >&2
  exit "$rc"
fi

echo "PROMOTE_RECORDED → docs/ops/promote-history.md + docs/ops/LAST-PROMOTE.json"
echo "Прод: https://${PROD_DOMAIN}"
echo "Тест: https://${STAGING_DOMAIN}"
