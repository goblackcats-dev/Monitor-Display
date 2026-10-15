#!/usr/bin/env bash
# Bluetooth speaker: BlueZ + PipeWire, then optional pairing. Auto-reconnects when the speaker is in range.
set -euo pipefail
. "$HERE/steps/common.sh"

say "Installing Bluetooth and audio packages"
sudo apt-get install -y bluez libspa-0.2-bluetooth pipewire-pulse wireplumber pulseaudio-utils
sudo sed -i 's/^#\?AutoEnable=.*/AutoEnable=true/' /etc/bluetooth/main.conf
sudo systemctl enable --now bluetooth
sudo rfkill unblock bluetooth || true

if ! ask_yn "Pair a Bluetooth speaker now? (Put it in pairing mode first.)" n; then
  echo "Skipping. Later:  bluetoothctl   then: scan on, pair <MAC>, trust <MAC>, connect <MAC>"
  exit 0
fi

say "Scanning for 15 seconds..."
( echo "power on"; echo "scan on"; sleep 15; echo "scan off"; echo "devices"; echo "quit" ) | bluetoothctl >/tmp/bt-scan.txt 2>&1 || true
grep '^Device ' /tmp/bt-scan.txt | sort -u
read -r -p "Speaker address (like AA:BB:CC:DD:EE:FF), or Enter to skip: " MAC
[ -n "$MAC" ] || exit 0
[[ "$MAC" =~ ^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$ ]] || { warn "That does not look like an address."; exit 1; }
( echo "pair $MAC"; sleep 8; echo "trust $MAC"; sleep 2; echo "connect $MAC"; sleep 8; echo "quit" ) | bluetoothctl || true
say "Check it with:  bluetoothctl info $MAC   (Connected: yes). Test sound from the volume icon or: speaker-test -t wav -c 2"
