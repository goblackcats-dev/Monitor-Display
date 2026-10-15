#!/usr/bin/env bash
# Save an extra Wi-Fi network on the Pi so it joins by itself when it is moved. Run it in your own terminal:
#   bash scripts/add-wifi.sh            (asks for the network name and password; the password is hidden)
# Works for WPA/WPA2-Personal (home, hotspot, most guest networks). Not for company logins (WPA2-Enterprise).
# The Pi 3 supports 2.4 GHz only.
set -euo pipefail
read -r -p "Wi-Fi name (SSID): " SSID
[ -n "$SSID" ] || { echo "no name given" >&2; exit 1; }
read -r -s -p "Password (blank for an open network): " PASS; echo
NAME="extra-$SSID"
sudo nmcli connection delete "$NAME" >/dev/null 2>&1 || true
if [ -n "$PASS" ]; then
  sudo nmcli connection add type wifi con-name "$NAME" ifname wlan0 ssid "$SSID" \
    wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASS" connection.autoconnect yes connection.autoconnect-priority 5
else
  sudo nmcli connection add type wifi con-name "$NAME" ifname wlan0 ssid "$SSID" connection.autoconnect yes connection.autoconnect-priority 5
fi
echo "Saved. The Pi will join \"$SSID\" automatically whenever it is in range."
echo "Saved networks:"; nmcli -t -f NAME,TYPE connection show | grep wireless | cut -d: -f1
