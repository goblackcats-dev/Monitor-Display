#!/usr/bin/env bash
# Launch the dashboard fullscreen. Run from your desktop session, or via cage/sway on a bare TTY.
URL="${1:-http://127.0.0.1:8787}"
until curl -sf "$URL/api/state" >/dev/null; do sleep 1; done
exec chromium --kiosk --noerrdialogs --disable-infobars --no-first-run \
  --disable-features=Translate --overscroll-history-navigation=0 \
  --user-data-dir="$HOME/.cache/monitor-display-chromium" "$URL"
