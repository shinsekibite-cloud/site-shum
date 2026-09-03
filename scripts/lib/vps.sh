# Shared VPS SSH/SCP with retries. Source from workflow scripts.
# HOST / PORT / SSHPASS already documented in docs/WORKFLOW.md
# Optional: SSH_IDENTITY=/path/to/key for key-based auth
# Optional: repo-root `.env.vps` (gitignored) — copy from `.env.vps.example`
_yp_env="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.env.vps"
if [[ -f "$_yp_env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$_yp_env"
  set +a
fi

HOST="${HOST:-root@77.110.125.241}"
PORT="${PORT:-22}"

yp_need_ssh() {
  if [[ -n "${SSHPASS:-}" ]]; then return 0; fi
  if [[ -n "${SSH_IDENTITY:-}" && -f "${SSH_IDENTITY}" ]]; then return 0; fi
  if [[ -f "${HOME}/.ssh/id_ed25519" || -f "${HOME}/.ssh/id_rsa" || -f "${HOME}/.ssh/id_ed25519_yp" ]]; then
    return 0
  fi
  echo "Set SSHPASS, SSH_IDENTITY, or configure an SSH key." >&2
  return 1
}

yp_init_ssh() {
  yp_need_ssh || return 1
  local opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=25)
  local id="${SSH_IDENTITY:-}"
  if [[ -z "$id" && -f "${HOME}/.ssh/id_ed25519_yp" ]]; then
    id="${HOME}/.ssh/id_ed25519_yp"
  fi
  if [[ -n "$id" && -f "$id" ]]; then
    opts+=(-i "$id" -o IdentitiesOnly=yes)
    SSH=(ssh "${opts[@]}" -p "$PORT" "$HOST")
    SCP=(scp "${opts[@]}" -P "$PORT")
  elif [[ -n "${SSHPASS:-}" ]]; then
    SSH=(sshpass -e ssh "${opts[@]}" -p "$PORT" "$HOST")
    SCP=(sshpass -e scp "${opts[@]}" -P "$PORT")
  else
    SSH=(ssh "${opts[@]}" -p "$PORT" "$HOST")
    SCP=(scp "${opts[@]}" -P "$PORT")
  fi
}

# Retry Connection reset / kex failures (this VPS drops SSH under load).
yp_retry() {
  local n=0 delay=4
  while true; do
    if "$@"; then return 0; fi
    n=$((n + 1))
    if [[ "$n" -ge 5 ]]; then
      echo "FAILED after $n tries: $*" >&2
      return 1
    fi
    echo "retry $n in ${delay}s: $*" >&2
    sleep "$delay"
    delay=$((delay * 2))
  done
}

yp_ssh() { yp_retry "${SSH[@]}" "$@"; }
yp_scp() { yp_retry "${SCP[@]}" "$@"; }
