#!/usr/bin/env bash
# Install the weekday screen schedule into your crontab (no sudo). Safe to re-run.
#   bash scripts/install-screen-schedule.sh            # Mon-Fri 08:00 on, 18:00 off
#   ON_HOUR=7 OFF_HOUR=19 bash scripts/install-screen-schedule.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ON_HOUR="${ON_HOUR:-8}"; OFF_HOUR="${OFF_HOUR:-18}"
chmod +x "$DIR/screen.sh"
TAG="# monitor-display-screen"
{
  crontab -l 2>/dev/null | grep -v "$TAG" || true
  echo "0 $ON_HOUR * * 1-5 ON_HOUR=$ON_HOUR OFF_HOUR=$OFF_HOUR $DIR/screen.sh on $TAG"
  echo "0 $OFF_HOUR * * 1-5 ON_HOUR=$ON_HOUR OFF_HOUR=$OFF_HOUR $DIR/screen.sh off $TAG"
  # After a reboot, set the screen from the clock (e.g. stay off on weekends).
  echo "@reboot sleep 60 && ON_HOUR=$ON_HOUR OFF_HOUR=$OFF_HOUR $DIR/screen.sh auto $TAG"
} | crontab -
crontab -l | grep "$TAG"
