#!/usr/bin/env bash
# Base prep: updates, SSH, never sleep, ignore the lid, Wi-Fi power-save off, timezone.
set -euo pipefail
. "$HERE/steps/common.sh"

say "Updating the system"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ca-certificates openssh-server \
  smartmontools lm-sensors htop rsync unattended-upgrades jq
sudo systemctl enable --now ssh

say "Setting the timezone to $TZ_NAME (override with TZ_NAME=...)"
sudo timedatectl set-timezone "$TZ_NAME"

say "Turning off sleep and hibernate"
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

say "Ignoring the lid (laptop can sit closed)"
sudo mkdir -p /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/server.conf >/dev/null <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
EOF
# The Xfce session has its own power manager; quiet it too (needs a running desktop session, so best effort).
for p in lid-action-on-ac lid-action-on-battery; do
  xfconf-query -c xfce4-power-manager -p "/xfce4-power-manager/$p" -n -t uint -s 0 2>/dev/null || true
done
xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/inactivity-on-ac -n -t uint -s 14 2>/dev/null || true # 14 = never
sudo systemctl restart systemd-logind || warn "logind restart skipped; reboot at the end applies the lid setting"

say "Headless use: log in automatically and keep your background services (Bluetooth audio) running with nobody at the screen"
if [ -d /etc/lightdm ]; then
  sudo mkdir -p /etc/lightdm/lightdm.conf.d
  printf '[Seat:*]\nautologin-user=%s\nautologin-user-timeout=0\n' "$USER" | sudo tee /etc/lightdm/lightdm.conf.d/50-autologin.conf >/dev/null
else
  warn "LightDM not found: set automatic login yourself in the login settings (needed so Bluetooth audio comes back after a reboot)."
fi
sudo loginctl enable-linger "$USER"

say "Wi-Fi power saving off (stops dropouts)"
sudo mkdir -p /etc/NetworkManager/conf.d
printf '[connection]\nwifi.powersave = 2\n' | sudo tee /etc/NetworkManager/conf.d/wifi-powersave-off.conf >/dev/null

say "Automatic security updates on"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

say "Base setup done."
cat <<'EOF'
Before you close the lid and walk away:
  - BIOS (F2 at boot) > Power Management > AC Behavior: tick "Wake on AC", so it turns itself back on after a power cut.
  - Remove a worn-out battery if it is swollen; keep the original Dell charger plugged in.
  - Give the laptop air: rear and bottom vents must stay clear (prop it on a stand or vertically). Check heat with: sensors
EOF
