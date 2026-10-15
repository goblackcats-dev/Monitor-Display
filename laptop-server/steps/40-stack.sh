#!/usr/bin/env bash
# The services, all in Docker: Immich (photos), Jellyfin (media), Pi-hole (ad blocking), Uptime Kuma (status).
# Vaultwarden, Paperless and Home Assistant are left out on purpose: see README ("Later").
set -euo pipefail
. "$HERE/steps/common.sh"

PHOTOS_DIR="$(conf_get PHOTOS_DIR)"
if [ -z "$PHOTOS_DIR" ]; then warn "Run step 30-drive first (it records where photos live)."; exit 1; fi
IP="$(lan_ip)"

for d in immich jellyfin pihole kuma; do sudo mkdir -p "/opt/$d"; sudo chown "$USER":"$USER" "/opt/$d"; done

# ---------------- Immich: use the project's own, current compose file ----------------
say "Immich"
cd /opt/immich
curl -fsSL -o docker-compose.yml https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml
if [ ! -f .env ]; then
  curl -fsSL -o .env https://github.com/immich-app/immich/releases/latest/download/example.env
  sed -i "s|^UPLOAD_LOCATION=.*|UPLOAD_LOCATION=$PHOTOS_DIR/immich|" .env
  sed -i "s|^DB_DATA_LOCATION=.*|DB_DATA_LOCATION=/opt/immich/postgres|" .env   # database stays on the INTERNAL disk
  sed -i "s|^# *TZ=.*|TZ=$TZ_NAME|; s|^TZ=.*|TZ=$TZ_NAME|" .env
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(rand 24)|" .env
  chmod 600 .env
fi
dc up -d

# ---------------- Jellyfin ----------------
say "Jellyfin (put movies and shows in $PHOTOS_DIR/media)"
cat > /opt/jellyfin/docker-compose.yml <<EOF
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    restart: unless-stopped
    ports: ["8096:8096"]
    environment: { TZ: "$TZ_NAME" }
    volumes:
      - /opt/jellyfin/config:/config
      - /opt/jellyfin/cache:/cache
      - $PHOTOS_DIR/media:/media:ro
EOF
( cd /opt/jellyfin && dc up -d )

# ---------------- Pi-hole ----------------
say "Pi-hole"
# Ubuntu's own resolver already uses port 53; turn that part off so Pi-hole can have it.
sudo mkdir -p /etc/systemd/resolved.conf.d
printf '[Resolve]\nDNSStubListener=no\n' | sudo tee /etc/systemd/resolved.conf.d/pihole.conf >/dev/null
sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
sudo systemctl restart systemd-resolved
if [ ! -f /opt/pihole/.env ]; then echo "PIHOLE_PASSWORD=$(rand 16)" > /opt/pihole/.env; chmod 600 /opt/pihole/.env; fi
cat > /opt/pihole/docker-compose.yml <<EOF
services:
  pihole:
    image: pihole/pihole:latest
    container_name: pihole
    restart: unless-stopped
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "8081:80/tcp"
    environment:
      TZ: "$TZ_NAME"
      FTLCONF_webserver_api_password: "\${PIHOLE_PASSWORD}"
      FTLCONF_dns_listeningMode: "ALL"
      FTLCONF_dns_upstreams: "1.1.1.1;1.0.0.1"
    volumes:
      - /opt/pihole/etc-pihole:/etc/pihole
EOF
( cd /opt/pihole && dc up -d )

# ---------------- Uptime Kuma ----------------
say "Uptime Kuma"
cat > /opt/kuma/docker-compose.yml <<'EOF'
services:
  kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: unless-stopped
    ports: ["3001:3001"]
    volumes: ["/opt/kuma/data:/app/data"]
EOF
( cd /opt/kuma && dc up -d )

say "Stack started. First start of Immich takes a few minutes while images download."
dc -f /opt/immich/docker-compose.yml ps --format 'table {{.Name}}\t{{.Status}}' || true
