#!/usr/bin/env bash
# Set one value in .env without it appearing in chat, shell history or process lists.
#   bash scripts/set-env.sh CALENDAR_ICS_URL      (prompts, input is hidden)
# Restarts the backend so the value takes effect.
set -euo pipefail
KEY="${1:?usage: set-env.sh KEY}"
case "$KEY" in *[!A-Z0-9_]*) echo "bad key" >&2; exit 1 ;; esac
cd "$(dirname "${BASH_SOURCE[0]}")/.."
read -r -s -p "$KEY: " VAL; echo
[ -n "$VAL" ] || { echo "empty, nothing changed" >&2; exit 1; }
touch .env
grep -v "^${KEY}=" .env > .env.new || true
printf '%s=%s\n' "$KEY" "$VAL" >> .env.new
mv .env.new .env
chmod 600 .env
echo "saved ${KEY}"
pkill -f '[n]ode.server.js' || true
