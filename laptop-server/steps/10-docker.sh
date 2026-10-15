#!/usr/bin/env bash
# Docker from Ubuntu's own packages (older than Docker Inc.'s, but fine and low-risk).
set -euo pipefail
. "$HERE/steps/common.sh"

say "Installing Docker"
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true
sudo docker compose version
sudo docker run --rm hello-world >/dev/null && echo "Docker works."
echo "(You are in the 'docker' group after your next login; the installer uses sudo until then.)"
