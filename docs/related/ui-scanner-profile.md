# UI fix: scanner camera, profile stats, compact events

## Scanner camera (2026-08-17)
**Cause:** nginx `Permissions-Policy` had `camera=()` — браузер блокировал доступ к камере без диалога.  
**Fix:** `camera=(self)` in:
- live `/etc/nginx/sites-enabled/sochi-portal` (py + ty)
- `deploy/nginx-dual-site.conf.tpl`, `deploy/nginx-clone-site.conf.tpl`
- `next.config.ts` (align with nginx)

Also `TicketScanner`:
- camera starts only on «Включить камеры» gesture (`idle → requesting → active|denied|error`)
- manual `TICKET-…` + paste from clipboard
- result overlay: status headline, `ALREADY_CHECKED` time, guest avatar
- offline queue preserved

## Tickets / avatar
- QR quiet zone `margin: 3`, print button + `@media print` for A4
- Avatar file inputs: `capture="environment"` (mobile camera)

## Deploy note
After nginx template change: update `/etc/nginx/sites-enabled/sochi-portal` and `nginx -t && systemctl reload nginx`.  
Do not leave `camera=()` globally.
