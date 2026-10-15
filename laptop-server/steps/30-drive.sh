#!/usr/bin/env bash
# Pick the external drive for photos/media and mount it permanently (by UUID, "nofail").
# NEVER formats anything unless you type the exact word ERASE followed by the device.
set -euo pipefail
. "$HERE/steps/common.sh"

MOUNT=/srv/photos
if [ -n "$(conf_get PHOTOS_DIR)" ] && mountpoint -q "$(conf_get PHOTOS_DIR)" 2>/dev/null; then
  say "Photos drive already set up at $(conf_get PHOTOS_DIR). Nothing to do."
  exit 0
fi

root_disk="$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null | head -1)"
say "Disks on this machine (the system disk is /dev/${root_disk:-?} and is off limits):"
lsblk -o NAME,SIZE,TYPE,FSTYPE,LABEL,MOUNTPOINT,MODEL,TRAN
echo
read -r -p "Device for the photo drive, e.g. /dev/sdb1 (or /dev/sdb for a blank disk). Enter to skip: " DEV
if [ -z "$DEV" ]; then
  warn "Skipping. Photos will live on the INTERNAL disk at $MOUNT (no extra protection if it fails)."
  sudo mkdir -p "$MOUNT"; sudo chown "$USER":"$USER" "$MOUNT"
  conf_set PHOTOS_DIR "$MOUNT"; conf_set PHOTOS_EXTERNAL no
  exit 0
fi
[ -b "$DEV" ] || { warn "$DEV is not a block device."; exit 1; }

parent="$(lsblk -no PKNAME "$DEV" 2>/dev/null | head -1)"; parent="${parent:-$(basename "$DEV")}"
if [ "$parent" = "$root_disk" ]; then warn "$DEV is on the system disk. Refusing."; exit 1; fi
if findmnt -rn -S "$DEV" >/dev/null 2>&1 || lsblk -nr -o MOUNTPOINT "$DEV" | grep -q .; then
  warn "$DEV (or a part of it) is currently mounted. Unmount it first:  sudo umount ${DEV}*"; exit 1
fi

fstype="$(lsblk -no FSTYPE "$DEV" | head -1)"
if [ "$fstype" = "ext4" ]; then
  say "$DEV already holds an ext4 filesystem. Using it as-is (your files stay)."
  PART="$DEV"
else
  warn "$DEV has filesystem '${fstype:-none}'. Immich and Jellyfin need a Linux filesystem (ext4)."
  echo "Formatting ERASES EVERYTHING on $DEV:"
  lsblk -o NAME,SIZE,FSTYPE,LABEL,MODEL "$DEV"
  read -r -p "To erase and format, type exactly:  ERASE $DEV   (anything else cancels): " CONFIRM
  [ "$CONFIRM" = "ERASE $DEV" ] || { echo "Cancelled. Nothing was changed."; exit 1; }
  read -r -p "Last chance. Type the device size shown above (for example 1.8T): " SIZE
  actual="$(lsblk -dno SIZE "$DEV" | tr -d ' ')"
  [ "$SIZE" = "$actual" ] || { echo "Size did not match ($actual). Cancelled."; exit 1; }
  if [ "$(lsblk -dno TYPE "$DEV")" = "disk" ]; then
    sudo wipefs -a "$DEV"
    sudo parted -s "$DEV" mklabel gpt mkpart primary ext4 0% 100%
    sudo partprobe "$DEV"; sleep 2
    PART="$(lsblk -nrpo NAME,TYPE "$DEV" | awk '$2=="part"{print $1; exit}')"
  else
    PART="$DEV"
  fi
  sudo mkfs.ext4 -F -L photos "$PART"
fi

UUID="$(sudo blkid -s UUID -o value "$PART")"
[ -n "$UUID" ] || { warn "Could not read the drive's UUID."; exit 1; }
say "Mounting $PART (UUID $UUID) at $MOUNT"
sudo mkdir -p "$MOUNT"
sudo sed -i "\|$MOUNT |d" /etc/fstab
echo "UUID=$UUID $MOUNT ext4 defaults,nofail,x-systemd.device-timeout=5 0 2" | sudo tee -a /etc/fstab >/dev/null
sudo systemctl daemon-reload
sudo mount -a
mountpoint -q "$MOUNT" || { warn "Mount failed. Check /etc/fstab."; exit 1; }
sudo mkdir -p "$MOUNT/immich" "$MOUNT/media" "$MOUNT/backups"
sudo chown -R "$USER":"$USER" "$MOUNT"
conf_set PHOTOS_DIR "$MOUNT"; conf_set PHOTOS_EXTERNAL yes; conf_set PHOTOS_UUID "$UUID"
say "Drive ready. Reminder: this drive holds the ONLY copy of your photos unless you also set up a second drive or cloud copy."
