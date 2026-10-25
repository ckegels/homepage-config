# Install with Docker

← [Back to README](../README.md)

Image: `ghcr.io/ckegels/homepage-config` (amd64 and arm64). Tags: `latest`, `1.1`, `1.1.0`.

Homepage Config needs **the same folders** as your Homepage container:

| Homepage container | Homepage Config container |
| ------------------ | ------------------------- |
| `/app/config` | `/app/config` |
| `/app/public/icons` | `/data/icons` |

It also needs its own folder for `/data` (account, backups), and it must run as a user that can **write** Homepage's config folder (`user:`).

## Option A: new setup, both together

```bash
git clone https://github.com/ckegels/homepage-config.git && cd homepage-config
mkdir -p homepage/config homepage/icons homepage-config-data
sudo chown -R 1000:1000 homepage homepage-config-data
docker compose up -d
docker logs homepage-config          # → setup token
```

The included [`docker-compose.yml`](../docker-compose.yml) starts:
- Homepage on port **3000**.
- Homepage Config on port **3100**: read-only, non-root, with all capabilities dropped.

Add your address to `HOMEPAGE_ALLOWED_HOSTS` in that file.

## Option B: next to an existing Homepage

```yaml
services:
  homepage-config:
    image: ghcr.io/ckegels/homepage-config:latest
    container_name: homepage-config
    user: "1000:1000"   # owner of Homepage's config folder (its PUID:PGID, or 0:0 if it runs as root)
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

With plain `docker run`:

```bash
docker run -d --name homepage-config --user 1000:1000 -p 3100:3100 \
  -v /path/to/homepage/config:/app/config -v /path/to/homepage/icons:/data/icons \
  -v homepage-config-data:/data --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --restart unless-stopped ghcr.io/ckegels/homepage-config:latest
```

To build the image yourself instead, clone the repo and replace `image:` with `build: .`.

Then continue with [First sign-in](configuration.md#first-sign-in).

## Differences from the LXC install

- Homepage's environment variables are **generated** for you to paste into its compose file, rather than edited directly.
- There is no Restart Homepage button. Use `docker restart homepage` after adding new local icons.

## Update

```bash
docker compose pull && docker compose up -d
```

## Uninstall

```bash
docker compose down        # then delete the homepage-config-data folder
```

Settings for the container: [Settings reference](configuration.md#settings-reference). Problems: [Troubleshooting](troubleshooting.md).
