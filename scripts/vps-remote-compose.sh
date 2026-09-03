#!/usr/bin/env bash
# Snippet for VPS: pick docker-compose v1 if plugin `docker compose` is missing.
yp_compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}
