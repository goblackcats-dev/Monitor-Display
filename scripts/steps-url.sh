#!/usr/bin/env bash
# Prints the full address your iPhone Shortcut should call (ends in ?steps= ; the Shortcut appends the number).
# Prints a secret, so run it only in your own terminal.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
TOKEN="$(sed -n 's/.*"token": *"\([^"]*\)".*/\1/p' data/steps-token.json 2>/dev/null)"
[ -n "$TOKEN" ] || { echo "No token yet: start the dashboard once (sudo systemctl restart monitor-display)." >&2; exit 1; }
echo "http://$(hostname).local:${PORT:-8787}/api/steps/${TOKEN}?steps="
