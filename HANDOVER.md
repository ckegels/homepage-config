# Homepage Config: handover & progress log

This is the living document for the project. It records why the tool exists, how it is built, how every process works, what has been verified, and what is left to do. Update the **Progress** and **Changelog** sections whenever something changes.

Last updated: 2026-10-25 · Version 1.1.2 · Deployment target: **Proxmox LXC without Docker** (Docker still supported) · Widget catalog built from Homepage **v2.7.0** (tag)

---

## 1. Goal

[Homepage](https://github.com/gethomepage/homepage) is configured only through YAML files in its `config/` folder. This project is a separate, password-protected web UI that edits those files. Requirements from the owner:

1. A complete setup suite covering **all** configuration options in the docs.
2. A **secure** login.
3. **Icons** can be added from the UI.
4. Clean and easy to understand, with nothing missing.
5. This handover file, describing each step and process and tracking progress.
6. The owner adds a link to the UI in Homepage once, and from then on everything is managed here.

## 2. Research summary (what Homepage actually reads)

Sources: every page under https://gethomepage.dev/configs/, /installation/, /widgets/. They were read from the docs source in the Homepage repo (`docs/`), and checked against `src/` where the docs were ambiguous.

| File              | Shape                                                                                | Notes |
| ----------------- | ------------------------------------------------------------------------------------ | ----- |
| `settings.yaml`   | map                                                                                  | title, description, startUrl, background (string or `{image, blur, saturate, brightness, opacity}`), cardBlur, favicon, theme, color (22 palettes), blockHighlights.levels, pwa.icons/shortcuts, layout, iconStyle, fullWidth, maxGroupColumns, maxBookmarkGroupColumns, bookmarksStyle, disableCollapse, groupsInitiallyCollapsed, useEqualHeights, headerStyle (4), cardStyle, blockStyle, font, base, language (17), target, providers, quicklaunch.*, hideVersion, disableUpdateCheck, logpath, showStats, statusStyle, instanceName, hideErrors, disableIndexing |
| `services.yaml`   | list of `{Group: [ {Service: {...}} \| {NestedGroup: [...]} ]}`                     | Service keys: href, description, icon, target, id, ping, siteMonitor, statusStyle, showStats, server, container, namespace, app, podSelector, proxmoxNode, proxmoxVMID, proxmoxType, weight, widget / widgets[] |
| `bookmarks.yaml`  | list of `{Group: [ {Name: [ {href, abbr, icon, description, target, id} ]} ]}`        | The bookmark value is a one-element list |
| `widgets.yaml`    | list of `{type: {options}}`                                                          | 13 info widgets: logo, greeting, datetime, search, openmeteo, openweathermap, resources, glances, kubernetes, longhorn, stocks, unifi_console, customapi |
| `docker.yaml`     | map name → `{socket}` or `{host, port, protocol, tls{caFile,certFile,keyFile}, headers}` + `swarm` | |
| `kubernetes.yaml` | `{mode: disabled\|default\|cluster, ingress, traefik, gateway}`                       | |
| `proxmox.yaml`    | map node → `{url, token, secret}`                                                    | |
| `custom.css/js`   | text                                                                                 | custom.css is public even with Homepage auth on |

Facts that shaped the design:

- **Parser:** Homepage uses `js-yaml` with the **CORE schema** (YAML 1.2: `yes` is a string, not a boolean). This app uses the `yaml` library with `schema: "core"` for the same behaviour.
- **Live reload:** Homepage hashes its config files (`/api/hash`) and reloads on the next page load. **No restart is needed for YAML changes.**
- **Local icons:** files in `/app/public/icons` are only served after a **Homepage restart**. Verified: 404 before restart, 200 after.
- **Icon references:**
  - Dashboard Icons: `name.png|svg|webp`
  - `mdi-name[-#hex]` and `si-name[-#hex]`
  - `sh-name[.ext]`
  - Absolute URLs, or `/path` under `/app/public`
  - All are loaded from jsDelivr in the visitor's browser.
- **Env-only settings:** some things can only be set with environment variables, not files:
  - `HOMEPAGE_ALLOWED_HOSTS`, `PUID`/`PGID`, `LOG_TARGETS`
  - Auth: `HOMEPAGE_AUTH_*` and `HOMEPAGE_OIDC_*`
  - MCP: `HOMEPAGE_MCP_*`
  - Secrets: `HOMEPAGE_VAR_*` and `HOMEPAGE_FILE_*`

  The UI generates these but cannot apply them.
- **Service widget options:** the server only forwards whitelisted keys (`src/utils/config/service-helpers.js`). Common keys on every widget are `fields`, `hideErrors`, `highlight` and `headers`.

## 3. Architecture

The same app supports two deployments. Only paths and two optional env vars differ.

**LXC / systemd (primary target, `scripts/install-lxc.sh`)**

```
Browser ──► homepage-config.service (user homepage-config, sandboxed, :3100)
              │ group-write (setgid)                    │ writes trigger file
              ▼                                         ▼
   /opt/homepage/config, public/icons, .env    homepage-config-restart.path (systemd, root)
              ▲ reads                                   │ systemctl restart
   homepage.service (root, :3000) ◄─────────────────────┘
   State: /var/lib/homepage-config · Settings: /etc/homepage-config/homepage-config.env
```

**Docker**

```
Browser ──HTTPS──► reverse proxy ──► homepage-config (Node 22, :3100)
                                        │  reads/writes
                                        ▼
                         shared volume: Homepage /app/config   ◄── Homepage (:3000)
                         shared volume: icons  (/data/icons)   ◄── Homepage /app/public/icons
                         private volume: /data (auth.json, secret.key, backups/, cache/)
```

- **Server:** plain `node:http`, no framework. Runtime dependencies are `yaml`, `htm` (Preact standalone bundle) and `qrcode-generator`.
- **Frontend:** a no-build SPA with ES modules, Preact + htm and hash routing (`#/services`). The `yaml` browser build is served from `node_modules` for client-side validation.
- **Widget catalog:** `data/widget-catalog.json`, generated from the Homepage docs by `scripts/build-catalog.mjs`.

### File map

| Path | What it does |
| ---- | ------------ |
| `server/index.js` | HTTP server, routes, static files, security headers, CSRF/Origin check, app settings |
| `server/env.js` | Environment configuration |
| `server/auth.js` | Setup token, scrypt hashing, HMAC sessions, lockout, TOTP |
| `server/config-files.js` | Whitelisted config files: read, parse, validate, backup, write, restore |
| `server/icons.js` | Icon upload/import/rename/delete, content sniffing, SVG sanitizing, remote icon catalogs |
| `server/envfile.js` | Read/update Homepage's `.env` (managed keys only, comments kept, backups) and the restart trigger |
| `scripts/build-catalog.mjs` | Parses `docs/widgets/services/*.md` into the widget catalog JSON |
| `scripts/install-lxc.sh` | LXC/systemd installer: install, update, `--fix-permissions`, `--uninstall [--purge]` |
| `README.md` | Short overview: features, screenshots, install picker, quick start |
| `docs/install-lxc.md`, `docs/install-docker.md`, `docs/install-manual.md` | One guide per install method |
| `docs/configuration.md`, `docs/troubleshooting.md` | Sign-in, linking, HTTPS, icons, backups, settings reference, security; problem/fix table |
| `docs/images/*.png` | README screenshots (taken with demo data, 1440×900) |
| `public/js/main.js` | App shell, nav, router, unsaved-changes guard, icon picker host |
| `public/js/api.js` | fetch wrapper (adds `X-HC-Request: 1`) |
| `public/js/ui.js` | Form controls, modal, toasts, save bar, icon input/preview, YAML field |
| `public/js/form.js` | `SchemaForm` (renders field specs), `ObjectList`, `ExtraYaml` (unknown keys) |
| `public/js/schemas.js` | All option definitions (settings, layout, service, bookmark, 13 info widgets, docker/k8s/proxmox) |
| `public/js/convert.js` | Pure YAML ⇄ model conversions (unit tested) |
| `public/js/model.js` | `useConfigFile` hook (load/dirty/save/discard), re-exports convert |
| `public/js/markdown.js` | Safe mini markdown renderer for the widget docs |
| `public/js/pages/*.js` | One module per page |
| `test/*.test.js` | `node:test` unit tests |
| `Dockerfile`, `docker-compose.yml` | Container build and an example stack with Homepage |

## 4. Processes (how things work)

### 4.1 First run / account setup

1. On start, `bootstrap()` checks `/data/auth.json`.
2. If there is no account and `ADMIN_PASSWORD` is set, the account is created from the environment.
3. Otherwise a random **setup token** is printed to the logs and written to `/data/setup-token.txt` (mode 0600).
4. The UI shows the setup screen. Creating the account requires that token. Without it, anyone reaching the port first could claim the admin account.
5. The password needs 12+ characters, must not contain the username, and needs at least 5 distinct characters. It is stored as scrypt (N=32768, r=8, p=1, 16-byte salt).

### 4.2 Sign-in and sessions

- `POST /api/auth/login` checks the username and password. scrypt always runs, even for unknown usernames, so timing doesn't reveal which usernames exist.
- If TOTP is enabled, a 6-digit code is required. ±1 time step is allowed, and a code can't be reused.
- **Brute-force protection:**
  - Each IP is locked out after 5 failures: 1 minute, doubling up to 1 hour.
  - Across all IPs, sign-ins pause after 30 failures per minute.
  - Failed attempts are logged as `[auth] failed sign-in attempt from <ip>`, which works as a fail2ban/CrowdSec filter.
- **Session format:** `base64url(JSON{u, e(epoch), iat, exp, nonce}).HMAC-SHA256`. The key is in `/data/secret.key`.
- **Cookie:** `hc_session`, `HttpOnly; SameSite=Strict; Path=/`. `Secure` is added when HTTPS is detected (or `COOKIE_SECURE=true`).
- **Revocation:** every account has an `epoch`. Changing the password, enabling 2FA or "sign out everywhere" bumps it, which invalidates every other session. The current browser gets a fresh cookie.

### 4.3 Request protection

- Every state-changing request needs the header `X-HC-Request: 1`. Browsers can't send it cross-site without a CORS preflight, and the server never allows CORS.
- When an `Origin` header is present, it must match `Host` (or `PUBLIC_URL`).
- Strict CSP (`script-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, COOP.
- Static files are served from an allow-list (`/assets/*`, `/js/*`, two vendor paths) and `..` is rejected. Config files are a fixed whitelist of 9 names.

### 4.4 Editing a config file through a form

1. A page calls `useConfigFile(name, {parse, serialize})`, which runs `GET /api/files/:name` and returns `{text, data, mtime, hasComments, error}`.
2. `parse` turns Homepage's YAML shape into an editable model (see `convert.js`).
3. Forms are rendered from **field specs** (`schemas.js`) by `SchemaForm`.
   - Keys the forms don't know are **kept untouched** and shown in an "Other options (YAML)" box (`ExtraYaml`), so nothing is ever lost or unreachable.
   - Empty values delete the key, so files stay minimal.
   - Booleans are three-state: Default (unset) / On / Off.
4. The page compares the model with the loaded version (JSON). When they differ, the **save bar** appears, and navigation/unload is guarded.
5. Save runs `PUT /api/files/:name {data, baseMtime}`. The server then:
   - rejects the save (409) if the file changed on disk meanwhile;
   - serializes the data to YAML and re-parses it to validate;
   - checks the root type (list or map);
   - **backs up** the current file to `/data/backups/<file>/<timestamp>` (keeping 50);
   - overwrites the file **in place**, which keeps the inode and owner and works with single-file bind mounts.
6. Homepage notices the new file hash on its next page load.

Form saves drop YAML comments. The UI warns about this when a file has comments, and the backup keeps the original.

### 4.5 Editing raw files

The **Files** page edits the raw text, which keeps comments and formatting. Validation runs live in the browser (same parser) and again on the server. Tab inserts two spaces, and Ctrl/⌘+S saves. History lists backups that you can view or restore. A restore first backs up the current version.

### 4.6 Service widgets (all 160+)

1. `scripts/build-catalog.mjs` reads each `docs/widgets/services/*.md`. For each one it:
   - parses every YAML example with `yaml` (keeping inline comments);
   - finds the maps that contain `type:`;
   - collects each option with its example value, inline comment (shown as help) and optional/secret flags;
   - collects enum values ("Allowed values: …") and the `Allowed fields: [...]` list.

   It also keeps the full markdown, and links legacy aliases from `src/widgets/widgets.js` (e.g. `overseerr` → `seerr`).
2. The UI lets you choose a type from a searchable picker. Each option is rendered by kind: text, secret, number, boolean, string list, or YAML for nested values.
   - `fields` becomes clickable chips.
   - The common options (`hideErrors`, `headers`, `highlight`) sit in a collapsible section.
   - Unknown keys go to the extra YAML box.
   - The **Docs** toggle shows the original documentation.
   - The **YAML** toggle edits the whole widget block raw.
3. A single widget is written as `widget:`, several as `widgets:`.

### 4.7 Icons

- **Upload:** the raw body goes to `POST /api/icons/upload?name=`, with a 5 MB limit. The filename is normalised (lowercase, `[a-z0-9._-]`).
  - Allowed extensions: png, svg, webp, jpg, gif, ico, avif.
  - The content is **sniffed** by magic bytes, so a renamed HTML file is refused.
  - SVGs are **sanitised**: scripts, foreignObject, `on*` handlers and `javascript:` links are removed.
- **Import from URL:** the server downloads the file (http/https only, 15 s timeout, 5 MB) and stores it the same way. Only signed-in users can do this.
- **Serving:** `GET /icons/:name` is public and sends `CSP: sandbox`, `nosniff` and `CORP: cross-origin`. Opening an SVG directly can never run script.
- **Browsing libraries:** the server fetches the four index files once a day and caches them in `/data/cache`, so the browser never calls GitHub/npm itself (CSP `connect-src 'self'`). Previews load from jsDelivr like Homepage does.
- **Reference mode** (Account & app):
  - `local` writes `/icons/x.png` (shared folder, Homepage restart needed for new files).
  - `url` writes `<iconBaseUrl>x.png` (instant).

### 4.8 Layout & tabs

`settings.layout` may be a map or a list of single-key maps, and nested groups are keys whose value is an object. `parseLayout`/`serializeLayout` handle both and always write the map form. The page lists the groups found in services/bookmarks and lets you add discovered (Docker/K8s) group names manually. It warns when a service group and a bookmark group share a name, which the Homepage docs say breaks rendering.

### 4.9 Environment & auth

The page covers allowed hosts, LOG_TARGETS, password or OIDC auth, MCP, `HOMEPAGE_VAR_*` and `HOMEPAGE_FILE_*`. On Docker it also covers PUID/PGID. It can generate random secrets, and it warns about short secrets and passwords, missing external URLs, and `*` hosts.

It has two modes:

- **Direct mode** (when `HOMEPAGE_ENV_FILE` is set, i.e. the LXC install):
  - `GET /api/homepage/env` loads Homepage's `.env` and maps it onto the form (`fromEnv`).
  - Saving sends `PUT /api/homepage/env`. `server/envfile.js` then:
    - only accepts keys matching `HOMEPAGE_*`, `PUID`, `PGID` or `LOG_TARGETS`, and rejects `\r`/NUL;
    - backs up the old file to `<data>/backups/homepage.env/`;
    - replaces managed lines **in place** and removes managed keys that were cleared;
    - appends new keys, and leaves comments and foreign lines (e.g. `NODE_OPTIONS`) untouched.
  - Keys the form doesn't model are carried through in `extra`, so nothing is lost.
  - "Save & restart Homepage" saves, then triggers a restart.
- **Generator mode** (Docker): client-only. It outputs a compose `environment:` block and `.env` text, and the draft lives in `sessionStorage`.

### 4.9a Restarting Homepage (LXC)

The app never gets root rights:

1. `POST /api/homepage/restart` writes a timestamp to `HOMEPAGE_RESTART_TRIGGER` (`/var/lib/homepage-config/restart-homepage`). It's throttled to once per 15 s.
2. `homepage-config-restart.path` (`PathChanged=`) starts `homepage-config-restart.service`.
3. That oneshot service, run as root by systemd, runs `systemctl restart homepage.service`.

`meta.canRestart` controls the buttons on the Overview page, the Icons page (local mode) and the Environment page.

### 4.9b LXC installer (`scripts/install-lxc.sh`)

1. Requires root and systemd. Defaults: `/opt/homepage`, `homepage.service` (community-script layout). Everything is overridable with flags.
2. Node.js: needs ≥20. If missing, it installs **NodeSource 22**, because current Homepage needs Node 22. Debian 13's own nodejs 20 broke Homepage (undici `markAsUncloneable`) in testing.
3. Creates the system user/group `homepage-config` (nologin).
4. Copies the app to `/opt/homepage-config` (root-owned, read-only for the service) and runs `npm ci --omit=dev`.
5. Permissions:
   - `chgrp -R homepage-config` + `g+rwX` + setgid on the config and icons folders.
   - `.env` becomes `root:homepage-config 0660`.
   - Homepage itself keeps running as root, unchanged.
   - The unit uses `UMask=0002`, so new files stay group-writable.
   - If Homepage later creates a file as root 0644, `config-files.js` replaces it with a temp file + rename, since the folder is group-writable.
6. Writes `/etc/homepage-config/homepage-config.env` (kept on re-runs unless `--reconfigure`).
7. Writes `homepage-config.service`, plus a `hardening.conf` drop-in:
   - `ProtectSystem=strict`, with `ReadWritePaths` limited to the config, icons, state and `.env` paths;
   - `NoNewPrivileges`, an empty `CapabilityBoundingSet`, restricted address families, and more.
   - `systemd-analyze security` scores it **3.0 OK**.
   - If the service fails with a namespace error (unprivileged LXC without nesting), the drop-in is removed automatically with a warning.
8. Adds the restart path/service units if `homepage.service` exists.
9. Starts everything and prints the URL and setup token.
10. Re-running the script is the update procedure. `--fix-permissions` re-applies step 5, e.g. after a Homepage update. `--uninstall [--purge]` removes everything; Homepage keeps running.

### 4.10a Releasing a new version of this app

1. Update the code and `HANDOVER.md` (progress + changelog), and bump `version` in `package.json`.
2. `npm test` (CI also runs it on every push to `main`).
3. Commit, then `git tag vX.Y.Z && git push && git push --tags`.
4. `.github/workflows/release.yml` tests again, then builds and pushes `ghcr.io/ckegels/homepage-config:X.Y.Z`, `:X.Y` and `:latest` for amd64 and arm64.
5. `gh release create vX.Y.Z --notes-file …` publishes the release notes. LXC users update with `git pull && ./scripts/install-lxc.sh`.

### 4.10 Updating for a new Homepage release

1. `git clone --depth 1 https://github.com/gethomepage/homepage.git /tmp/homepage`
2. `npm run build:catalog -- /tmp/homepage` regenerates the service widget catalog.
3. Diff `docs/configs/*.md` and `docs/widgets/info/*.md` against the previous version. Add any new settings, info widgets or service keys to `public/js/schemas.js`. Until then they stay editable through the "Other options (YAML)" boxes.
4. `npm test`, then a smoke test (§6), then bump `package.json` version and update this file.

## 5. Decisions & rationale

| Decision | Why |
| -------- | --- |
| Separate container, not a Homepage fork | Homepage updates independently. Only the shared config folder couples the two. |
| Own login instead of reusing Homepage's auth | Homepage auth is optional and env-based. This UI controls credentials, so it must always be protected. |
| Setup token on first run | Prevents an unauthenticated race to create the admin. |
| Stateless HMAC sessions + epoch | No session store to persist, while revocation still works. |
| `yaml` lib with core schema, not `js-yaml` | Same YAML 1.2 semantics as Homepage. It also has a browser build for live validation. |
| No frontend build step | Fewer moving parts and dependencies (3 runtime deps). Easy to hand over. |
| Generated widget catalog | 160+ widgets can't be maintained by hand. The docs are the source of truth. |
| Forms keep unknown keys | Guarantees no data loss and covers future options. |
| Overwrite in place + backups | Works with all mount styles, and every change can be undone. |
| Two icon modes | Local is robust (no dependency on this app). URL is instant (no Homepage restart). |
| LXC: shared group instead of running as root | Least privilege. The app can only touch Homepage's config, icons and `.env`. |
| LXC: restart via systemd path unit, not sudo/polkit | Works with `NoNewPrivileges`, needs no sudo or polkit, and the app only ever touches one file. |
| LXC: edit `.env` directly | On source installs env vars live in a file, so the "CLI only" part of Homepage can be managed from the UI too. |

## 6. Verification performed (2026-10-25)

- **Unit tests:** `npm test` passes all **22 tests**:
  - converter round-trips (services incl. nested + multiple widgets, bookmarks, info widgets, layout map/list/nested);
  - TOTP against the RFC 6238 vector, scrypt hashing, password rules, setup-token gate, session tamper/revoke, lockout;
  - file whitelist, root-type validation, backups/restore, `{{HOMEPAGE_VAR_*}}` quoting, core-schema `yes`, stale-write rejection;
  - icon sniffing, SVG sanitising, name cleaning and path traversal;
  - `.env` parsing/quoting, in-place updates that keep comments and foreign keys, key removal, forbidden keys, newline round-trip, restart trigger and throttle.
- **API (curl):**
  - Unauthenticated requests get 401.
  - A missing CSRF header or a foreign Origin gets 403.
  - Bad setup tokens and weak passwords are refused, and a second setup gets 409.
  - Lockout triggers after 5 failures.
  - Path-traversal attempts only return the SPA shell.
  - Fake PNG and `.html` uploads are refused, and SVG `onload`/`<script>` are stripped.
  - All four icon catalogs load: 2799 / 7188 / 3467 / 2968 icons.
- **Browser (Playwright, Chromium):**
  - All 11 pages render with **zero console errors**.
  - A full flow worked: create a group and service, pick an icon from Dashboard Icons, add a sonarr widget with fields, key placeholder and `enableQueue`, add an openmeteo info widget, set a layout tab and row style, and set the theme and color. The resulting YAML was correct.
  - The mobile layout (390 px) works.
- **Integration with real Homepage (`ghcr.io/gethomepage/homepage:latest`, v2.7.0):**
  - Both containers ran on a shared config folder, with this app read-only, non-root and with `cap_drop: ALL`.
  - Homepage's `/api/services`, `/api/bookmarks` and `/api/widgets` returned exactly what the UI wrote: nested groups, multiple widgets, `fields`, `enableQueue`, tabs, theme and color.
  - The rendered dashboard showed the uploaded local icon (after a restart), the colored `si-plex` icon, icons-only bookmarks, and the date/search/weather header.
- **LXC installer:** tested in a systemd Debian 13 container mirroring the community LXC. The real Homepage app ran in `/opt/homepage` as root via `homepage.service`, reading `/opt/homepage/.env`.
  - A fresh install (including the Node install) gave active services, a printed setup token and the sandbox enabled. `systemd-analyze security` scored 3.0 OK, and the service user can't write `/opt/homepage-config`.
  - Re-running (the update path) kept the settings file and account.
  - Saving `services.yaml` and `proxmox.yaml` worked, including a root-owned 0644 file (rename fallback, no temp leftovers).
  - The `.env` round trip kept comments; a forbidden key (`PATH`) was rejected.
  - The Restart button changed Homepage's PID, and the new `.env` values were live in the restarted process. A second press within 15 s was throttled.
  - An uploaded icon went from 404 to 200 after "Restart Homepage".
  - `--fix-permissions` and `--uninstall` behaved correctly, and Homepage kept running after uninstall.
  - In the browser (LXC mode), the Overview, Icons and Environment pages showed the restart button, direct `.env` mode and the save bar, with zero console errors.

## 7. Progress

### Done ✅

- [x] Read all config, installation and widget docs. Cross-checked option names against the Homepage source.
- [x] Server: auth (setup token, scrypt, sessions, lockout, TOTP 2FA, sign out everywhere), CSRF/Origin, CSP, whitelisted file API, backups/restore, conflict detection.
- [x] Icons: upload (drag & drop, multi), URL import, rename, delete, sniffing, SVG sanitising, public sandboxed serving, 4 browsable libraries with search, custom colors for mdi/si, "save a copy" from the CDN, icon picker in every icon field, two reference modes.
- [x] Pages: Overview (file status, counts, warnings), Settings (General, Appearance, Quick Launch, PWA, Providers, other keys), Layout & tabs (order, nested, all group options), Services (tree, nested groups, move/duplicate/delete, all service keys, Docker/K8s/Proxmox dropdowns, widgets), Bookmarks, Info widgets (all 13 with forms + YAML mode), Docker/K8s/Proxmox (+ Docker label generator), Files (raw editor + history), Environment & auth generator, Account & app.
- [x] Service widget catalog generator (170 entries incl. aliases).
- [x] Dockerfile and hardened docker-compose example.
- [x] Unit tests, browser smoke and flow tests, integration test with real Homepage.
- [x] README and this handover.
- [x] **No-Docker install for LXC** (`scripts/install-lxc.sh`): dedicated user, shared-group permissions, sandboxed systemd unit with automatic fallback, Node 22, update/fix-permissions/uninstall.
- [x] Restart Homepage from the UI (systemd path unit) on the Overview, Icons and Environment pages.
- [x] Environment page edits Homepage's `.env` directly on LXC (with backups), plus "Save & restart".
- [x] Published as a public repo: https://github.com/ckegels/homepage-config (GPL-3.0, same as Homepage, because the widget catalog embeds Homepage doc text). CI runs the tests on Node 20 and 22. A `v*.*.*` tag publishes a multi-arch image to `ghcr.io/ckegels/homepage-config`.
- [x] Clean README with all installation options (LXC installer, Docker Compose, Docker next to existing Homepage, manual), plus reverse proxy, icons, settings reference, update/uninstall and troubleshooting.

### Next steps / ideas 🔜

- [ ] **Owner:** on the Homepage LXC, run `git clone https://github.com/ckegels/homepage-config.git /root/homepage-config && cd /root/homepage-config && ./scripts/install-lxc.sh` ([docs/install-lxc.md](docs/install-lxc.md)). Then create the account with the setup token, enable 2FA, and add the "Homepage Config" tile to Homepage ([docs/configuration.md](docs/configuration.md#link-it-from-homepage)).
- [ ] **Owner:** if the LXC is unprivileged without nesting, enable nesting to keep the systemd sandbox (the installer warns if it had to disable it).
- [ ] Optional (Docker only): a "restart Homepage" button. This would need Docker socket access, so it was skipped for security. LXC installs have it.
- [ ] Optional: comment-preserving form saves (edit the YAML Document AST instead of re-serialising).
- [ ] Optional: drag-and-drop reordering (up/down buttons today).
- [ ] Optional: live preview iframe of Homepage. This needs Homepage to allow framing.
- [ ] Optional: a highlight-rule builder UI. Highlighting is a YAML field with an example today.
- [ ] Optional: Kubernetes annotation generator (Docker labels exist).
- [ ] Optional: publish the image to a registry and add CI (tests + catalog refresh).

### Known limitations ⚠️

- Form saves remove YAML comments. Use the Files page to keep them, and the backup keeps the original.
- New *local* icons need a Homepage restart (Homepage behaviour). It's one click on LXC; URL mode avoids it.
- Docker installs: env-only Homepage options are generated, not applied, and there's no restart button.
- Community-script Homepage updates may reset folder ownership. Run `install-lxc.sh --fix-permissions` afterwards.
- Single admin account (by design).
- Rate limiting is in memory, so it resets on restart.

## 8. Changelog

| Date | Change |
| ---- | ------ |
| 2026-10-25 | v1.0.0: initial build: research, server, UI (11 pages), widget catalog, icons, tests, Docker, integration verification, docs. |
| 2026-10-25 | v1.1.0 (first public release): LXC/no-Docker install (`scripts/install-lxc.sh`), Restart Homepage button (systemd path unit), direct `.env` editing, write fallback for root-owned files, 5 new tests (22 total), README rewritten with all installation options. |
| 2026-10-25 | Docs: README shortened to an overview with screenshots. Install methods split into `docs/install-lxc.md`, `docs/install-docker.md` and `docs/install-manual.md`, plus `docs/configuration.md` and `docs/troubleshooting.md`. |
| 2026-10-25 | v1.1.1: widget catalog rebuilt from the Homepage **v2.7.0** tag instead of `main`. The only difference: the Unraid widget docs say the API key needs the VIEWER role (not ADMIN). No settings, service or info-widget options changed between the versions, and Node 22 still works. The UI now shows "for Homepage 2.7.0". |
| 2026-10-26 | v1.1.2: dropping an icon in the picker (from a service/bookmark field) now names it after that service/bookmark and auto-dedupes (`sonarr.png`, `sonarr-2.png`, …) instead of offering to overwrite. The standalone Icons page keeps the replace prompt. New option `baseName`/`dedupe` on `saveIcon`; 1 new test (23 total). |
