# Configuration & usage

← [Back to README](../README.md)

- [First sign-in](#first-sign-in)
- [Link it from Homepage](#link-it-from-homepage)
- [HTTPS / reverse proxy](#https--reverse-proxy)
- [Icons](#icons)
- [Backups](#backups)
- [Settings reference](#settings-reference)
- [Security notes](#security-notes)

## First sign-in

1. Open `http://<host>:3100`.
2. Enter the **setup token**. Depending on the install, it's in the installer output, `journalctl -u homepage-config`, `docker logs homepage-config`, or `<data dir>/setup-token.txt`. The token stops anyone else on your network from claiming the admin account first.
3. Choose a username and a password of at least 12 characters.
4. Recommended: **Account & app → Set up 2FA**, then scan the QR code with any authenticator app.
5. Under **Account & app → App settings**, check the Homepage URL and the [icon mode](#icons).

**Forgot your password?** Stop the service, delete `<data dir>/auth.json`, start it again and use the new setup token. Your Homepage config isn't touched.

## Link it from Homepage

Add a tile once, either on the *Services* page or in `services.yaml`:

```yaml
- Admin:
    - Homepage Config:
        href: http://192.168.1.50:3100      # or https://config.example.com
        icon: mdi-cog
        description: Edit this dashboard
```

## HTTPS / reverse proxy

Anyone signed in can read every API key in your config, so keep the UI on your LAN/VPN or behind HTTPS. Behind a proxy, set:

```env
PUBLIC_URL=https://config.example.com
TRUST_PROXY=true
COOKIE_SECURE=true
```

**Caddy**

```caddy
config.example.com {
  reverse_proxy 192.168.1.50:3100
}
```

**nginx**

```nginx
location / {
  proxy_pass http://192.168.1.50:3100;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  client_max_body_size 10m;
}
```

**Nginx Proxy Manager:** add a proxy host to `http://<ip>:3100`, enable SSL, and set the three variables above.

## Icons

Uploaded icons are saved in Homepage's icons folder. Choose how services refer to them under *Account & app*:

| Mode | Reference | New icon visible |
| ---- | --------- | ---------------- |
| **Local path** (default) | `/icons/name.png` | After a Homepage restart. Homepage only scans the folder on start. Use the **Restart Homepage** button (LXC) or `docker restart homepage` |
| **Served by this app** | `https://config.example.com/icons/name.png` | Immediately. Visitors must be able to reach this app's `/icons/` path (the only public path) |

Dashboard Icons, selfh.st, Material Design (`mdi-…`) and Simple Icons (`si-…`) need no upload. Homepage loads them from a CDN.

## Backups

- Every save keeps the previous version under `<data dir>/backups/<file>/` (50 per file). View and restore them on the **Files** page.
- To back up everything, copy the data folder and Homepage's config folder.

## Settings reference

The file is `/etc/homepage-config/homepage-config.env` (LXC); otherwise use environment variables.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `CONFIG_DIR` | `/app/config` (Docker) | Homepage's config folder |
| `DATA_DIR` | `/data` (Docker) | Account, signing key, backups, caches |
| `ICONS_DIR` | `$DATA_DIR/icons` | Homepage's `public/icons` |
| `PORT` / `HOST` | `3100` / `0.0.0.0` | Listen address (`127.0.0.1` = only via a local proxy) |
| `HOMEPAGE_URL` | | Homepage's address (sidebar link) |
| `HOMEPAGE_ENV_FILE` | | Homepage's `.env`, edited directly on the *Environment & auth* page |
| `HOMEPAGE_RESTART_TRIGGER` | | File watched by systemd. Enables the Restart Homepage button |
| `PUBLIC_URL` | | External URL of this UI (allowed origin, icon base URL) |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers |
| `COOKIE_SECURE` | `auto` | `true` forces Secure cookies |
| `SESSION_HOURS` | `12` | Sign-in lifetime |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / | Create the admin on first start instead of using the setup token |
| `BACKUPS_PER_FILE` | `50` | Backups kept per file |
| `ALLOW_REMOTE_FETCH` | `true` | Allow icon catalogs and URL imports |

## Security notes

- Anyone signed in can read all API keys in the config and change `custom.js`, which runs in visitors' browsers. Use a strong password and 2FA.
- Only `/icons/*` and the sign-in endpoints are reachable without signing in.
- Sign-in is locked per IP after 5 failures. Failures are logged as `[auth] failed sign-in attempt from <ip>` (usable with fail2ban/CrowdSec).
- To report a vulnerability, see [SECURITY.md](../SECURITY.md).
