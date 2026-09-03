# Artifacts — 2026-08-17 (scanner camera Permissions-Policy)

Ветка: `cursor/scanner-camera-policy-16b2` @ `45adefd`  
Staging: https://ty.idivles.ru · Prod nginx уже `camera=(self)` (полный UI сканера — после promote)

## Kits

| Kit | URL | SHA-256 |
|-----|-----|---------|
| Org | https://py.idivles.ru/backups/8694c332fe0530d051329de0ca2322ce/youngportal-org-kit-20260817-222141.tgz | `f28a741ba3814f4f81e41b520b958af38e848eabc4a9f95d9e2017cf5153a366` |
| Sale | https://py.idivles.ru/backups/879d87b363d76416fd5c295abe26e152/youngportal-sale-source-20260817-222141.tgz | `8e16efcfcd0c257a5e20f9776c9de4b9d439cccd32e8782487f26a7315da47e7` |
| Portable | https://py.idivles.ru/backups/947feea2b4f93b2d1c244e26ea41160c/youngportal-portable-dev-20260817-222141.tgz | `2f3a13353536ee1fcd1a7a34cdf5b6253218f58da3331661b6252f96695b747a` |
| Full VPS | https://py.idivles.ru/backups/6659b3baad77783dccd948c0f98e8456/full-2026-08-17_222141.tar.gz | (см. `.sha256` рядом на VPS) |

```bash
KIT_PROFILE=org bash scripts/download-kit.sh
curl -sI https://ty.idivles.ru/ | grep -i permissions-policy
# → camera=(self)
```
