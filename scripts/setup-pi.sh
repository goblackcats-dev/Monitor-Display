#!/usr/bin/env bash
# One-shot setup for a Raspberry Pi (3 or newer) running Raspberry Pi OS with desktop.
# Run as your normal user (not root) from the repo:  bash scripts/setup-pi.sh
# Safe to re-run. Reboots at the end unless NO_REBOOT=1.
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as your normal user, not root (it calls sudo where needed)." >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="$(id -un)"
step() { printf '\n==> %s\n' "$*"; }

step "Installing packages"
sudo apt-get update
sudo apt-get install -y curl ca-certificates
if apt-cache show chromium >/dev/null 2>&1; then
  sudo apt-get install -y chromium
else
  sudo apt-get install -y chromium-browser
fi

step "Installing Node 20+ (if missing)"
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "node $(node -v)"

step "Creating .env"
if [ ! -f "$REPO_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
  echo "Created $REPO_DIR/.env (add SPOTIFY_CLIENT_ID there)."
else
  echo ".env already exists, leaving it alone."
fi

step "Installing the backend service"
NODE_BIN="$(command -v node)"
sed -e "s|^User=.*|User=$RUN_USER|" \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=$REPO_DIR|" \
    -e "s|^ExecStart=.*|ExecStart=$NODE_BIN server.js|" \
    "$REPO_DIR/scripts/monitor-display.service" \
  | sudo tee /etc/systemd/system/monitor-display.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable monitor-display
sudo systemctl restart monitor-display

step "Desktop autologin and no screen blanking"
if command -v raspi-config >/dev/null 2>&1; then
  sudo raspi-config nonint do_boot_behaviour B4   # desktop, autologin
  sudo raspi-config nonint do_blanking 1          # 1 = disable blanking
else
  echo "raspi-config not found; set autologin and disable blanking by hand."
fi

step "Kiosk autostart"
chmod +x "$REPO_DIR/scripts/kiosk.sh"
if [ -d "$HOME/.config/labwc" ] || [ -d /etc/xdg/labwc ] || [ "${XDG_CURRENT_DESKTOP:-}" = "labwc:wlroots" ]; then
  # Raspberry Pi OS Bookworm (labwc/Wayland) starts this file at login.
  mkdir -p "$HOME/.config/labwc"
  AUTOSTART="$HOME/.config/labwc/autostart"
  touch "$AUTOSTART"
  if ! grep -qF "$REPO_DIR/scripts/kiosk.sh" "$AUTOSTART"; then
    echo "\"$REPO_DIR/scripts/kiosk.sh\" &" >> "$AUTOSTART"
  fi
  echo "Added kiosk to $AUTOSTART"
else
  mkdir -p "$HOME/.config/autostart"
  printf '[Desktop Entry]\nType=Application\nName=Kiosk\nExec=%s/scripts/kiosk.sh\n' "$REPO_DIR" \
    > "$HOME/.config/autostart/kiosk.desktop"
  echo "Added $HOME/.config/autostart/kiosk.desktop"
fi

step "Done"
echo "Dashboard backend: http://127.0.0.1:8787  (service: monitor-display)"
echo "Next: put SPOTIFY_CLIENT_ID in $REPO_DIR/.env, then: sudo systemctl restart monitor-display"
if [ "${NO_REBOOT:-}" != "1" ]; then
  echo "Rebooting in 5 seconds (Ctrl+C to cancel)..."
  sleep 5
  sudo reboot
fi
