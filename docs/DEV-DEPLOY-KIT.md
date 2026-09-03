# Developer-kit: тест + прод в один клик

Один архив, два варианта установки:

| Вариант | Что получаете |
|---------|----------------|
| **Чистый** (`--clean`) | Тест + прод, пустая БД |
| **Роли** (`--demo`) | Пустая БД + учётки ADMIN/MOD/USER/… |
| **Полный** (`--full`) | Текущие данные (БД, uploads, образы) |
| **Переустановка** (`--reinstall`) | Снос стека/БД + любой вариант выше |

## Самый короткий путь

На целевом сервере:

```bash
tar -xzf youngportal-*-kit-*.tgz
cd youngportal-*-kit-*
sudo bash START.sh
```

С машины, где лежит архив, **на другой** VPS (сам скопирует, поставит curl):

```bash
cd youngportal-*-kit-*
bash install-remote.sh root@IP --full \
  --prod-domain portal.example.ru \
  --staging-domain test.example.ru \
  --le-email ops@example.ru
```

## Собрать архив

```bash
bash scripts/pack-dev-deploy-kit.sh              # исходники (чистый)
bash scripts/pack-dev-deploy-kit.sh --with-live  # + живые данные
```

Секреты (`.env`, TLS-ключи) **не** пакуются. Полный архив содержит
персональные данные — не публикуйте ссылку без токена.

Старый однодоменный клон: [FULL-CLONE-KIT.md](./FULL-CLONE-KIT.md).
Цикл y1→young: [WORKFLOW.md](./WORKFLOW.md).

## Файлы

| Файл | Назначение |
|------|------------|
| `scripts/start-kit.sh` → `START.sh` | Меню один клик |
| `scripts/install-remote.sh` | Установка на другой сервер по SSH |
| `scripts/install-dev-stack.sh` → `INSTALL.sh` | Установщик `--clean` / `--full` |
| `scripts/pack-dev-deploy-kit.sh` | Собрать архив |
| `deploy/nginx-dual-site.conf.tpl` | Nginx двух доменов |
| `docs/README-INSTALL-DEV-KIT.txt` | Инструкция внутри архива |
