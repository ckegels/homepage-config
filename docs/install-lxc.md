# Install on a Proxmox LXC / Linux (no Docker)

← [Back to README](../README.md)

Use this when Homepage runs **from source under systemd**, for example via the [Proxmox community script](https://community-scripts.github.io/ProxmoxVE/scripts?id=homepage) (`/opt/homepage`, `homepage.service`). Homepage Config is installed next to it. Homepage itself is not changed.

**Requirements:** Debian or Ubuntu with systemd, and root access. Node.js 22 is installed automatically if it's missing.

## 1. Get the code

Open a shell in the container (Proxmox → the LXC → *Console*, or `pct enter <id>`).

**With git:**

```bash
apt update && apt install -y git
git clone https://github.com/ckegels/homepage-config.git /root/homepage-config
cd /root/homepage-config
```

**Without git** (latest release, uses curl + tar):

```bash
mkdir -p /root/homepage-config && cd /root/homepage-config
curl -fsSL https://api.github.com/repos/ckegels/homepage-config/releases/latest \
  | grep -o '"tarball_url": *"[^"]*"' | cut -d'"' -f4 | xargs curl -fsSL | tar xz --strip-components=1
```

> `404 Not Found` from apt? Your package lists are outdated. Run `apt update` first.

## 2. Run the installer

```bash
./scripts/install-lxc.sh
```

It prints the address and a **setup token**:

```
  Open:         http://192.168.1.50:3100
  Setup token:  cfodxnMCvtrFoXsQicaVwzCm
```

Continue with [First sign-in](configuration.md#first-sign-in).

### What the installer does

| Step | Details |
| ---- | ------- |
| Node.js | Installs v22 (NodeSource) if Node is missing or older than 20 |
| App | Installs to `/opt/homepage-config` (owned by root, read-only for the service) |
| User | Creates the system user `homepage-config`. The app never runs as root |
| Permissions | Gives that user's group write access to `/opt/homepage/config`, `/opt/homepage/public/icons` and `/opt/homepage/.env` only |
| Service | `homepage-config.service` with systemd sandboxing |
| Restart button | `homepage-config-restart.path` lets the UI restart `homepage.service` without root rights |

LXC-only features:
- A **Restart Homepage** button, needed after adding new local icons.
- **Direct editing of Homepage's `.env`** (allowed hosts, login, secrets) on the *Environment & auth* page.

### Different paths?

```bash
./scripts/install-lxc.sh \
  --homepage-dir /srv/homepage \
  --config-dir /srv/homepage/config \
  --icons-dir /srv/homepage/public/icons \
  --env-file /srv/homepage/.env \
  --homepage-service homepage.service \
  --port 3100
```

| Option | Default | Meaning |
| ------ | ------- | ------- |
| `--homepage-dir DIR` | `/opt/homepage` | Homepage install folder |
| `--config-dir DIR` | `<homepage-dir>/config` | Homepage config folder |
| `--icons-dir DIR` | `<homepage-dir>/public/icons` | Folder Homepage serves as `/icons/` |
| `--env-file FILE` | `<homepage-dir>/.env` | Homepage's environment file |
| `--homepage-service NAME` | `homepage.service` if present | Unit restarted by the Restart button |
| `--homepage-url URL` | `http://<ip>:3000` | Link to Homepage in the sidebar |
| `--port PORT` | `3100` | Port of this UI |
| `--install-dir DIR` | `/opt/homepage-config` | Install location |
| `--user NAME` | `homepage-config` | Service user |
| `--no-env-file` | | Don't let the UI edit Homepage's `.env` |
| `--no-restart` | | No Restart Homepage button |
| `--reconfigure` | | Rewrite the settings file from these options |
| `--fix-permissions` | | Only re-apply folder permissions |
| `--uninstall [--purge]` | | Remove the app (`--purge` also deletes the account and backups) |
| `-y` | | Don't ask questions |

## Where things live

| Path | Content |
| ---- | ------- |
| `/etc/homepage-config/homepage-config.env` | [Settings](configuration.md#settings-reference). Run `systemctl restart homepage-config` after editing |
| `/var/lib/homepage-config` | Admin account, signing key, backups, caches |
| `/opt/homepage-config` | The app |
| `journalctl -u homepage-config -f` | Logs |

## Update

```bash
cd /root/homepage-config
git pull                     # or download the release again (step 1)
./scripts/install-lxc.sh     # keeps your account and settings
```

After **updating Homepage** with the community script, re-apply permissions in case they were reset:

```bash
/root/homepage-config/scripts/install-lxc.sh --fix-permissions
```

## Uninstall

```bash
/root/homepage-config/scripts/install-lxc.sh --uninstall           # keeps account/backups
/root/homepage-config/scripts/install-lxc.sh --uninstall --purge   # removes everything
```

Homepage keeps running untouched.

## LXC notes

- **Unprivileged LXC without "nesting":** some systemd sandboxing options may be unavailable. The installer detects this, turns the sandbox off and warns you. To keep it, enable *Options → Features → Nesting* and re-run the installer.
- More help: [Troubleshooting](troubleshooting.md).
