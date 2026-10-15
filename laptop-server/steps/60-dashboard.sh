#!/usr/bin/env bash
# OPTIONAL (run with DASHBOARD=1): the Monitor Display dashboard on this laptop's own screen.
# The dashboard code lives one folder up from this bundle (the repo root).
set -euo pipefail
. "$HERE/steps/common.sh"

REPO="$(cd "$HERE/.." && pwd)"
[ -f "$REPO/server.js" ] || { warn "server.js not found next to this bundle ($REPO). Skipping."; exit 0; }

say "Installing Node 20+ (Ubuntu's own is too old for the dashboard)"
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "node $(node -v)"

[ -f "$REPO/.env" ] || cp "$REPO/.env.example" "$REPO/.env"

say "Backend service"
sed -e "s|^User=.*|User=$USER|" -e "s|^WorkingDirectory=.*|WorkingDirectory=$REPO|" \
    -e "s|^ExecStart=.*|ExecStart=$(command -v node) server.js|" \
    "$REPO/scripts/monitor-display.service" | sudo tee /etc/systemd/system/monitor-display.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now monitor-display

say "Fullscreen kiosk at login (Firefox; Ubuntu's Chromium is a snap and fights with profile folders)"
sudo apt-get install -y firefox || true
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/monitor-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Monitor Display
Exec=sh -c 'until curl -sf http://127.0.0.1:8787/api/state >/dev/null; do sleep 1; done; exec firefox --kiosk http://127.0.0.1:8787'
EOF
echo "Set auto-login in Settings > Session and Startup / Login Window so the kiosk starts after a reboot."
