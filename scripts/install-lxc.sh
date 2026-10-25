#!/usr/bin/env bash
# Install / update / uninstall Homepage Config on a Debian/Ubuntu LXC or VM
# where Homepage runs from source under systemd (e.g. the Proxmox community
# script: /opt/homepage, homepage.service). No Docker needed.
#
#   sudo ./scripts/install-lxc.sh                 # install or update
#   sudo ./scripts/install-lxc.sh --help          # all options
#   sudo ./scripts/install-lxc.sh --uninstall [--purge]
set -euo pipefail

# ---------- defaults ----------
HOMEPAGE_DIR=/opt/homepage
CONFIG_DIR=""
ICONS_DIR=""
ENV_FILE=""
HOMEPAGE_SERVICE=""
HOMEPAGE_URL=""
PORT=3100
INSTALL_DIR=/opt/homepage-config
APP_USER=homepage-config
ETC_DIR=/etc/homepage-config
STATE_DIR=/var/lib/homepage-config
USE_ENV_FILE=1
USE_RESTART=1
RECONFIGURE=0
FIX_PERMS_ONLY=0
UNINSTALL=0
PURGE=0
ASSUME_YES=0

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<EOF
Usage: sudo $0 [options]

Paths (defaults match the Proxmox community Homepage LXC):
  --homepage-dir DIR      Homepage install folder            (default: /opt/homepage)
  --config-dir DIR        Homepage config folder             (default: <homepage-dir>/config)
  --icons-dir DIR         Folder Homepage serves as /icons   (default: <homepage-dir>/public/icons)
  --env-file FILE         Homepage .env to edit from the UI  (default: <homepage-dir>/.env)
  --homepage-service NAME systemd unit to restart from the UI (default: homepage.service if present)
  --homepage-url URL      Where you open Homepage            (default: http://<this-ip>:3000)

This app:
  --port PORT             Listen port                        (default: 3100)
  --install-dir DIR       Where the app is installed         (default: /opt/homepage-config)
  --user NAME             System user to run as              (default: homepage-config)

Features:
  --no-env-file           Don't let the UI edit Homepage's .env
  --no-restart            Don't add the "Restart Homepage" button (no path unit)
  --reconfigure           Rewrite $ETC_DIR/homepage-config.env from these options
  --fix-permissions       Only re-apply folder permissions (e.g. after a Homepage update)

  --uninstall             Remove the service and app (keeps $STATE_DIR)
  --purge                 With --uninstall: also delete account, backups and settings
  -y, --yes               Don't ask for confirmation
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --homepage-dir) HOMEPAGE_DIR="$2"; shift 2 ;;
    --config-dir) CONFIG_DIR="$2"; shift 2 ;;
    --icons-dir) ICONS_DIR="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --homepage-service) HOMEPAGE_SERVICE="$2"; shift 2 ;;
    --homepage-url) HOMEPAGE_URL="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --user) APP_USER="$2"; shift 2 ;;
    --no-env-file) USE_ENV_FILE=0; shift ;;
    --no-restart) USE_RESTART=0; shift ;;
    --reconfigure) RECONFIGURE=1; shift ;;
    --fix-permissions) FIX_PERMS_ONLY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge) PURGE=1; shift ;;
    -y | --yes) ASSUME_YES=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

CONFIG_DIR="${CONFIG_DIR:-$HOMEPAGE_DIR/config}"
ICONS_DIR="${ICONS_DIR:-$HOMEPAGE_DIR/public/icons}"
ENV_FILE="${ENV_FILE:-$HOMEPAGE_DIR/.env}"
APP_GROUP="$APP_USER"
UNIT=homepage-config.service

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m ✗\033[0m %s\n' "$*" >&2; exit 1; }
confirm() {
  [[ $ASSUME_YES -eq 1 ]] && return 0
  read -r -p "$1 [y/N] " a
  [[ "$a" =~ ^[Yy] ]]
}

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
command -v systemctl >/dev/null || die "systemd is required."

# ---------- uninstall ----------
if [[ $UNINSTALL -eq 1 ]]; then
  confirm "Remove Homepage Config from this machine?" || exit 1
  systemctl disable --now "$UNIT" homepage-config-restart.path 2>/dev/null || true
  rm -f /etc/systemd/system/$UNIT /etc/systemd/system/homepage-config-restart.{path,service}
  rm -rf /etc/systemd/system/$UNIT.d
  systemctl daemon-reload
  rm -rf "$INSTALL_DIR"
  ok "Service and app removed."
  if [[ $PURGE -eq 1 ]]; then
    rm -rf "$STATE_DIR" "$ETC_DIR"
    userdel "$APP_USER" 2>/dev/null || true
    ok "Account, backups and settings deleted."
  else
    warn "Kept $STATE_DIR and $ETC_DIR (use --purge to delete)."
  fi
  warn "Homepage's folders keep group '$APP_GROUP' permissions; that is harmless."
  exit 0
fi

# ---------- permissions (shared by install and --fix-permissions) ----------
# Homepage keeps running as its own user (root on the community LXC). This app
# gets access through a shared group with setgid folders, nothing more.
apply_permissions() {
  mkdir -p "$CONFIG_DIR" "$ICONS_DIR"
  for d in "$CONFIG_DIR" "$ICONS_DIR"; do
    chgrp -R "$APP_GROUP" "$d"
    chmod -R g+rwX "$d"
    find "$d" -type d -exec chmod g+s {} +
  done
  if [[ $USE_ENV_FILE -eq 1 ]]; then
    [[ -f "$ENV_FILE" ]] || install -m 0660 /dev/null "$ENV_FILE"
    chgrp "$APP_GROUP" "$ENV_FILE"
    chmod 0660 "$ENV_FILE" # contains secrets: owner + this app only
  fi
  ok "Permissions: group '$APP_GROUP' can edit $CONFIG_DIR and $ICONS_DIR$([[ $USE_ENV_FILE -eq 1 ]] && echo " and $ENV_FILE")"
}

if [[ $FIX_PERMS_ONLY -eq 1 ]]; then
  getent group "$APP_GROUP" >/dev/null || die "Group $APP_GROUP does not exist. Install first."
  apply_permissions
  exit 0
fi

# ---------- checks ----------
[[ -f "$SRC_DIR/package.json" && -f "$SRC_DIR/server/index.js" ]] || die "Run this from a checkout of the Homepage Config repository."
if [[ ! -d "$CONFIG_DIR" ]]; then
  warn "Homepage config folder $CONFIG_DIR does not exist."
  confirm "Create it anyway?" || die "Pass --config-dir to point at Homepage's config folder."
fi

if [[ -z "$HOMEPAGE_SERVICE" ]] && systemctl list-unit-files homepage.service >/dev/null 2>&1 && systemctl cat homepage.service >/dev/null 2>&1; then
  HOMEPAGE_SERVICE=homepage.service
fi
if [[ $USE_RESTART -eq 1 && -z "$HOMEPAGE_SERVICE" ]]; then
  warn "No homepage.service found; the Restart Homepage button is disabled (use --homepage-service NAME)."
  USE_RESTART=0
fi
if [[ $USE_ENV_FILE -eq 1 && ! -f "$ENV_FILE" && ! -d "$(dirname "$ENV_FILE")" ]]; then
  warn "No folder for $ENV_FILE; editing Homepage's .env is disabled."
  USE_ENV_FILE=0
fi
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
IP="${IP:-localhost}"
HOMEPAGE_URL="${HOMEPAGE_URL:-http://$IP:3000}"

# ---------- Node.js ----------
# This app needs Node 20+. Homepage itself needs Node 22+, so when Node has to be
# installed we always use NodeSource 22 (Debian's own package may be older).
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if ! command -v node >/dev/null || [[ "$(node_major)" -lt 20 ]]; then
  info "Installing Node.js 22 (NodeSource)"
  command -v apt-get >/dev/null || die "Install Node.js 22 manually, then re-run."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg >/dev/null
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
elif [[ "$(node_major)" -lt 22 ]]; then
  warn "Node.js $(node -v) works for this app, but current Homepage releases need Node 22+."
fi
command -v npm >/dev/null || { command -v apt-get >/dev/null && apt-get install -y -qq npm >/dev/null; }
command -v npm >/dev/null || die "npm is missing. Install it and re-run."
NODE_BIN="$(command -v node)"
ok "Node.js $("$NODE_BIN" -v)"

# ---------- user ----------
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$APP_USER"
  ok "Created system user $APP_USER"
fi

# ---------- app files ----------
info "Installing app to $INSTALL_DIR"
UPDATING=0
systemctl is-active --quiet "$UNIT" 2>/dev/null && UPDATING=1
mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/server" "$INSTALL_DIR/public" "$INSTALL_DIR/data" "$INSTALL_DIR/scripts"
tar -C "$SRC_DIR" -cf - package.json package-lock.json server public data/widget-catalog.json scripts README.md HANDOVER.md 2>/dev/null | tar -C "$INSTALL_DIR" -xf -
(cd "$INSTALL_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
chown -R root:root "$INSTALL_DIR"
chmod -R a+rX,go-w "$INSTALL_DIR"
ok "App files installed (owned by root, read-only for the service)"

# ---------- state + config ----------
install -d -m 0750 -o "$APP_USER" -g "$APP_GROUP" "$STATE_DIR"
install -d -m 0750 -o root -g "$APP_GROUP" "$ETC_DIR"
apply_permissions

ENV_CONF="$ETC_DIR/homepage-config.env"
if [[ ! -f "$ENV_CONF" || $RECONFIGURE -eq 1 ]]; then
  cat >"$ENV_CONF" <<EOF
# Homepage Config settings. Restart after changes: systemctl restart $UNIT
PORT=$PORT
CONFIG_DIR=$CONFIG_DIR
DATA_DIR=$STATE_DIR
ICONS_DIR=$ICONS_DIR
HOMEPAGE_URL=$HOMEPAGE_URL
$([[ $USE_ENV_FILE -eq 1 ]] && echo "HOMEPAGE_ENV_FILE=$ENV_FILE" || echo "# HOMEPAGE_ENV_FILE=$ENV_FILE")
$([[ $USE_RESTART -eq 1 ]] && echo "HOMEPAGE_RESTART_TRIGGER=$STATE_DIR/restart-homepage" || echo "# HOMEPAGE_RESTART_TRIGGER=$STATE_DIR/restart-homepage")

# Behind a reverse proxy (HTTPS):
# PUBLIC_URL=https://config.example.com
# TRUST_PROXY=true
# COOKIE_SECURE=true

# SESSION_HOURS=12
# BACKUPS_PER_FILE=50
# ALLOW_REMOTE_FETCH=true
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=          # optional: skip the setup screen (remove after first start)
EOF
  chown root:"$APP_GROUP" "$ENV_CONF"
  chmod 0640 "$ENV_CONF"
  ok "Wrote $ENV_CONF"
else
  ok "Kept existing $ENV_CONF (use --reconfigure to rewrite it)"
fi

# Read back what the service will actually use (the file may have been edited).
conf() { sed -n "s/^$1=//p" "$ENV_CONF" | tail -1; }
EFF_PORT="$(conf PORT)"; EFF_PORT="${EFF_PORT:-3100}"
EFF_TRIGGER="$(conf HOMEPAGE_RESTART_TRIGGER)"
EFF_ENV_FILE="$(conf HOMEPAGE_ENV_FILE)"

# ---------- systemd ----------
cat >/etc/systemd/system/$UNIT <<EOF
[Unit]
Description=Homepage Config (web UI for gethomepage)
Documentation=file://$INSTALL_DIR/README.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_CONF
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $INSTALL_DIR/server/index.js
Restart=on-failure
RestartSec=3
# Files this app creates stay editable by the shared group.
UMask=0002

[Install]
WantedBy=multi-user.target
EOF

# Sandboxing lives in a drop-in so it can be dropped on hosts that don't support it.
mkdir -p /etc/systemd/system/$UNIT.d
cat >/etc/systemd/system/$UNIT.d/hardening.conf <<EOF
[Service]
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
SystemCallArchitectures=native
ReadWritePaths=-$CONFIG_DIR -$ICONS_DIR -$STATE_DIR$([[ -n "$EFF_ENV_FILE" ]] && echo " -$EFF_ENV_FILE")
EOF

if [[ -n "$EFF_TRIGGER" && -n "$HOMEPAGE_SERVICE" ]]; then
  # Writing the trigger file makes systemd (not this app) restart Homepage.
  cat >/etc/systemd/system/homepage-config-restart.path <<EOF
[Unit]
Description=Restart Homepage when Homepage Config asks for it

[Path]
PathChanged=$EFF_TRIGGER
Unit=homepage-config-restart.service

[Install]
WantedBy=multi-user.target
EOF
  cat >/etc/systemd/system/homepage-config-restart.service <<EOF
[Unit]
Description=Restart Homepage (requested from Homepage Config)

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl restart $HOMEPAGE_SERVICE
EOF
  touch "$EFF_TRIGGER"
  chown "$APP_USER:$APP_GROUP" "$EFF_TRIGGER"
  systemctl daemon-reload
  systemctl enable --now -q homepage-config-restart.path
  ok "Restart button enabled (restarts $HOMEPAGE_SERVICE)"
else
  systemctl disable --now -q homepage-config-restart.path 2>/dev/null || true
  rm -f /etc/systemd/system/homepage-config-restart.{path,service}
fi

systemctl daemon-reload
systemctl enable -q "$UNIT"
systemctl restart "$UNIT"
sleep 2
if ! systemctl is-active --quiet "$UNIT"; then
  if journalctl -u "$UNIT" -n 30 --no-pager 2>/dev/null | grep -qE "NAMESPACE|226/|Permission denied.*namespace"; then
    warn "This container doesn't support systemd sandboxing (common in unprivileged LXC without nesting)."
    warn "Disabling the sandbox drop-in. Enable 'nesting' on the LXC to keep it."
    rm -f /etc/systemd/system/$UNIT.d/hardening.conf
    systemctl daemon-reload
    systemctl restart "$UNIT"
    sleep 2
  fi
fi
systemctl is-active --quiet "$UNIT" || {
  journalctl -u "$UNIT" -n 30 --no-pager || true
  die "Service failed to start. See the log above."
}
ok "Service $UNIT is running"

# ---------- done ----------
echo
if [[ -f "$STATE_DIR/setup-token.txt" ]]; then
  echo "  Open:         http://$IP:$EFF_PORT"
  echo "  Setup token:  $(cat "$STATE_DIR/setup-token.txt")"
  echo "  (also in $STATE_DIR/setup-token.txt and: journalctl -u $UNIT)"
else
  echo "  Open: http://$IP:$EFF_PORT  $([[ $UPDATING -eq 1 ]] && echo "(updated, your account is unchanged)")"
fi
echo
echo "  Settings:  $ENV_CONF"
echo "  Logs:      journalctl -u $UNIT -f"
echo "  Update:    git pull && sudo $0"
echo
