#!/usr/bin/env bash
# Prints where everything is and what is still manual.
. "$HERE/steps/common.sh"
IP="$(lan_ip)"
TS="$(command -v tailscale >/dev/null && tailscale ip -4 2>/dev/null | head -1 || true)"
cat <<EOF

================ What is running ================
  Immich       http://$IP:2283     (first visit: create the admin account, then install the phone app)
  Jellyfin     http://$IP:8096     (first visit: setup wizard; libraries live in $(conf_get PHOTOS_DIR)/media)
  Pi-hole      http://$IP:8081/admin   (password: sudo cat /opt/pihole/.env)
  Uptime Kuma  http://$IP:3001     (first visit: create an account, add monitors)
EOF
[ -n "$TS" ] && echo "  Tailscale    this machine is $TS (use that address from your phone away from home)"
cat <<EOF

================ Still manual ================
  1. Pi-hole only blocks ads for devices that use it. In your router's DHCP/DNS settings set DNS 1 = $IP
     and DNS 2 = 1.1.1.1 (so the internet still works if this laptop is off).
  2. Give this laptop a fixed address in the router ("DHCP reservation"), so $IP never changes.
  3. Immich phone app: server address http://$IP:2283 (or the Tailscale address), then turn on Backup.
  4. Photos are not backed up until a second drive or cloud copy exists. See README ("Backups").
  5. Log out and back in once so your user can run docker without sudo.
Log of this install: $HOME/laptop-server-install.log
EOF
