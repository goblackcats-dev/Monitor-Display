#!/usr/bin/env bash
# Stage 2: turn a freshly installed Xubuntu LTS laptop into a small home server.
# UNTESTED on real hardware as written. Read README.md first.
#
#   bash install.sh                       run every step, in order
#   bash install.sh --only 40-stack       run one step (re-running a step is safe)
#   bash install.sh --skip 50-audio       leave a step out
#   DASHBOARD=1 bash install.sh           also install the Monitor Display dashboard (+ kiosk)
#
# Steps: 00-base 10-docker 20-tailscale 30-drive 40-stack 50-audio 60-dashboard 70-backup
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export HERE
export LAPTOP_SERVER_CONF=/etc/laptop-server.conf
LOG="$HOME/laptop-server-install.log"
exec > >(tee -a "$LOG") 2>&1

if [ "$(id -u)" -eq 0 ]; then echo "Run as your normal user, not root (it calls sudo)." >&2; exit 1; fi
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ]; then echo "This is written for Ubuntu/Xubuntu LTS (found: ${PRETTY_NAME:-unknown})." >&2; exit 1; fi

ALL=(00-base 10-docker 20-tailscale 30-drive 40-stack 50-audio 60-dashboard 70-backup)
ONLY=""; SKIP=" "
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift 2 ;;
    --skip) SKIP="$SKIP$2 "; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
done
[ -n "${DASHBOARD:-}" ] || SKIP="${SKIP}60-dashboard "

echo "== laptop-server install, $(date) =="
echo "Log: $LOG"
sudo -v
# keep sudo alive for the long steps
( while true; do sudo -n true; sleep 50; kill -0 "$$" 2>/dev/null || exit; done ) 2>/dev/null &

for s in "${ALL[@]}"; do
  if [ -n "$ONLY" ] && [ "$s" != "$ONLY" ]; then continue; fi
  case "$SKIP" in *" $s "*) echo "-- skipping $s"; continue ;; esac
  echo; echo "=================== $s ==================="
  if ! bash "$HERE/steps/$s.sh"; then
    echo; echo "!! Step $s failed. Fix the problem above, then run:  bash install.sh --only $s"
    echo "   (earlier steps are safe to skip; later ones: rerun install.sh and it continues)"
    exit 1
  fi
done

echo; echo "== All requested steps finished. =="
bash "$HERE/steps/summary.sh" || true
