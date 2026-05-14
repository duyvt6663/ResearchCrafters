#!/usr/bin/env bash
#
# Publish the localhost web app through a temporary trycloudflare.com URL.
# Use this for smoke tests only; use a named tunnel for a stable hostname.

set -euo pipefail

APP_PORT="${RC_PORT:-${PORT:-3000}}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it with: brew install cloudflared" >&2
  exit 1
fi

exec cloudflared tunnel --url "http://127.0.0.1:${APP_PORT}"
