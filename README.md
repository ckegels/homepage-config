# Homepage Config

[![CI](https://github.com/ckegels/homepage-config/actions/workflows/ci.yml/badge.svg)](https://github.com/ckegels/homepage-config/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ckegels/homepage-config)](https://github.com/ckegels/homepage-config/releases)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

A secure web UI for configuring [Homepage](https://github.com/gethomepage/homepage) (gethomepage.dev). Instead of editing YAML over SSH, you sign in, fill in forms and save. Homepage picks up the change on its next page load.

- **Every option in the docs as forms.** Settings, services, bookmarks, info widgets, layout and tabs, Docker, Kubernetes and Proxmox.
- **All 160+ service widgets.** Each has a form with its own options and the original documentation shown inline.
- **Icons.** Upload them, import from a URL, or browse Dashboard Icons, selfh.st, Material Design Icons and Simple Icons.
- **Raw file editor.** Live YAML validation, and your comments are kept. Covers `custom.css` and `custom.js` too.
- **Automatic backups.** Every save is backed up first, and you can restore any version with one click.
- **Homepage's environment.** Allowed hosts, password/OIDC login, MCP and `HOMEPAGE_VAR_*` secrets. On an LXC the UI edits Homepage's `.env` directly, and you can **restart Homepage** from the browser.
- **Secure login.** A one-time setup token, scrypt passwords, optional 2FA (TOTP), brute-force lockout, CSRF protection and a strict CSP. It runs unprivileged.

---

## Contents

1. [Choose an installation](#1-choose-an-installation)
2. [Install on a Proxmox LXC / Linux (no Docker)](#2-install-on-a-proxmox-lxc--linux-no-docker) ← recommended for an LXC
3. [Install with Docker](#3-install-with-docker)
4. [Install manually from source](#4-install-manually-from-source)
5. [First sign-in](#5-first-sign-in)
6. [Link it from Homepage](#6-link-it-from-homepage)
7. [Put it behind HTTPS (reverse proxy)](#7-put-it-behind-https-reverse-proxy)
8. [Icons: how they reach Homepage](#8-icons-how-they-reach-homepage)
9. [Settings reference](#9-settings-reference)
10. [Update, back up, uninstall](#10-update-back-up-uninstall)
11. [Troubleshooting](#11-troubleshooting)
12. [Security notes](#12-security-notes)
13. [Development](#13-development)

---

## 1. Choose an installation

| Your Homepage runs…                                   | Use                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| On an **LXC or VM with systemd**, from source (e.g. the Proxmox community script) | [Installer script](#2-install-on-a-proxmox-lxc--linux-no-docker): installs next to Homepage, no Docker |
| In **Docker**                                         | [Docker](#3-install-with-docker)                              |
| Somewhere else / you want full control                | [Manual](#4-install-manually-from-source)                     |

Homepage Config always runs **next to** Homepage and edits the same config folder. It doesn't replace or modify Homepage itself.

---

## 2. Install on a Proxmox LXC / Linux (no Docker)

Requirements:
- A Debian or Ubuntu system with systemd.
- Root access.
- Homepage installed from source. The defaults match the [Proxmox community script](https://community-scripts.github.io/ProxmoxVE/scripts?id=homepage): `/opt/homepage` and `homepage.service`.

Node.js 22 is installed automatically if it's missing (the community LXC already has it).

**Step 1: get the code onto the LXC.** Open a shell in the container (Proxmox → the LXC → Console, or `pct enter <id>`):

```bash
apt update && apt install -y git
git clone https://github.com/ckegels/homepage-config.git /root/homepage-config
cd /root/homepage-config
```

Without git, download the latest release instead:

```bash
mkdir -p /root/homepage-config && cd /root/homepage-config
curl -fsSL https://api.github.com/repos/ckegels/homepage-config/releases/latest \
  | grep -o '"tarball_url": *"[^"]*"' | cut -d'"' -f4 | xargs curl -fsSL | tar xz --strip-components=1
```

**Step 2: run the installer.**

```bash
./scripts/install-lxc.sh
```

The installer:

| Step | What happens |
| ---- | ------------ |
| Node.js | Checks for Node.js, installing v22 from NodeSource if needed |
| App files | Installs the app to `/opt/homepage-config` (read-only, owned by root) |
| User | Creates the system user **`homepage-config`**. The app runs as this user, never as root |
| Permissions | Gives that user's group write access to `/opt/homepage/config`, `/opt/homepage/public/icons` and `/opt/homepage/.env` only. Homepage keeps running as before |
| Settings | Writes `/etc/homepage-config/homepage-config.env` |
| Service | Creates `homepage-config.service` with systemd sandboxing (exposure score 3.0 "OK") |
| Restart button | Adds `homepage-config-restart.path`, which lets the UI restart `homepage.service` without the app having root rights |
| Output | Starts everything and prints the URL plus the **setup token** |

```
  Open:         http://192.168.1.50:3100
  Setup token:  cfodxnMCvtrFoXsQicaVwzCm
```

**Step 3:** continue with [First sign-in](#5-first-sign-in).

Homepage installed somewhere else? Pass the paths:

```bash
./scripts/install-lxc.sh \
  --homepage-dir /srv/homepage \
  --config-dir /srv/homepage/config \
  --icons-dir /srv/homepage/public/icons \
  --env-file /srv/homepage/.env \
  --homepage-service homepage.service \
  --port 3100
```

All installer options (`./scripts/install-lxc.sh --help`):

| Option | Default | Meaning |
| ------ | ------- | ------- |
| `--homepage-dir DIR` | `/opt/homepage` | Homepage install folder |
| `--config-dir DIR` | `<homepage-dir>/config` | Homepage config folder |
| `--icons-dir DIR` | `<homepage-dir>/public/icons` | Folder Homepage serves as `/icons/` |
| `--env-file FILE` | `<homepage-dir>/.env` | Homepage's environment file (edited from the UI) |
| `--homepage-service NAME` | `homepage.service` if it exists | Unit restarted by the Restart button |
| `--homepage-url URL` | `http://<ip>:3000` | Link to Homepage in the sidebar |
| `--port PORT` | `3100` | Port of this UI |
| `--install-dir DIR` | `/opt/homepage-config` | Where the app is installed |
| `--user NAME` | `homepage-config` | Service user |
| `--no-env-file` | | Don't let the UI edit Homepage's `.env` |
| `--no-restart` | | No Restart Homepage button |
| `--reconfigure` | | Rewrite `/etc/homepage-config/homepage-config.env` from the options |
| `--fix-permissions` | | Only re-apply folder permissions |
| `--uninstall [--purge]` | | Remove (with `--purge`: also account, backups, settings) |
| `-y` | | Don't ask questions |

Where things live:

| Path | Content |
| ---- | ------- |
| `/opt/homepage-config` | The app |
| `/etc/homepage-config/homepage-config.env` | Settings ([reference](#9-settings-reference)). Run `systemctl restart homepage-config` after editing |
| `/var/lib/homepage-config` | Admin account, signing key, backups, icon catalog cache |
| `journalctl -u homepage-config -f` | Logs |

> **Unprivileged LXC without "nesting":** some systemd sandboxing options may be unavailable. The installer detects this, turns the sandbox off and tells you. To keep it, enable *Options → Features → Nesting* on the LXC and re-run the installer.

---

## 3. Install with Docker

### 3a. Homepage and Homepage Config together (new setup)

```bash
git clone https://github.com/ckegels/homepage-config.git homepage-config && cd homepage-config
mkdir -p homepage/config homepage/icons homepage-config-data
sudo chown -R 1000:1000 homepage homepage-config-data
docker compose up -d
docker logs homepage-config          # → setup token
```

The compose file uses the published image `ghcr.io/ckegels/homepage-config` (amd64 and arm64). To build it yourself instead, swap `image:` for `build: .` in the compose file.

The included [`docker-compose.yml`](docker-compose.yml) runs both containers on shared folders:
- Homepage on port **3000**.
- Homepage Config on port **3100**: read-only, non-root, with all capabilities dropped.

Edit `HOMEPAGE_ALLOWED_HOSTS` in that file to include the address you use for Homepage.

### 3b. Next to an existing Homepage container

Give the config container **the same folders** that Homepage uses:

```yaml
services:
  homepage-config:
    image: ghcr.io/ckegels/homepage-config:latest
    container_name: homepage-config
    user: "1000:1000"                     # owner of Homepage's config folder (Homepage's PUID:PGID, or 0:0 if it runs as root)
    ports:
      - 3100:3100
    volumes:
      - /path/to/homepage/config:/app/config   # = Homepage's /app/config
      - /path/to/homepage/icons:/data/icons    # = Homepage's /app/public/icons
      - ./homepage-config-data:/data
    environment:
      HOMEPAGE_URL: https://home.example.com
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    restart: unless-stopped
```

Without Compose, the equivalent is:

```bash
docker run -d --name homepage-config --user 1000:1000 -p 3100:3100 \
  -v /path/to/homepage/config:/app/config -v /path/to/homepage/icons:/data/icons \
  -v homepage-config-data:/data --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --restart unless-stopped ghcr.io/ckegels/homepage-config:latest
```

In Docker mode, two features from the LXC install aren't available:
- The UI **generates** Homepage's environment variables for you to paste into its compose file, rather than editing them directly.
- There is **no Restart Homepage button.** Restart with `docker restart homepage`.

---

## 4. Install manually from source

For any OS with Node.js 20+ (22+ recommended):

```bash
git clone https://github.com/ckegels/homepage-config.git homepage-config && cd homepage-config
npm ci --omit=dev
CONFIG_DIR=/path/to/homepage/config \
DATA_DIR=/var/lib/homepage-config \
ICONS_DIR=/path/to/homepage/public/icons \
PORT=3100 \
node server/index.js
```

The user running it needs write access to `CONFIG_DIR` and `ICONS_DIR`, and should be the only user able to read `DATA_DIR`. To run it permanently, use a process manager, or copy the systemd unit the installer writes (`scripts/install-lxc.sh`, section "systemd"). Optional extras: `HOMEPAGE_ENV_FILE` and `HOMEPAGE_RESTART_TRIGGER` (see [settings](#9-settings-reference)).

---

## 5. First sign-in

1. Open `http://<host>:3100`.
2. Enter the **setup token**. The installer prints it, and it's also in `docker logs homepage-config`, `journalctl -u homepage-config` or `<data dir>/setup-token.txt`. The token stops anyone else on your network from claiming the admin account first.
3. Choose a username and a password of **at least 12 characters**.
4. Recommended: **Account & app → Two-factor authentication → Set up 2FA**, then scan the QR code with any authenticator app.
5. Under **Account & app → App settings**, check the **Homepage URL** and the **icon mode** ([section 8](#8-icons-how-they-reach-homepage)).

Forgot your password? Stop the service, delete `<data dir>/auth.json`, start it again, and use the new setup token. Your Homepage config is not touched.

---

## 6. Link it from Homepage

Add a tile once, either on the **Services** page of the UI or in `services.yaml`:

```yaml
- Admin:
    - Homepage Config:
        href: http://192.168.1.50:3100      # or https://config.example.com
        icon: mdi-cog
        description: Edit this dashboard
```

From then on everything is managed from the UI.

---

## 7. Put it behind HTTPS (reverse proxy)

The UI can read every API key in your config, so don't expose it to the internet without HTTPS. Better still, keep it LAN/VPN-only. Behind a proxy, add to the settings (`/etc/homepage-config/homepage-config.env` or the container environment):

```env
PUBLIC_URL=https://config.example.com
TRUST_PROXY=true
COOKIE_SECURE=true
```

Caddy:

```caddy
config.example.com {
  reverse_proxy 192.168.1.50:3100
}
```

nginx:

```nginx
server {
  listen 443 ssl;
  server_name config.example.com;
  # ssl_certificate ... ;
  location / {
    proxy_pass http://192.168.1.50:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    client_max_body_size 10m;
  }
}
```

Nginx Proxy Manager: add a proxy host to `http://<ip>:3100`, enable SSL, and set the three settings above.

---

## 8. Icons: how they reach Homepage

Icons uploaded in the UI are saved in Homepage's icons folder. Choose how services refer to them under **Account & app**:

| Mode | Reference written | New icon visible | Notes |
| ---- | ----------------- | ---------------- | ----- |
| **Local path** (default) | `/icons/name.png` | After Homepage restarts | Homepage only picks up new files in `public/icons` on start. On the LXC install, use the **Restart Homepage** button on the Icons page. In Docker, run `docker restart homepage`. |
| **Served by this app** | `https://config.example.com/icons/name.png` | Immediately | Visitors' browsers must reach this app's `/icons/` path, which is the only public path. |

Icons from Dashboard Icons, selfh.st, Material Design (`mdi-…`) and Simple Icons (`si-…`) need no upload. Homepage loads them from a CDN.

---

## 9. Settings reference

Set these in `/etc/homepage-config/homepage-config.env` (LXC) or as container environment variables.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `CONFIG_DIR` | `/app/config` (Docker) | Homepage's config folder |
| `DATA_DIR` | `/data` (Docker) | Account, signing key, backups, caches |
| `ICONS_DIR` | `$DATA_DIR/icons` | Uploaded icons, i.e. Homepage's `public/icons` |
| `PORT` | `3100` | Listen port |
| `HOST` | `0.0.0.0` | Listen address (`127.0.0.1` = only via a local reverse proxy) |
| `HOMEPAGE_URL` | | Homepage's address (sidebar link) |
| `HOMEPAGE_ENV_FILE` | | Homepage's `.env`. When set, the Environment page edits it directly |
| `HOMEPAGE_RESTART_TRIGGER` | | File watched by `homepage-config-restart.path`. When set, the Restart Homepage buttons appear |
| `PUBLIC_URL` | | External URL of this UI. Allows that origin and sets the default icon base URL |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers (behind a reverse proxy) |
| `COOKIE_SECURE` | `auto` | `auto` = Secure cookie when the request is HTTPS. `true` forces it |
| `SESSION_HOURS` | `12` | Sign-in lifetime |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / | Create the admin on first start instead of using the setup token. Remove the password afterwards |
| `BACKUPS_PER_FILE` | `50` | Backups kept per config file |
| `ALLOW_REMOTE_FETCH` | `true` | Allow icon catalogs and URL imports from the internet |

---

## 10. Update, back up, uninstall

**Update**

| Install | Command |
| ------- | ------- |
| LXC | `cd /root/homepage-config && git pull && ./scripts/install-lxc.sh`. Your account and settings are kept |
| Docker | `docker compose pull && docker compose up -d` |
| Homepage itself (community LXC) | Run its update as usual, then `./scripts/install-lxc.sh --fix-permissions` in case the update reset folder ownership |

**Back up:** the data folder (`/var/lib/homepage-config` or the `/data` volume) and Homepage's config folder. Every save in the UI also keeps the previous version under `<data dir>/backups/<file>/`, and you can restore those on the **Files** page.

**Uninstall**

| Install | Command |
| ------- | ------- |
| LXC | `./scripts/install-lxc.sh --uninstall` (add `--purge` to delete the account and backups). Homepage keeps running untouched |
| Docker | `docker compose down`, then delete the `homepage-config-data` folder |

---

## 11. Troubleshooting

| Problem | Fix |
| ------- | --- |
| Lost the setup token | `journalctl -u homepage-config` / `docker logs homepage-config`, or `cat <data dir>/setup-token.txt` |
| "Cannot write …" when saving | The app can't write Homepage's folder. LXC: `./scripts/install-lxc.sh --fix-permissions`. Docker: set `user:` to the folder owner |
| "Too many failed attempts" | Wait for the shown time (doubles per failure, max 1 h), or restart the service |
| New icon shows as broken | Local mode: restart Homepage (button on the Icons page). Or switch to "served by this app" |
| Changes don't show on Homepage | Reload the Homepage page. Homepage checks the files on every load. Errors appear on the **Overview** page |
| "Homepage rejected the host" | Add the host to `HOMEPAGE_ALLOWED_HOSTS` (Environment & auth page) |
| Service won't start on LXC | `journalctl -u homepage-config -n 50`. If it mentions NAMESPACE, enable nesting on the LXC or re-run the installer |
| Homepage won't start after an `.env` change | Fix or undo the value on the Environment page (a backup of `.env` is in `<data dir>/backups/homepage.env/`), then restart |

---

## 12. Security notes

- Anyone signed in to this UI can read every API key in your config and change `custom.js`, which runs in every Homepage visitor's browser. Use a strong password, turn on 2FA, and keep it on your LAN/VPN or behind HTTPS.
- Only `/icons/*` and the sign-in endpoints are reachable without signing in.
- Failed sign-ins are logged as `[auth] failed sign-in attempt from <ip>` (usable with fail2ban/CrowdSec).
- On the LXC install:
  - The app runs as an unprivileged, sandboxed user.
  - It can write only Homepage's config folder, icons folder and `.env`.
  - It restarts Homepage only by touching a trigger file that systemd watches.

---

## 13. Development

```bash
npm install
npm run dev      # http://localhost:3100 using ./dev/config and ./dev/data
npm test         # unit tests (node:test)
```

There's no build step. The frontend is plain ES modules (Preact + htm).

To refresh the service widget catalog after a Homepage release:

```bash
git clone --depth 1 https://github.com/gethomepage/homepage.git /tmp/homepage
npm run build:catalog -- /tmp/homepage
```

Architecture, processes, decisions and progress: [HANDOVER.md](HANDOVER.md).

Releases: push a tag `vX.Y.Z`. GitHub Actions runs the tests and publishes `ghcr.io/ckegels/homepage-config:X.Y.Z` and `:latest`.

---

## License

[GPL-3.0](LICENSE), the same license as Homepage.

This is an independent community project, not affiliated with the Homepage project. `data/widget-catalog.json` contains text generated from the [Homepage documentation](https://github.com/gethomepage/homepage/tree/main/docs) (© the Homepage contributors, GPL-3.0). Icon libraries are loaded from their own CDNs under their own licenses.
