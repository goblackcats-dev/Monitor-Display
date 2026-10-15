#!/usr/bin/env bash
# Launch the dashboard fullscreen. Run from your desktop session, or via cage/sway on a bare TTY.
URL="${1:-http://127.0.0.1:8787}"
until curl -sf "$URL/api/state" >/dev/null; do sleep 1; done
BROWSER="$(command -v chromium || command -v chromium-browser)"
OZONE=""
[ -n "${WAYLAND_DISPLAY:-}" ] && OZONE="--ozone-platform=wayland"
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --no-first-run \
  $OZONE --password-store=basic --deny-permission-prompts --remote-debugging-port=9222 --autoplay-policy=no-user-gesture-required --disable-features=Translate --overscroll-history-navigation=0 \
  --user-data-dir="$HOME/.cache/monitor-display-chromium" "$URL"
