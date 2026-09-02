# Репликация и failover (второй VPS)

**Скрипты:**  
- `scripts/setup-replica-ha.sh` — настройка роли primary/standby  
- `scripts/yp-ha-sync.sh` → `/usr/local/sbin/yp-ha-sync` — sync / watchdog / promote  

**Админка:** `/admin/settings` → вкладка «Репликация» (`replicaJson`)

Дата: 2026-08-11

> **Порядок работ:** сначала проверьте и примите `docs/VPS-FRESH-INSTALL.md` на одном VPS.  
> К тестированию HA переходим **после вашего подтверждения**.

---

## Зачем

Второй VPS держит копию PostgreSQL (+ uploads) и может принять трафик, если основной недоступен.

---

## Как это связано с доменом

Один публичный hostname (например `young.example.ru`). Пользователи всегда ходят на него; **DNS (или floating IP) решает, какой VPS отвечает**.

| Режим `--failover-mode` | Как переключается домен | RTO (оценка) | Когда выбирать |
|-------------------------|-------------------------|--------------|----------------|
| **manual** | Вы руками меняете A-запись на IP standby и делаете `yp-ha-sync promote` | минуты–десятки минут | Старт, мало опыта |
| **dns-ttl** | TTL 60–120 с + хук `DNS_FAILOVER_HOOK` (Cloudflare/Yandex API) при promote | ~1–5 мин | Нет floating IP у провайдера |
| **floating-ip** | Плавающий IP переезжает на standby (API панели AEZA/др.) | секунды–минуты | Лучший вариант, если есть |

### Важно про split-brain

После failover **старый primary нельзя** оставлять писать в ту же БД под тем же доменом. Либо выключен, либо переведён в standby и снова синкается **с нового** primary.

### Приоритет главного

`--priority` (число): выше = предпочтительнее как primary.

- Сейчас приоритет **документирует намерение** и пишется в `replicaJson.notes`.  
- Автоматический «перевыбор» при двух живых нодах **не делается** (чтобы не дёргать DNS).  
- Возврат на прежний primary — ручной: синк, смена DNS/floating IP, `ROLE=primary` на избранном узле.

`AUTO_PROMOTE=1` на standby: если peer health падает N раз подряд → `promote` (+ DNS hook, если задан). По умолчанию **выключено**.

---

## Подготовка двух узлов

1. Оба установлены через `install-fresh-vps.sh` с **одним и тем же** `DOMAIN`.  
2. DNS A сейчас указывает на **primary**.  
3. SSH по ключу: primary ↔ standby (порт как в harden, часто 4488).  
4. На standby веб может быть поднят, но публичный DNS на него не смотрит.

---

## Установка HA

### Primary

```bash
bash /opt/sochi-portal/scripts/setup-replica-ha.sh \
  --role primary \
  --peer-host 203.0.113.20 \
  --peer-ssh-port 4488 \
  --shared-secret 'одна-и-та-же-длинная-строка' \
  --failover-mode dns-ttl \
  --priority 100 \
  --sync-interval-min 15
```

### Standby

```bash
bash /opt/sochi-portal/scripts/setup-replica-ha.sh \
  --role standby \
  --peer-host 203.0.113.10 \
  --peer-ssh-port 4488 \
  --shared-secret 'одна-и-та-же-длинная-строка' \
  --failover-mode dns-ttl \
  --priority 50 \
  --sync-interval-min 15
  # добавьте --auto-promote только осознанно
```

Опционально DNS-хук:

```bash
--dns-hook /usr/local/sbin/yp-dns-failover.sh
```

Хук должен обновить A-запись домена на IP **этого** сервера (пример — Cloudflare API в вашем скрипте).

---

## Команды эксплуатации

```bash
yp-ha-sync status
yp-ha-sync sync          # primary → push; standby → pull
yp-ha-sync watchdog      # только standby
yp-ha-sync promote       # сделать этот узел primary + DNS hook
```

Логи: `/var/log/yp-ha-sync.log`  
Конфиг: `/etc/yp-ha.conf` (chmod 600)

---

## Ручной failover (рекомендуемый первый прогон)

1. Убедиться, что standby свежий: `yp-ha-sync status` / последний sync ok.  
2. Остановить web на primary (или весь узел).  
3. На standby: `yp-ha-sync promote`.  
4. Перевести DNS A / floating IP на standby.  
5. Проверить `https://домен/api/health`.  
6. Старый primary после ремонта перевести в standby и сменить `PEER_HOST`.

---

## Что синкается

- Дамп PostgreSQL (`pg_dump` / `pg_restore`)  
- Каталог `public/uploads/` (если не `--no-uploads`)  

Не синкается как «истина»: локальный `.env` (секреты могут отличаться, но `NEXTAUTH_URL` должен оставаться публичным URL домена). `NEXTAUTH_SECRET` лучше **одинаковый** на обоих узлах, иначе сессии слетят при failover.

---

## Проверка скриптов без второго VPS

```bash
bash -n scripts/setup-replica-ha.sh scripts/yp-ha-sync.sh
bash scripts/setup-replica-ha.sh --help
bash scripts/setup-replica-ha.sh --dry-run \
  --role primary --peer-host 1.2.3.4 --shared-secret test
```

Полный E2E — только на двух машинах после вашего OK.

---

## Связь с админкой

Вкладка «Репликация» сохраняет те же поля в `SiteSettings.replicaJson` для обзора. Операционный контур — файлы `/etc/yp-ha.conf` + cron; UI не заменяет SSH-синк.
