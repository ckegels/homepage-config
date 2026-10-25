# Install manually from source

← [Back to README](../README.md)

For any OS with **Node.js 20+** (22+ recommended), when neither the LXC installer nor Docker fits.

```bash
git clone https://github.com/ckegels/homepage-config.git && cd homepage-config
npm ci --omit=dev

CONFIG_DIR=/path/to/homepage/config \
ICONS_DIR=/path/to/homepage/public/icons \
DATA_DIR=/var/lib/homepage-config \
PORT=3100 \
node server/index.js
```

The setup token is printed to the console. Continue with [First sign-in](configuration.md#first-sign-in).

## Permissions

- The user running the app needs **write** access to `CONFIG_DIR` and `ICONS_DIR`.
- `DATA_DIR` holds the admin account and signing key. Only that user should be able to read it.
- Don't run it as root if you can avoid it.

## Optional features

| Variable | Enables |
| -------- | ------- |
| `HOMEPAGE_ENV_FILE=/path/to/homepage/.env` | Editing Homepage's `.env` from the *Environment & auth* page |
| `HOMEPAGE_RESTART_TRIGGER=/var/lib/homepage-config/restart-homepage` | The Restart Homepage button. Something must watch this file and restart Homepage when it changes, e.g. a systemd `.path` unit like the one `scripts/install-lxc.sh` creates |

All settings: [Settings reference](configuration.md#settings-reference).

## Run it permanently

Use your process manager of choice. On systemd, the easiest route is the [LXC installer](install-lxc.md), which works on any Debian/Ubuntu machine. To write the unit yourself, copy the one in `scripts/install-lxc.sh` (section "systemd").

## Update

```bash
git pull && npm ci --omit=dev   # then restart the process
```
