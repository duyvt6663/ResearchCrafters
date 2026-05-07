#!/usr/bin/env bash
#
# lighthouse-ci.sh — run Lighthouse CI against a locally-built apps/web.
#
# This mirrors the GitHub Actions `lighthouse` workflow so engineers can
# reproduce a perf-budget run before pushing.
#
# Steps:
#   1. Verify docker compose, pnpm, node are on PATH.
#   2. Boot postgres + minio via docker compose (does not touch redis).
#   3. Generate prisma client, deploy migrations, seed.
#   4. Build apps/web and start it on PORT 3001 in the background.
#   5. Poll /api/health until 200 (60s budget).
#   6. Run `lhci autorun` against lighthouserc.json.
#   7. Tear the dev server down on exit; leaves docker-compose services up so
#      the regular dev tier is uninterrupted.
#
# Usage:
#   ./infra/scripts/lighthouse-ci.sh
#   PORT=3010 ./infra/scripts/lighthouse-ci.sh    # override the port
#
# Outputs:
#   .lighthouseci/         Lighthouse reports (HTML + JSON) per URL/run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PORT="${PORT:-3001}"
WEB_LOG="$(mktemp -t lighthouse-web.XXXXXX.log)"
WEB_PID=""

color() {
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

cleanup() {
  if [ -n "${WEB_PID:-}" ] && kill -0 "$WEB_PID" 2>/dev/null; then
    info "Stopping web app (pid $WEB_PID)..."
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [ -f "$WEB_LOG" ]; then
    info "Web server log saved at: $WEB_LOG"
  fi
}
trap cleanup EXIT

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
require node "Install Node from .nvmrc — https://nodejs.org/ or use nvm/fnm." || missing=1
require pnpm "Install pnpm 9 — https://pnpm.io/installation." || missing=1
require curl "Install curl — required to poll /api/health." || missing=1
if ! docker compose version >/dev/null 2>&1; then
  warn "Missing: docker compose v2"
  info "Install Docker Desktop or the docker-compose-plugin."
  missing=1
fi
if [ "$missing" -ne 0 ]; then
  fail "Install the missing tools above and re-run."
fi

# --- 2. Boot dev tier (postgres + minio only) --------------------------------

header "Booting Postgres + MinIO via docker compose"
docker compose up -d postgres minio

info "Waiting for Postgres to accept connections..."
tries=40
while (( tries > 0 )); do
  if docker compose exec -T postgres pg_isready -U researchcrafters -d researchcrafters >/dev/null 2>&1; then
    info "Postgres is ready."
    break
  fi
  sleep 2
  tries=$((tries - 1))
done
if (( tries == 0 )); then
  docker compose logs postgres || true
  fail "Postgres did not become ready in time."
fi

# --- 3. Prisma generate + migrate + seed -------------------------------------

header "Generating Prisma client"
pnpm --filter @researchcrafters/db exec prisma generate

header "Applying Prisma migrations"
pnpm --filter @researchcrafters/db exec prisma migrate deploy

header "Seeding database"
pnpm --filter @researchcrafters/db db:seed

# --- 4. Build + start apps/web ------------------------------------------------

header "Building apps/web"
pnpm --filter @researchcrafters/web build

header "Starting apps/web on port $PORT"
PORT="$PORT" pnpm --filter @researchcrafters/web start >"$WEB_LOG" 2>&1 &
WEB_PID=$!
info "Web app pid: $WEB_PID (logs: $WEB_LOG)"

# --- 5. Poll /api/health ------------------------------------------------------

info "Polling http://localhost:$PORT/api/health..."
tries=30
while (( tries > 0 )); do
  if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    info "Web app is healthy."
    break
  fi
  sleep 2
  tries=$((tries - 1))
done
if (( tries == 0 )); then
  warn "Last 50 lines of web.log:"
  tail -n 50 "$WEB_LOG" || true
  fail "Web app did not respond on :$PORT within 60s."
fi

# --- 6. Run Lighthouse CI -----------------------------------------------------

header "Running Lighthouse CI"
# `lhci autorun` reads lighthouserc.json from the repo root.
npx -y @lhci/cli@0.14.x autorun

header "Lighthouse CI complete"
info "Reports written to: $REPO_ROOT/.lighthouseci/"
info "Open the .html files in that directory for the per-URL reports."
