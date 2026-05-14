#!/usr/bin/env bash
#
# Start the web app in Next.js dev mode for tunnel-backed iteration.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f .env ]; then
  echo ".env is missing. Copy .env.example to .env and fill required values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

APP_HOST="${RC_HOST:-127.0.0.1}"
APP_PORT="${RC_PORT:-${PORT:-3100}}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"

docker compose up -d
pnpm --filter @researchcrafters/db db:generate
pnpm --filter @researchcrafters/db exec prisma migrate deploy

echo "ResearchCrafters dev web is starting on http://${APP_HOST}:${APP_PORT}"
exec pnpm --filter @researchcrafters/web exec next dev -H "$APP_HOST" -p "$APP_PORT"
