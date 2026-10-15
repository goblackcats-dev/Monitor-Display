#!/usr/bin/env bash
# Tailscale from its official apt repository (the documented manual method, no piped installer).
set -euo pipefail
. "$HERE/steps/common.sh"
. /etc/os-release

say "Adding the Tailscale package repository for ${VERSION_CODENAME}"
curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.noarmor.gpg" \
  | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.tailscale-keyring.list" \
  | sudo tee /etc/apt/sources.list.d/tailscale.list >/dev/null
sudo apt-get update
sudo apt-get install -y tailscale
sudo systemctl enable --now tailscaled

if sudo tailscale status >/dev/null 2>&1; then
  say "Tailscale is already signed in."
else
  say "Signing in. A web address appears below: open it on your phone or another computer and log in."
  echo "(Waits up to 5 minutes. If it times out: sudo tailscale up, then re-run this step.)"
  sudo timeout 300 tailscale up || warn "Not signed in yet. Run 'sudo tailscale up' later."
fi
