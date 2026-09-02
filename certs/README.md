# TLS trust for Russian services (MAX / Госуслуги)

`russian_trusted_ca.pem` — корневой сертификат Минцифры («Russian Trusted Root CA»).

Нужен Node’у для исходящего HTTPS к доменам с этой цепочкой (`NODE_EXTRA_CA_CERTS`).

```bash
bash scripts/ensure-russian-ca.sh
# на VPS после деплоя:
bash scripts/ensure-russian-ca.sh /opt/sochi-portal/certs
docker compose up -d --force-recreate web
```

Entrypoint выставляет `NODE_EXTRA_CA_CERTS` **только если файл есть** — иначе предупреждение Node не появляется.
