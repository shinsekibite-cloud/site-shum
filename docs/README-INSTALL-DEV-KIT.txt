YoungPortal — установка в ОДИН КЛИК
====================================

Профили:

  --client       КЛИЕНТУ: чистая БД + первый ADMIN
  --developer    РАЗРАБОТЧИКУ: --demo (роли) или --full (клон)

Секреты сервера (.env, TLS-ключи) НЕ входят — создаются заново.
Полный клон содержит персональные данные — ссылку не публикуйте.


Первый ADMIN (--client)
-----------------------

  --admin-email admin@ДОМЕН
  --admin-password 'StrongPass1!'   # необязательно: сгенерируется

  Файл на сервере: /etc/yp-portal/admin-credentials.txt


Учётки при --developer --demo
-----------------------------

  Пароль по умолчанию: InstallSeed1!
  (сменить: --seed-password 'ВашПароль1')

  admin@ДОМЕН-ПРОДА      ADMIN
  mod@ДОМЕН-ПРОДА        MODERATOR
  part@ДОМЕН-ПРОДА       PARTICIPANT
  user@ДОМЕН-ПРОДА       USER
  scanner@ДОМЕН-ПРОДА    SCANNER
  private@ДОМЕН-ПРОДА    USER (закрытый профиль)
  tech@ДОМЕН-ПРОДА       TECH (через .env TECH_BOOTSTRAP_PASSWORD)

  Файл на сервере: /etc/yp-portal/seed-accounts.txt


══════════════════════════════════════
  НА ЭТОМ СЕРВЕРЕ
══════════════════════════════════════

  tar -xzf youngportal-*-kit-*.tgz
  cd youngportal-*-kit-*
  sudo bash START.sh

Без вопросов:

  # клиент: чистый + первый админ
  sudo bash START.sh --client --yes \
    --prod-domain portal.example.ru \
    --staging-domain test.example.ru \
    --le-email ops@example.ru \
    --admin-email admin@portal.example.ru \
    --admin-password 'StrongPass1!'

  # разработчик: роли
  sudo bash START.sh --developer --demo --yes \
    --prod-domain portal.example.ru \
    --staging-domain test.example.ru \
    --le-email ops@example.ru

  # разработчик: полный клон
  sudo bash START.sh --developer --full --yes \
    --prod-domain portal.example.ru \
    --staging-domain test.example.ru

  # полная переустановка + клиент
  sudo bash START.sh --reinstall --client --yes \
    --prod-domain portal.example.ru \
    --staging-domain test.example.ru \
    --admin-email admin@portal.example.ru


══════════════════════════════════════
  КЛИЕНТУ ПО SSH / РАЗРАБОТЧИКУ ПО SSH
══════════════════════════════════════

Пароль root — один раз (или SSHPASS). Скрипты подкладываются свежие.

  # клиент
  SSHPASS='пароль' bash /opt/sochi-portal/scripts/install-from-url.sh \
    root@77.110.125.241 --client \
    --prod-domain portal.example.ru \
    --staging-domain test.example.ru \
    --le-email ops@example.ru \
    --admin-email admin@portal.example.ru \
    --admin-password 'StrongPass1!'

  # разработчик: роли (типичный новый стенд)
  SSHPASS='пароль' bash /opt/sochi-portal/scripts/install-from-url.sh \
    root@77.110.125.241 -p 4488 --reinstall --developer --demo \
    --prod-domain young.idivles.ru \
    --staging-domain tyoung.idivles.ru \
    --le-email ops@idivles.ru \
    --seed-password 'InstallSeed1!'

  # разработчик: полный клон данных
  SSHPASS='пароль' bash /opt/sochi-portal/scripts/install-from-url.sh \
    root@77.110.125.241 -p 4488 --reinstall --developer --full \
    --prod-domain young.idivles.ru \
    --staging-domain tyoung.idivles.ru \
    --le-email ops@idivles.ru


Проверка скриптов
-----------------

  bash scripts/verify-kit-scripts.sh


DNS: две A-записи (прод и тест) → IP сервера, куда ставите.
После --client: логин из admin-credentials.txt
После --demo: admin@ваш-прод-домен / InstallSeed1!
