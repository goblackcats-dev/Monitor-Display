# Monitor Display: project context

Always-on secondary display for an old Dell Inspiron 7577 (16 GB RAM, Wi-Fi, GTX 1050). Minimal, sleek dark UI.
Dependency-free Node 20+ backend (`server.js`, `lib/`) plus plain HTML/CSS/JS in `public/`, shown in Chromium kiosk mode.
Run `npm run demo` for fake data at http://127.0.0.1:8787. See README.md for setup.

## What exists
- Clock, Spotify now-playing and controls (PKCE auth, Premium), album-art accent colour.
- Claude Code usage from local `~/.claude/projects` JSONL logs (5h window, 7-day sparkline). Optional Anthropic/OpenAI API spend via admin keys (written from docs, untested against live keys).
- To-do tile filled by a Claude chat through an MCP endpoint at `/mcp/<secret>` (tools: list/add/set/complete/reopen/remove/clear). Secret is printed at startup or set via `MCP_TOKEN`. Not yet tried from a real claude.ai connector; needs a tunnel (Tailscale Funnel or cloudflared).
- Only the MCP path is reachable by non-local hostnames; everything else enforces a localhost/private-network Host check.

## Decisions made with the user
- No ChatGPT usage widget: no API for it, and the user rejected manual counters.
- No claude.ai usage scraping (cookie-based and fragile).
- The user reaches the Inspiron with Chrome Remote Desktop. On Linux CRD uses a separate virtual session, so plan to add RustDesk (attaches to the physical X11 screen), plus Tailscale and SSH.

## Plan (Linux not installed yet)
1. User buys a 16 GB USB stick, boots the Xubuntu LTS installer in Try mode, confirms Wi-Fi works (Qualcomm Killer 1535 / ath10k is likely), sets BIOS SATA to AHCI (Dell default is RAID), installs ("erase disk").
2. Then write `scripts/setup-linux.sh`: Node 22, systemd service, kiosk autostart, auto-login, no suspend or screen blank, lid ignore, Wi-Fi power-save off, Tailscale, RustDesk, Docker.
3. Optional later: Immich (phone photo backup; originals on an ext4 USB drive mounted by UUID with `nofail`, DB on the internal disk, scheduled copy to a second drive or cloud) and Jellyfin (movies, TV, music; separate folder on the same drive). Jellyfin cannot back up phone photos; Immich does that.
4. Known issue to fix: `scripts/kiosk.sh` keeps the Chromium profile in `~/.cache`, which the Ubuntu snap Chromium may block. Use a non-hidden folder or Firefox `--kiosk`.
5. Open questions: how big the photo/video library is (sizes the drive), whether the user wants Jellyfin, what they watch on, and whether to add a phone remote page for Spotify.

## Added since (running on a Raspberry Pi 3 at a desk)
- Header: today's high/low + symbol (Open-Meteo, `WEATHER_CITY` or lat/lon), next calendar event (`CALENDAR_ICS_URL`, Google "secret iCal address"; parsed in a worker thread, see `lib/calendar.js`), status dot (low power, throttling, heat, no internet, calendar errors), dims after sunset. Page reloads itself when the server restarts (`boot` in `/api/state`).
- Optional steps count pushed from an iPhone Shortcut to `/api/steps/<token>` (`scripts/steps-url.sh`). Optional "Watch" remote for the kiosk Chromium via its local DevTools port (`lib/cast.js`, `public/watch.html`); a Pi 3 is too weak for real streaming, so it is unused.
- Scripts: `setup-pi.sh` (one-shot Pi setup), `screen.sh` + `install-screen-schedule.sh` (weekday screen on/off through cron, Wayland `wlr-randr`), `sync-claude-logs.mjs` (boils laptop Claude Code logs down to usage lines and copies them to the Pi; run from a scheduled task), `set-env.sh` (enter secrets without them touching chat), `add-wifi.sh`.
- Pi 3 / Raspberry Pi OS (trixie, labwc/Wayland) gotchas: Chromium needs `--ozone-platform=wayland`, `--password-store=basic` (avoids a keyring prompt with no keyboard) and `--deny-permission-prompts`; `/api/state` must never wait on slow work (a calendar parse once froze it); the Pi has no RTC and a weak PSU shows as "low power".
- Plan change: Immich/Jellyfin and friends go on the Inspiron at home (see plan above); the Pi 3 stays as the work dashboard.
