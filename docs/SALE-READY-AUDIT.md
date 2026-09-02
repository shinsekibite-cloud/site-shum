# YoungPortal — Sale / Transfer Ready Audit Report

**Date:** 2026-08-17  
**Stack note:** Backend is **Next.js + Prisma**, not Django (wording in the brief adjusted).  
**Reference domains:** py.idivles.ru (prod), ty.idivles.ru (staging).  
**Branch:** `cursor/sale-ready-audit-16b2`

---

## 1. Executive Summary

Проект приведён к состоянию **передачи / продажи**:

- Задокументированы архитектура, модули, развёртывание, защита кода.
- Добавлен **выбор модулей при установке** (`--modules` / `--modules-off`) и **стартовый демо-контент** организации.
- Исправлен QA модулей; актуализированы домены в ключевых docs/scripts.
- Подготовлены **три архива** (portable source, sale source kit, org kit with content) + публичные URL.
- Staging (**ty**) проверен smoke + module QA; **prod (py) не промотился** без «одобряю».

Остаточный риск: Sochi-specific live content в org-kit (ПДн) — только по договору/токену; часть исторических QA-доков всё ещё с y1/young.

---

## 2. Cleanup report

| Action | Status |
|--------|--------|
| Dead TODO/FIXME in src | Нет критичных TODO/FIXME (ложные срабатывания на XXXXX в temp paths) |
| Hardcoded secrets in git | Нет `.env`; риск — **документированные демо-пароли** (`InstallSeed1!`, QA docs) — помечены как сменяемые |
| Domain drift (young/y1) | Исправлены ключевые: AGENTS, ORG-HANDOFF, REMOTE-DEPLOY, qa-modules default, install-remote kit URL; полный grep-clean — backlog |
| `.env.example` | **Добавлен** |
| Module QA drift (`programs`) | **Исправлен** → grants/dobro/self_gov + расширенный список |
| Dedupe applications (live) | Ранее 0 дублей; перед org-kit pack — повторный dedupe |
| Temp/logs/caches in kits | Pack excludes `.env`, `node_modules`, uploads secrets |

---

## 3. Frontend audit

| Area | Finding | Severity | Action |
|------|---------|----------|--------|
| Module-aware nav | Navbar/Footer/BottomNav filter by flags | OK | — |
| API failure UX | Most fetches toast/empty; some pages soft-fail | Low | Monitor |
| XSS | DOMPurify on rich text; CSP nonce on ty | OK | Keep CSP |
| Memory leaks | No systemic listeners without cleanup found in pass | Low | — |
| Disabled modules UX | `/unavailable` + hide/soon modes | OK | Practical test below |
| Conflicting frame headers | nginx `X-Frame-Options: DENY` + app `SAMEORIGIN` | Low | Prefer single source (nginx) — backlog |

---

## 4. Backend audit (Next.js / Prisma)

| Area | Finding | Severity | Action |
|------|---------|----------|--------|
| Access control | Role checks + proxy; TECH bypass modules | OK | — |
| IDOR | Staff APIs role-gated; public by id — spot-check OK | Med residual | Continue threat model |
| Mass assignment | Zod on many routes; Prisma select patterns | OK-ish | — |
| SQL injection | Prisma parameterized | OK | — |
| CSRF | NextAuth cookie + same-site; mutations session-bound | OK | — |
| Rate limiting | Redis limiters (incl. MAX webhook) | OK | — |
| N+1 | Some admin lists; Redis caches for flags | Low | — |
| Module API 503 | `rejectIfModuleDisabled` + proxy | OK | — |
| Logging | LoginEvent OPS_FLAGS; avoid secrets in logs | OK | — |

---

## 5. Modules system report (+ toggle tests)

**Implementation:** `moduleFlagsJson`, Ops/Admin UI, proxy + page/API guards.  
**Install-time:** `scripts/apply-module-selection.mjs` wired into `INSTALL.sh` / remote / START.

### Practical test (ty.idivles.ru)

1. Baseline: all modules ON → `npm run qa:modules` / `node scripts/qa-modules-toggle.mjs https://ty.idivles.ru`
2. Toggle OFF `games` via apply script in staging container → `/games` → `/unavailable`, API 503
3. Restore `MODULES=all`
4. Core pages `/`, `/contacts`, `/api/health` always reachable

*(Results stamped in `docs/perf/qa-modules-toggle-*.json` after run in this session.)*

### Gaps (accepted / backlog)

- Staff admin catalogs often stay reachable when public module off (by design).
- Dual registration/messaging toggles reverse-sync incomplete.
- Edge/server `PATH_MODULE_RULES` duplication.

---

## 6. Additional audits

| Audit | Result |
|-------|--------|
| Dependency vulns | `npm audit` — run in CI/image build; local agent had no node_modules at audit time → **re-run in Docker build** |
| Secrets scanning | No private keys in tree; public MinTsifry CA OK |
| Security headers (ty) | HSTS, CSP (nonce), nosniff, referrer-policy present |
| Code quality | ESLint config present; Next 16 docs differ from classic Next |
| Infra/DevOps | Dual compose, workflow scripts, smoke, harden — mature |
| Product readiness | Docs + kits + module select + org starter — **ready with residual Sochi branding in live DB kit** |

---

## 7. Code change protection

Delivered:

- `CODEOWNERS`
- `docs/CODE-CHANGE-PROCESS.md` (branch protection checklist for GitHub owner)
- Existing `LICENSE` + `CODE-PROTECTION.txt` + client-harden + INTEGRITY in kits

Owner must **enable** GitHub branch protection UI (cannot be forced from agent alone).

---

## 8–9. Documentation

| Audience | Document |
|----------|----------|
| Developer | `docs/DEV-HANDBOOK.md` (+ ARCHITECTURE, CODEBASE-MAP, WORKFLOW) |
| Organization | `docs/ORG-ADMIN-GUIDE.md` (+ ORG-HANDOFF) |
| Remote deploy | `docs/REMOTE-DEPLOY.md` |

---

## 10. Remote deploy + module choice

See `docs/REMOTE-DEPLOY.md`. Flags: `--modules=`, `--modules-off=`, `--seed-org` / `--no-seed-org`.

---

## 11. Generated admin / starter data

| Artifact | Content |
|----------|---------|
| `seed-bootstrap-admin.mjs` | First ADMIN (credentials → `/etc/yp-portal/admin-credentials.txt`) |
| `seed-install-roles.mjs` | Role accounts on `--demo` |
| `seed-org-starter.mjs` | Generic demo projects/clubs/space/news/place/booking; **skips off modules** |
| `apply-module-selection.mjs` | Persists flags + legacy columns |

Demo titles prefixed «Демо-…» / `isDemoData: true` — safe to delete in admin.

---

## 12. Prioritized remaining work

| P | Item |
|---|------|
| P0 | Enable GitHub branch protection + rotate any shared demo passwords on live |
| P1 | Full domain rename pass (young/y1 → py/ty) in leftover docs/scripts |
| P1 | Unify X-Frame-Options (nginx vs Next) |
| P2 | Formal module dependency graph in Ops UI |
| P2 | npm audit gate in CI |
| P3 | White-label pack (strip Sochi CRM seeds from sale kit by default) |

---

## 13. Three archives

| # | Purpose | Artifact | URL |
|---|---------|----------|-----|
| 1 | Portable development | `youngportal-portable-dev-20260817-165533.tgz` | https://py.idivles.ru/backups/7c4c40956079940759d66f0fa16ec76f/youngportal-portable-dev-20260817-165533.tgz |
| 2 | Sale source | `youngportal-sale-source-20260817-165533.tgz` | https://py.idivles.ru/backups/ee04eda05dd68fd4a4d81194ff441464/youngportal-sale-source-20260817-165533.tgz |
| 3 | Org with cleaned content | `youngportal-org-kit-20260817-165559.tgz` | https://py.idivles.ru/backups/66a69bef75be334d95c7d0d6b0f046f9/youngportal-org-kit-20260817-165559.tgz |

SHA-256 and install notes: [`docs/ARTIFACTS-SALE-2026-08-17.md`](./ARTIFACTS-SALE-2026-08-17.md).

Module toggle practical test: OFF `games` → `/unavailable`; restore ALL PASS (`docs/perf/qa-modules-toggle-2026-08-17T16-55-08-399Z.json`).
