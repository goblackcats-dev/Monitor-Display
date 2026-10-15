#!/usr/bin/env bash
# Turn the HDMI screen on/off (Wayland/labwc). The Pi keeps running; only the display sleeps.
#   screen.sh on | off | auto
# "auto" sets the screen from the clock: on Mon-Fri between ON_HOUR and OFF_HOUR, off otherwise.
# Used by cron, see scripts/install-screen-schedule.sh.
ON_HOUR="${ON_HOUR:-8}"
OFF_HOUR="${OFF_HOUR:-18}"

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
sock="$(ls "$XDG_RUNTIME_DIR"/wayland-* 2>/dev/null | grep -v lock | head -1)"
export WAYLAND_DISPLAY="$(basename "$sock")"

# Skip the stand-in "NOOP"/headless output the compositor creates while the real screen is off.
out="$(wlr-randr | awk '/^[A-Za-z]/ && $1 !~ /^(NOOP|HEADLESS)/ {print $1; exit}')"
[ -n "$out" ] || { echo "no display found" >&2; exit 1; }

case "${1:-auto}" in
  on)  wlr-randr --output "$out" --on ;;
  off) wlr-randr --output "$out" --off ;;
  auto)
    dow="$(date +%u)"; hr="$((10#$(date +%H)))"
    if [ "$dow" -le 5 ] && [ "$hr" -ge "$ON_HOUR" ] && [ "$hr" -lt "$OFF_HOUR" ]; then
      wlr-randr --output "$out" --on
    else
      wlr-randr --output "$out" --off
    fi ;;
  *) echo "usage: screen.sh on|off|auto" >&2; exit 1 ;;
esac
