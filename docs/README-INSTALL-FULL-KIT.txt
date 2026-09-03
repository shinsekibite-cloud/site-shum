YoungPortal — полный установочный комплект (клон https://young.idivles.ru)
=======================================================================

Это снимок ПРОДА «как есть»: код, Docker-образ web (SW v21), Postgres,
загрузки пользователей, nginx/fail2ban-шаблоны и скрипт быстрой установки.

НЕ входит (намеренно): файл .env, токены, пароли, приватные ключи TLS.
Установщик создаёт новые секреты. Данные сайта (пользователи, контент,
аватары) — в db.dump + uploads.tgz.

Архив содержит персональные данные. Не выкладывайте его в открытый доступ.


Быстрый старт (новый Debian 12+ / Ubuntu 22.04+, root)
------------------------------------------------------

  1) Загрузите архив на сервер и распакуйте:

       tar -xzf youngportal-full-kit-*.tgz
       cd youngportal-full-kit-*
       sudo bash INSTALL.sh

  2) Скрипт спросит:

       • Название портала     (шапка, письма, 2FA)
       • Домен                (без https://)
       • Каталог установки    (по умолчанию /opt/sochi-portal)
       • Сертификаты:
           1 Let's Encrypt (нужна A-запись домена на этот IP)
           2 Свои файлы fullchain.pem + privkey.pem
           3 Самоподписанный (для теста)
           4 Без TLS, только HTTP
       • Защита:
           UFW, fail2ban, порт SSH, запрет пароля SSH,
           nginx rate-limit (как на young / жёстче / выкл),
           HSTS, автообновления ОС
       • Восстановить БД и загрузки young (да = полный клон)
       • Свой администратор (необязательно)

  3) DNS: A-запись домена → IP сервера. Потом:

       curl -sS https://ВАШ-ДОМЕН/api/health


Неинтерактивно
--------------

  SITE_NAME="Мой портал" DOMAIN=portal.example.ru \
  TLS_MODE=letsencrypt LE_EMAIL=ops@example.ru \
  ADMIN_EMAIL=admin@example.ru ADMIN_PASSWORD='StrongPass1!' \
  bash INSTALL.sh --yes

  TLS_MODE:       letsencrypt | custom | selfsigned | skip
  RATE_PROFILE:   young | strict | off
  --skip-data     пустая БД (без клона young)
  --lock-ssh --ssh-key "ssh-ed25519 AAAA…"


Перенастройка уже установленного портала
----------------------------------------

  sudo bash /opt/sochi-portal/scripts/install-full-clone.sh --reconfigure


Состав каталога
---------------

  INSTALL.sh          этот установщик
  README-INSTALL.txt  эта инструкция
  snapshot/           db.dump, uploads.tgz, images.tar.gz, host-app.tgz
  templates/          nginx + fail2ban
  deploy/             копии шаблонов


Откат / бэкап на новом сервере
------------------------------

  После установки: /etc/cron.d/yp-full-backup (ежедневно 03:15)
  Снимки:          /var/backups/sochi-portal/
