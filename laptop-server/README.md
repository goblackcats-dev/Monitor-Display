# Laptop server bundle (Dell Inspiron 7577)

Turns a fresh Xubuntu LTS install into a small home server: Immich (phone photo backup), Jellyfin (media),
Pi-hole (ad blocking), Uptime Kuma (status page), Tailscale (remote access), Bluetooth speaker, nightly backups,
and optionally the Monitor Display dashboard.

> **Status: untested.** Written without access to the laptop. Expect to fix small things on first run. Every step
> is safe to re-run on its own (`bash install.sh --only 40-stack`). The log is `~/laptop-server-install.log`.

## Stage 1: install Linux (about 20 minutes, you click)
1. **Back up anything you care about on the laptop.** The installer option "Erase disk" wipes it.
2. On another computer, download the **Xubuntu 24.04 LTS** ISO from xubuntu.org and write it to a USB stick
   (16 GB) with Rufus (Windows) or Balena Etcher. This stick is only the installer.
3. On the Inspiron: press **F2** at the Dell logo, open BIOS, set **SATA Operation = AHCI** (it ships as RAID,
   and Linux will not see the drive). Save and reboot with the USB stick in (**F12** for the boot menu).
4. Choose **Try Xubuntu** first. Check Wi-Fi connects (the Killer card usually works) and that the touchpad,
   sound and screen are fine. Then double-click **Install Xubuntu**, pick **Erase disk and install**, and set your name,
   computer name (for example `server`) and password.
5. After the reboot, connect to Wi-Fi (or plug in Ethernet, which is better), and run **Software Updater**.

## Stage 2: this bundle (about 30–60 minutes, mostly waiting)
Get the files onto the laptop in either way:
- **From GitHub** (needs internet anyway): `git clone -b pi-dashboard-updates https://github.com/goblackcats-dev/Monitor-Display.git`
  then `cd Monitor-Display/laptop-server`
- **From a USB stick**: copy the `laptop-server` folder (and, for the dashboard, the whole project folder) onto a
  second, ordinary USB stick, plug it in, and copy the folder to your home directory.

Then:

```bash
cd laptop-server
bash install.sh                  # everything except the dashboard
# DASHBOARD=1 bash install.sh    # also the dashboard on this screen (needs the whole repo, not just this folder)
```

It asks you to: sign in to Tailscale (a web address appears, open it on your phone), choose the external drive
(**it never formats anything unless you type `ERASE /dev/...` and the drive size**), and optionally pair the speaker.
At the end it prints the addresses and the short manual list. Needs internet the whole time: Docker images are
several GB, so the first run takes a while.

## What each step does
| Step | Does |
|---|---|
| `00-base` | updates, SSH, no sleep, lid closed is fine, Wi-Fi power-save off, auto security updates, timezone (`TZ_NAME`, default America/Chicago) |
| `10-docker` | Docker + Compose from Ubuntu's packages |
| `20-tailscale` | Tailscale from its official apt repo, then sign-in |
| `30-drive` | choose/mount the external drive at `/srv/photos` by UUID (`nofail`) |
| `40-stack` | Immich (project's own compose file, DB on the internal disk, photos on the external drive), Jellyfin, Pi-hole, Uptime Kuma |
| `50-audio` | Bluetooth + PipeWire, optional speaker pairing |
| `60-dashboard` | optional: Node, the dashboard service, Firefox kiosk at login |
| `70-backup` | nightly dumps of the databases and settings; mirror to a second drive if mounted at `/srv/backup` |

## Backups (read this)
Immich is **not** a backup; it is where your photos live. If `/srv/photos` is the only copy and the drive dies,
the photos are gone. Add a second drive mounted at `/srv/backup` (the nightly job then mirrors photos, media and
database dumps there without ever deleting), or a cloud copy. Test a restore once before you trust it.
Run a backup by hand: `sudo laptop-server-backup`.

## Running it closed and screenless
- `00-base` sets automatic login and "linger", so Bluetooth audio and other user services come back after a reboot
  with nobody logged in at the screen. The dashboard (`60-dashboard`) is off by default and not needed.
- Manage it from another device: `ssh <you>@<laptop-name>.local`, or over Tailscale from anywhere. Web pages for
  Immich/Jellyfin/Pi-hole/Uptime Kuma work from any browser on your network.
- BIOS: set **AC Behavior = Wake on AC** (Power Management) so it restarts after a power cut. Keep the vents clear;
  check `sensors` after a heavy Immich import, which runs the CPU hard.
- Reboot test before you rely on it: close the lid, `sudo reboot` over SSH, and confirm everything comes back
  (Immich page loads, speaker reconnects).

## Notes and caveats
- **Pi-hole and your router.** Only devices that use it get ad blocking. Put this laptop's address as DNS 1 on the
  router and `1.1.1.1` as DNS 2, and reserve a fixed address for the laptop. Wired Ethernet is strongly advised.
- **Battery.** A swollen battery is a fire risk: remove it. Without one, keep the original Dell charger (some Dell
  laptops slow the CPU if the charger is not recognised) and consider a small UPS.
- **GPU transcoding** for Jellyfin (GTX 1050) is not set up; 1080p playback works on the CPU. Ask later.
- **Left out on purpose, add later:** Vaultwarden (needs HTTPS to work in browsers; use `tailscale serve`),
  Paperless-ngx, Home Assistant, Claude Code on the laptop (its own installer; sign in once).
- Passwords: Immich's database password and the Pi-hole password are generated and stored in `/opt/immich/.env` and
  `/opt/pihole/.env` (root-readable only for the first, your user for both). The backup archive contains them.
