#!/usr/bin/env bash
# Nightly backup of the databases and settings, plus an optional mirror of photos to a SECOND drive.
# Photos are only really backed up if a second drive (/srv/backup) or cloud copy exists.
set -euo pipefail
. "$HERE/steps/common.sh"

PHOTOS_DIR="$(conf_get PHOTOS_DIR)"
[ -n "$PHOTOS_DIR" ] || { warn "Run step 30-drive first."; exit 1; }

say "Installing the backup script"
sudo tee /usr/local/bin/laptop-server-backup >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
CONF=/etc/laptop-server.conf
PHOTOS_DIR="$(sed -n 's/^PHOTOS_DIR=//p' $CONF | tail -1)"
OUT="$PHOTOS_DIR/backups"
mkdir -p "$OUT"
day="$(date +%F)"

# Immich database (the project's documented method)
docker exec -t immich_postgres pg_dumpall --clean --if-exists --username=postgres | gzip > "$OUT/immich-db-$day.sql.gz"
# Settings and compose files (contain passwords: keep the backup drive private)
tar -czf "$OUT/settings-$day.tar.gz" /opt/immich/docker-compose.yml /opt/immich/.env /opt/jellyfin/docker-compose.yml \
    /opt/pihole/docker-compose.yml /opt/pihole/.env /opt/kuma/docker-compose.yml /etc/laptop-server.conf 2>/dev/null || true
# Pi-hole and Jellyfin configuration
tar -czf "$OUT/pihole-jellyfin-$day.tar.gz" /opt/pihole/etc-pihole /opt/jellyfin/config 2>/dev/null || true
# Keep two weeks of dumps
find "$OUT" -name '*.gz' -mtime +14 -delete

# Mirror photos to a second drive when one is mounted (never deletes anything there)
if mountpoint -q /srv/backup; then
  rsync -a "$PHOTOS_DIR/immich/" /srv/backup/immich/
  rsync -a "$PHOTOS_DIR/media/" /srv/backup/media/
  mkdir -p /srv/backup/db
  cp -a "$OUT/." /srv/backup/db/
fi
date -Is > /var/lib/laptop-server/last-backup
EOF
sudo chmod +x /usr/local/bin/laptop-server-backup
sudo mkdir -p /var/lib/laptop-server

sudo tee /etc/systemd/system/laptop-server-backup.service >/dev/null <<'EOF'
[Unit]
Description=Laptop server nightly backup
[Service]
Type=oneshot
ExecStart=/usr/local/bin/laptop-server-backup
EOF
sudo tee /etc/systemd/system/laptop-server-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Laptop server nightly backup
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now laptop-server-backup.timer

say "Backups run nightly at 03:30. Try one now with:  sudo laptop-server-backup"
if [ "$(conf_get PHOTOS_EXTERNAL)" = yes ] && ! mountpoint -q /srv/backup; then
  warn "No second drive at /srv/backup yet: the database dumps sit on the SAME drive as the photos. Add a second drive (mount it at /srv/backup) or a cloud copy."
fi
