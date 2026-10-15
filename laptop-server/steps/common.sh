# Shared helpers, sourced by each step.
say()  { printf '\n-> %s\n' "$*"; }
warn() { printf '\n!! %s\n' "$*" >&2; }
ask_yn() { # ask_yn "question" default(y|n)
  local def="${2:-n}" a
  read -r -p "$1 [$( [ "$def" = y ] && echo Y/n || echo y/N )] " a || true
  a="${a:-$def}"; [[ "$a" =~ ^[Yy] ]]
}
conf_get() { [ -f "$LAPTOP_SERVER_CONF" ] && sed -n "s/^$1=//p" "$LAPTOP_SERVER_CONF" | tail -1 || true; }
conf_set() { # conf_set KEY VALUE (kept in /etc/laptop-server.conf, root-owned, world-readable, no secrets)
  sudo touch "$LAPTOP_SERVER_CONF"
  sudo sed -i "/^$1=/d" "$LAPTOP_SERVER_CONF"
  echo "$1=$2" | sudo tee -a "$LAPTOP_SERVER_CONF" >/dev/null
}
lan_ip() { hostname -I | awk '{print $1}'; }
rand() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "${1:-24}"; }
dc() { sudo docker compose "$@"; }
TZ_NAME="${TZ_NAME:-America/Chicago}"
