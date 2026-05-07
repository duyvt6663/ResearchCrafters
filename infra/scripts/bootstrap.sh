#!/usr/bin/env bash
#
# bootstrap.sh — bring a fresh clone of ResearchCrafters up to a running dev
# tier. Idempotent; safe to re-run.
#
# What this script does:
#   1. Verifies node, pnpm, and `docker compose` are on PATH.
#   2. Copies .env.example -> .env if .env is missing.
#   3. Runs `pnpm install`.
#   4. Boots Postgres / Redis / MinIO via docker compose and waits for
#      healthchecks to pass.
#   5. Generates the Prisma client.
#
# It does NOT run migrations or seeds — those follow once the auth-db agent
# lands the baseline migration. See "Next steps" at the end for the manual
# follow-up commands.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

color() {
  # $1 = ANSI code, $2... = text
  local code="$1"; shift
  if [ -t 1 ]; then
    printf '\033[%sm%s\033[0m\n' "$code" "$*"
  else
    printf '%s\n' "$*"
  fi
}

header() { color "1;36" "==> $*"; }
info()   { color "0;36" "    $*"; }
warn()   { color "1;33" "!!  $*"; }
fail()   { color "1;31" "xx  $*"; exit 1; }

header "ResearchCrafters dev bootstrap"
info  "Repo root: $REPO_ROOT"

# --- 1. Tool checks -----------------------------------------------------------

require() {
  local bin="$1" hint="$2"
  if ! command -v "$bin" >/dev/null 2>&1; then
    warn "Missing: $bin"
    info "$hint"
    return 1
  fi
}

missing=0
require node "Install Node 20.18 (see .nvmrc) — https://nodejs.org/ or use nvm/fnm." || missing=1
require pnpm "Install pnpm 9 — https://pnpm.io/installation (corepack enable && corepack prepare pnpm@9 --activate)." || missing=1

if ! docker compose version >/dev/null 2>&1; then
  warn "Missing: docker compose v2"
  info "Install Docker Desktop or the docker-compose-plugin — https://docs.docker.com/compose/install/."
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  fail "Install the missing tools above and re-run ./infra/scripts/bootstrap.sh"
fi

# --- 2. .env ------------------------------------------------------------------

header "Environment file"
if [ -f .env ]; then
  info ".env already present — leaving it alone."
else
  cp .env.example .env
  info "Copied .env.example -> .env"
fi

# --- 3. pnpm install ----------------------------------------------------------

header "Installing JS dependencies"
pnpm install --frozen-lockfile=false

# --- 4. docker compose --------------------------------------------------------

header "Starting Postgres / Redis / MinIO"
docker compose up -d

# Wait until each service reports healthy (or until we hit a timeout).
wait_healthy() {
  local svc="$1" tries=60
  info "Waiting for $svc to report healthy..."
  while (( tries > 0 )); do
    local cid status
    cid="$(docker compose ps -q "$svc" || true)"
    if [ -z "$cid" ]; then
      sleep 2; tries=$((tries-1)); continue
    fi
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
    case "$status" in
      healthy|running) info "$svc is $status"; return 0 ;;
      starting|created|unknown) ;;
      *) warn "$svc reported status: $status" ;;
    esac
    sleep 2
    tries=$((tries-1))
  done
  fail "$svc did not become healthy in time. Try: docker compose logs $svc"
}

wait_healthy postgres
wait_healthy redis
wait_healthy minio

# minio-init is a one-shot; it should have run to completion by now.
info "Bucket bootstrap (minio-init) logs:"
docker compose logs --no-color minio-init || true

# --- 5. Prisma client ---------------------------------------------------------

header "Generating Prisma client"
pnpm --filter @researchcrafters/db db:generate

# --- 6. Next steps ------------------------------------------------------------

header "Bootstrap complete. Next steps:"
cat <<'NEXT'
  Once the auth-db-agent lands the baseline Prisma migration:
    pnpm --filter @researchcrafters/db db:migrate
    pnpm --filter @researchcrafters/db db:seed

  Then start the dev stack:
    pnpm dev

  Useful one-offs:
    docker compose ps                # check service health
    docker compose logs -f postgres  # tail Postgres logs
    docker compose down              # stop services (keeps volumes)
    docker compose down -v           # full reset (drops volumes)
NEXT
