# Процесс изменений и защита кода (после передачи)

## Для текущего репозитория (GitHub)

1. **Branch protection** на `main` (настроить владельцу в GitHub → Settings → Branches):
   - Require pull request before merging
   - Require status checks (CI / smoke) when available
   - Restrict who can push
   - Optionally: require signed commits
2. **CODEOWNERS** — см. корневой файл `CODEOWNERS` (review path owners).
3. **Не коммитить** `.env`, uploads, private PEM, дампы с ПДн без договора.

## На сервере организации (client install)

- `scripts/client-harden.sh` — снимает docs/QA, `chmod a-w` на исходники, пишет `/etc/yp-portal/client-install.json`
- Kit содержит `VERSION.json` + `INTEGRITY.json` (sha256 `source/app.tgz`)
- Предпочтительнее prebuilt Docker image, чем правка `src/` на проде
- Юридически: корневой `LICENSE` (proprietary) — см. `docs/CODE-PROTECTION.txt`

## Контроль целостности (проверка)

```bash
# на сервере после client-harden
python3 - <<'PY'
import json,hashlib,pathlib
meta=json.loads(pathlib.Path('/opt/sochi-portal/INTEGRITY.json').read_text())
# путь к app.tgz зависит от комплекта — сверяйте с README kit
print(meta)
PY
```

Это **не DRM**: root может обойти. Защита = процесс + договор + INTEGRITY + harden.

## Рекомендуемый процесс правок у нового владельца

1. Fork / private repo покупателя  
2. Feature branch → PR → review  
3. Staging deploy → smoke → approve → prod  
4. Не править код напрямую в `/opt/sochi-portal/src` на проде  

Документы: `docs/WORKFLOW.md`, `docs/DEV-HANDBOOK.md`.
