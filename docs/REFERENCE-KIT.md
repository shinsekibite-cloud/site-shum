# Эталонный образ установки YoungPortal

Официальный архив для развёртывания на **новом сервере**.

## Скачать

**Полный эталон** (~1005 МБ) — код, скрипты, БД, uploads, Docker-образы:

https://young.idivles.ru/backups/a4afdeee8a0a3a9e6cf44536d7d291dc/youngportal-reference-kit-20260815-070830.tgz

`sha256: a89e63244f1dd22c3977effa9f8cdbd270c5df1bea14fbcead3bc21b8d3aab6e`

**Только код** (39 МБ, без персональных данных):

https://young.idivles.ru/backups/676277588af220c469547ff8932cb1be/youngportal-reference-kit-20260815-070800-source.tgz

На VPS: `/var/backups/sochi-portal/youngportal-reference-kit-latest.tgz`

## Установка

```bash
tar -xzf youngportal-reference-kit-*.tgz
cd youngportal-reference-kit-*
sudo bash START.sh
```

| Профиль | Флаг | Что делает |
|---------|------|------------|
| Клиент (slim) | `--client` | Чистая БД + ADMIN, без docs |
| Разработчик | `--developer --demo` | Роли ADMIN/MOD/USER/… |
| Разработчик | `--developer --full` | Полный клон данных |
| Переустановка | `--reinstall` + любой выше | Wipe + install |

Собрать клиентский архив без документации:

```bash
bash scripts/pack-dev-deploy-kit.sh --client --with-live
```

Защита кода (лицензия + INTEGRITY + harden): [CODE-PROTECTION.txt](./CODE-PROTECTION.txt).

### Клиенту по SSH

```bash
SSHPASS='…' bash scripts/install-from-url.sh root@IP --client \
  --prod-domain portal.example.ru \
  --staging-domain test.example.ru \
  --le-email ops@example.ru \
  --admin-email admin@portal.example.ru \
  --admin-password 'StrongPass1!'
```

Учётка: `/etc/yp-portal/admin-credentials.txt` на сервере.

### Разработчику

```bash
SSHPASS='…' bash scripts/install-from-url.sh root@IP --developer --demo \
  --prod-domain a.example.ru --staging-domain b.example.ru --le-email ops@a.example.ru
```

Подробности: `REFERENCE.txt` внутри архива, также [REFERENCE-KIT.txt](./REFERENCE-KIT.txt).

Собрать заново:

```bash
bash scripts/pack-dev-deploy-kit.sh --reference              # код
bash scripts/pack-dev-deploy-kit.sh --reference --with-live  # + снимок VPS
```
