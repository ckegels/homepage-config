import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "./env.js";
import * as files from "./config-files.js";
import * as auth from "./auth.js";
import * as icons from "./icons.js";
import * as envfile from "./envfile.js";

const { HttpError } = files;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
};

// Files served to the browser. Fixed map: nothing else on disk is reachable.
const STATIC_FILES = {
  "/vendor/htm-preact.js": join(root, "node_modules", "htm", "preact", "standalone.module.js"),
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// ---------- app settings (stored next to auth data) ----------

const appSettingsFile = () => join(env.dataDir, "app-settings.json");
const APP_DEFAULTS = { iconMode: "local", iconBaseUrl: "", homepageUrl: "" };

function getAppSettings() {
  const stored = existsSync(appSettingsFile()) ? JSON.parse(readFileSync(appSettingsFile(), "utf8")) : {};
  const s = { ...APP_DEFAULTS, ...stored };
  if (!s.homepageUrl) s.homepageUrl = env.homepageUrl;
  if (!s.iconBaseUrl && env.publicUrl) s.iconBaseUrl = `${env.publicUrl}/icons/`;
  return s;
}

function saveAppSettings(input) {
  const next = { ...getAppSettings() };
  if (["local", "url"].includes(input.iconMode)) next.iconMode = input.iconMode;
  for (const k of ["iconBaseUrl", "homepageUrl"]) {
    if (typeof input[k] === "string") {
      const v = input[k].trim();
      if (v && !/^https?:\/\//i.test(v)) throw new HttpError(400, `${k} must start with http:// or https://`);
      next[k] = v;
    }
  }
  if (next.iconBaseUrl && !next.iconBaseUrl.endsWith("/")) next.iconBaseUrl += "/";
  mkdirSync(env.dataDir, { recursive: true });
  writeFileSync(appSettingsFile(), JSON.stringify(next, null, 2));
  return next;
}

// ---------- helpers ----------

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Type": isBuf || typeof body === "string" ? "text/plain; charset=utf-8" : "application/json",
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "Request body too large."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function json(req) {
  const type = req.headers["content-type"] || "";
  if (!type.startsWith("application/json")) throw new HttpError(415, "Expected application/json");
  const buf = await readBody(req, 8 * 1024 * 1024);
  try {
    return buf.length ? JSON.parse(buf.toString("utf8")) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

/**
 * CSRF defence for state-changing requests: a custom header (cannot be sent
 * cross-site without a CORS preflight, which we never allow) plus an Origin
 * check when the browser supplies one. Cookies are also SameSite=Strict.
 */
function assertSameOrigin(req) {
  if (req.headers["x-hc-request"] !== "1") throw new HttpError(403, "Missing request header.");
  const origin = req.headers.origin;
  if (origin) {
    const host = (env.trustProxy && req.headers["x-forwarded-host"]) || req.headers.host;
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, "Bad origin.");
    }
    const allowed = new Set([host, env.publicUrl && new URL(env.publicUrl).host].filter(Boolean));
    if (!allowed.has(originHost)) throw new HttpError(403, "Cross-origin request blocked.");
  }
}

function serveStatic(res, path) {
  const file = STATIC_FILES[path] ?? (path === "/" ? join(publicDir, "index.html") : null);
  let target = file;
  if (!target && /^\/(assets|js)\/[\w./-]+$/.test(path) && !path.includes("..")) target = join(publicDir, path);
  if (!target && /^\/vendor\/yaml\/[\w./-]+\.js$/.test(path) && !path.includes("..")) {
    target = join(root, "node_modules", "yaml", "browser", "dist", path.slice("/vendor/yaml/".length));
  }
  if (!target || !existsSync(target)) return false;
  send(res, 200, readFileSync(target), {
    "Content-Type": STATIC_TYPES[extname(target)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  return true;
}

// ---------- routes ----------

const routes = [];
const route = (method, pattern, handler, { open = false } = {}) => {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, re, keys, handler, open });
};

// public
route("GET", "/healthz", () => ({ ok: true }), { open: true });

route(
  "GET",
  "/api/auth/state",
  (req) => {
    const session = auth.readSession(req);
    return { setupRequired: auth.setupRequired(), authenticated: !!session, username: session?.username ?? null, version: pkg.version };
  },
  { open: true },
);

route(
  "POST",
  "/api/auth/setup",
  async (req, res) => {
    const ip = auth.clientIp(req);
    auth.assertNotLocked(ip);
    const body = await json(req);
    let account;
    try {
      account = await auth.completeSetup(body);
    } catch (e) {
      if (e.status === 403) auth.recordFailure(ip);
      throw e;
    }
    res.setHeader("Set-Cookie", auth.sessionCookie(req, auth.issueSession(account), env.sessionHours * 3600));
    return { ok: true };
  },
  { open: true },
);

route(
  "POST",
  "/api/auth/login",
  async (req, res) => {
    const account = await auth.login(await json(req), auth.clientIp(req));
    res.setHeader("Set-Cookie", auth.sessionCookie(req, auth.issueSession(account), env.sessionHours * 3600));
    return { ok: true };
  },
  { open: true },
);

route(
  "POST",
  "/api/auth/logout",
  (req, res) => {
    res.setHeader("Set-Cookie", auth.sessionCookie(req, "", 0));
    return { ok: true };
  },
  { open: true },
);

// Uploaded icons are public (Homepage visitors load them when iconMode=url).
route(
  "GET",
  "/icons/:name",
  (req, res, { name }) => {
    const icon = icons.readIcon(decodeURIComponent(name));
    if (!icon) return send(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": icon.type,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Opened directly, an SVG gets an opaque origin and cannot run anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.end(icon.body);
  },
  { open: true },
);

// authenticated
route("GET", "/api/meta", () => {
  const catalogPath = join(root, "data", "widget-catalog.json");
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : null;
  return {
    version: pkg.version,
    configDir: env.configDir,
    iconsDir: env.iconsDir,
    publicUrl: env.publicUrl,
    allowRemote: env.allowRemote,
    homepageVersion: catalog?.homepageVersion ?? null,
    canRestart: !!env.homepageRestartTrigger,
    envFile: env.homepageEnvFile || null,
    app: getAppSettings(),
  };
});

route("POST", "/api/homepage/restart", (req) => {
  const result = envfile.requestRestart();
  console.log(`[homepage] restart requested by ${req.session.username}`);
  return result;
});
route("GET", "/api/homepage/env", () => envfile.readEnvFile());
route("PUT", "/api/homepage/env", async (req) => {
  const result = envfile.writeEnvFile((await json(req)).values);
  console.log(`[homepage] .env updated by ${req.session.username}`);
  return result;
});

route("GET", "/api/app-settings", () => getAppSettings());
route("PUT", "/api/app-settings", async (req) => saveAppSettings(await json(req)));

route("GET", "/api/widget-catalog", (req, res) => {
  const p = join(root, "data", "widget-catalog.json");
  send(res, 200, readFileSync(p), { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" });
});

route("GET", "/api/files", () => files.listFiles());
route("GET", "/api/files/:name", (req, res, { name }) => files.readFile(name));
route("PUT", "/api/files/:name", async (req, res, { name }) => {
  const body = await json(req);
  const result = files.writeFile(name, body);
  console.log(`[config] ${name} saved by ${req.session.username}${result.backupId ? ` (backup ${result.backupId})` : ""}`);
  return result;
});
route("POST", "/api/validate/:name", async (req, res, { name }) => files.validate(name, (await json(req)).text ?? ""));
route("POST", "/api/yaml/parse", async (req) => {
  const { text } = await json(req);
  try {
    return { ok: true, data: files.parseYaml(String(text ?? "")) };
  } catch (e) {
    return { ok: false, message: e.message, ...(e.extra ?? {}) };
  }
});
route("POST", "/api/yaml/stringify", async (req) => ({ text: files.stringifyYaml((await json(req)).data) }));

route("GET", "/api/backups/:name", (req, res, { name }) => files.listBackups(name));
route("GET", "/api/backups/:name/:id", (req, res, { name, id }) => ({ text: files.readBackup(name, id) }));
route("POST", "/api/backups/:name/:id/restore", (req, res, { name, id }) => {
  console.log(`[config] ${name} restored from backup ${id} by ${req.session.username}`);
  return files.restoreBackup(name, id);
});

route("GET", "/api/icons", () => ({ icons: icons.listLocalIcons(), ...getAppSettings() }));
route("POST", "/api/icons/upload", async (req) => {
  const url = new URL(req.url, "http://x");
  const buf = await readBody(req, icons.MAX_ICON_BYTES + 1);
  return icons.saveIcon(url.searchParams.get("name"), buf, { overwrite: url.searchParams.get("overwrite") === "1" });
});
route("POST", "/api/icons/import", async (req) => {
  const { url, name, overwrite } = await json(req);
  return icons.importIcon(url, name, !!overwrite);
});
route("POST", "/api/icons/:name/rename", async (req, res, { name }) => icons.renameIcon(decodeURIComponent(name), (await json(req)).to));
route("DELETE", "/api/icons/:name", (req, res, { name }) => {
  icons.deleteIcon(decodeURIComponent(name));
  return { ok: true };
});
route("GET", "/api/icon-catalog/:set", (req, res, { set }) => icons.getCatalog(set));

route("POST", "/api/homepage/refresh", async () => {
  const { homepageUrl } = getAppSettings();
  if (!homepageUrl) throw new HttpError(400, "Set the Homepage URL first (Account & App page).");
  try {
    const r = await fetch(`${homepageUrl}/api/revalidate`, { signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: "Homepage has authentication enabled; click the refresh button on Homepage instead." };
    }
    if (r.status === 400) {
      const host = new URL(homepageUrl).host;
      return { ok: false, message: `Homepage rejected the host "${host}". Add it to HOMEPAGE_ALLOWED_HOSTS, or just reload Homepage — it picks up file changes by itself.` };
    }
    return { ok: r.ok, message: r.ok ? "Homepage cache cleared." : `Homepage answered HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, message: `Could not reach Homepage: ${e.message}` };
  }
});

route("GET", "/api/account", () => {
  const a = auth.loadAccount();
  return { username: a.username, totpEnabled: a.totpEnabled, createdAt: a.createdAt, sessionHours: env.sessionHours };
});
route("POST", "/api/account/password", async (req, res) => {
  const { current, next } = await json(req);
  const account = await auth.changePassword(current, next);
  res.setHeader("Set-Cookie", auth.sessionCookie(req, auth.issueSession(account), env.sessionHours * 3600));
  console.log(`[auth] password changed for ${account.username}`);
  return { ok: true };
});
route("POST", "/api/account/logout-all", (req, res) => {
  const account = auth.logoutEverywhere();
  res.setHeader("Set-Cookie", auth.sessionCookie(req, auth.issueSession(account), env.sessionHours * 3600));
  return { ok: true };
});
route("POST", "/api/account/totp/setup", () => auth.beginTotpSetup());
route("POST", "/api/account/totp/enable", async (req, res) => {
  const account = auth.enableTotp((await json(req)).code);
  res.setHeader("Set-Cookie", auth.sessionCookie(req, auth.issueSession(account), env.sessionHours * 3600));
  return { ok: true };
});
route("POST", "/api/account/totp/disable", async (req) => {
  await auth.disableTotp((await json(req)).password);
  return { ok: true };
});

// ---------- server ----------

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && serveStatic(res, path)) return;

  const match = routes
    .map((r) => ({ r, m: r.method === req.method && path.match(r.re) }))
    .find((x) => x.m);
  if (!match) {
    // Client-side routes fall back to the SPA shell.
    if (req.method === "GET" && !path.startsWith("/api/") && serveStatic(res, "/")) return;
    return send(res, 404, { error: "Not found" });
  }

  const { r, m } = match;
  const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  if (!r.open) {
    req.session = auth.readSession(req);
    if (!req.session) throw new HttpError(401, "Not signed in.");
  }
  const result = await r.handler(req, res, params);
  if (!res.headersSent && result !== undefined) send(res, 200, result);
}

export async function start() {
  auth.initAuth();
  await auth.bootstrap();
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err.status ?? 500;
      if (status >= 500) console.error(err);
      if (!res.headersSent) send(res, status, { error: status >= 500 && !err.status ? "Internal error" : err.message, ...(err.extra ?? {}) });
    });
  });
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  await new Promise((resolve) => server.listen(env.port, env.host, resolve));
  // PID 1 in a container ignores signals unless handled.
  for (const sig of ["SIGTERM", "SIGINT"]) process.once(sig, () => server.close(() => process.exit(0)));
  console.log(`Homepage Config ${pkg.version} listening on http://${env.host}:${env.port}`);
  console.log(`  config dir: ${env.configDir}`);
  console.log(`  data dir:   ${env.dataDir}`);
  console.log(`  icons dir:  ${env.iconsDir}`);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) start();
