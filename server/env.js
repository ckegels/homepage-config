import { join, resolve } from "node:path";

function bool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const dataDir = resolve(process.env.DATA_DIR || "./data-local");

export const env = {
  port: Number(process.env.PORT || 3100),
  host: process.env.HOST || "0.0.0.0",
  // Homepage's config directory (the same folder Homepage mounts at /app/config).
  configDir: resolve(process.env.CONFIG_DIR || "./config"),
  // Private state of this app: credentials, backups, caches.
  dataDir,
  // Uploaded icons. Mount the same folder into Homepage at /app/public/icons.
  iconsDir: resolve(process.env.ICONS_DIR || join(dataDir, "icons")),
  // External URL of this config UI, e.g. https://config.example.com (optional).
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
  // URL of Homepage itself, used for the "Open Homepage" link and cache refresh (optional).
  homepageUrl: (process.env.HOMEPAGE_URL || "").replace(/\/+$/, ""),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  // "auto" marks cookies Secure when the request arrived over HTTPS.
  cookieSecure: (process.env.COOKIE_SECURE || "auto").toLowerCase(),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  adminUser: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  backupsPerFile: Number(process.env.BACKUPS_PER_FILE || 50),
  // Allow fetching icon catalogs / importing icons from the internet.
  allowRemote: bool(process.env.ALLOW_REMOTE_FETCH, true),
  // Source/LXC installs: Homepage's .env file, editable from the Environment page (optional).
  homepageEnvFile: process.env.HOMEPAGE_ENV_FILE ? resolve(process.env.HOMEPAGE_ENV_FILE) : "",
  // Source/LXC installs: writing this file makes a systemd path unit restart Homepage (optional).
  homepageRestartTrigger: process.env.HOMEPAGE_RESTART_TRIGGER ? resolve(process.env.HOMEPAGE_RESTART_TRIGGER) : "",
};
