# Monitor Display

A minimal, always-on dashboard for an old laptop used as a second screen: a big clock, Spotify now-playing with controls, Claude usage, and a to-do list that a Claude chat fills in. Zero npm dependencies (Node 20+). The UI is plain HTML/CSS/JS shown in Chromium kiosk mode.

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

ChatGPT usage is intentionally not shown: there is no API for it, and a manual counter goes stale. Claude.ai plan-limit scraping is also left out: it would need your session cookie and breaks whenever the page changes.

## To-do list filled by a Claude chat
The dashboard serves a small MCP server at `/mcp/<secret>` (the secret is printed at startup, or set `MCP_TOKEN`). Add it to Claude as a custom connector and any chat can manage the list: *"add these to my to-do list"*, *"mark the vendor contract one done"*, *"replace my list with this plan"*. Tools: `list_todos`, `add_todos`, `set_todos`, `complete_todo`, `reopen_todo`, `remove_todo`, `clear_done`. You can also tap an item on the display to check it off.

claude.ai reaches connectors from the internet, so the Inspiron needs an HTTPS URL for that one path:
1. Expose the port with a tunnel, e.g. `tailscale funnel 8787` or `cloudflared tunnel --url http://localhost:8787`.
2. In claude.ai: Settings → Connectors → Add custom connector → `https://<your-tunnel-host>/mcp/<secret>`.

Security: the secret in the URL is the only credential for that path, so treat the URL like a password (rotate it by changing `MCP_TOKEN`). Every other route still refuses non-local hostnames, so the tunnel exposes nothing but the to-do tools. Claude Desktop/Code on your LAN can use the same URL without a tunnel.

## Kiosk on the Inspiron
1. Install Ubuntu/Debian minimal + `chromium`, Node 20+.
2. Copy `scripts/monitor-display.service` to systemd (edit paths) for the backend.
3. Autostart `scripts/kiosk.sh` on login (autologin + your desktop's autostart, or `cage -- scripts/kiosk.sh`).
4. Laptop tips: set `HandleLidSwitch=ignore` in `/etc/systemd/logind.conf`; cap battery charge ~80% in BIOS; disable screen blanking.

## Notes
- The server accepts requests only from localhost / private-network hostnames and only POSTs for state changes. It is meant for your LAN, not the internet.
- Controls and cursor fade after 8s of inactivity; the layout drifts a few pixels over time.
