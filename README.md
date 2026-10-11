# Monitor Display

A minimal, always-on dashboard for an old laptop used as a second screen: a big clock, Spotify now-playing with controls, and Claude / ChatGPT usage. Zero npm dependencies (Node 20+). The UI is plain HTML/CSS/JS shown in Chromium kiosk mode.

```
npm run demo        # fake data, open http://127.0.0.1:8787
```

## Setup

```
cp .env.example .env     # fill in what you use; everything is optional
npm start
```

### Spotify (Premium)
1. Create an app at <https://developer.spotify.com/dashboard>, add redirect URI `http://127.0.0.1:8787/auth/spotify/callback`.
2. Put the Client ID in `.env` (PKCE flow, no secret needed).
3. On the display machine open the dashboard and click **Connect Spotify**.

It controls whichever device is currently playing. To make the display machine itself a speaker, install `spotifyd` or `librespot` on it; it then shows up as a Spotify Connect device.

### Usage widgets: what is real and what isn't
| Widget | Source | Notes |
|---|---|---|
| Claude Code 5h window / 7 days | Local `~/.claude/projects/**/*.jsonl` | Counts input + output + cache-creation tokens, deduped. Only sees logs on the machine it runs on: sync your work laptop's logs (Syncthing/rsync) and list the dirs in `CLAUDE_LOG_DIRS`. Set `CLAUDE_5H_LIMIT_TOKENS` to turn the ring into % of a budget you choose; otherwise it shows time elapsed in the window. The 5h window logic mirrors `ccusage` and is an approximation of Anthropic's own limit accounting. |
| Anthropic API spend | Admin API `cost_report` | Needs `ANTHROPIC_ADMIN_KEY`. Written from the docs, **untested against a live key**. |
| OpenAI API spend | `/v1/organization/costs` | Needs `OPENAI_ADMIN_KEY`. **Untested against a live key.** |
| ChatGPT plan | Manual counter | No official usage API exists. Bump it with `curl -X POST "localhost:8787/api/chatgpt/add?n=1"` (bind it to a hotkey/shortcut on your main laptop). |

Claude.ai plan-limit scraping is intentionally not included: it would need your session cookie and breaks whenever the page changes.

## Kiosk on the Inspiron
1. Install Ubuntu/Debian minimal + `chromium`, Node 20+.
2. Copy `scripts/monitor-display.service` to systemd (edit paths) for the backend.
3. Autostart `scripts/kiosk.sh` on login (autologin + your desktop's autostart, or `cage -- scripts/kiosk.sh`).
4. Laptop tips: set `HandleLidSwitch=ignore` in `/etc/systemd/logind.conf`; cap battery charge ~80% in BIOS; disable screen blanking.

## Notes
- The server accepts requests only from localhost / private-network hostnames and only POSTs for state changes. It is meant for your LAN, not the internet.
- Controls and cursor fade after 8s of inactivity; the layout drifts a few pixels over time.
