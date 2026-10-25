import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { env } from "./env.js";
import { HttpError } from "./config-files.js";

// Keys this app may manage in Homepage's .env (source / LXC installs only).
const MANAGED = /^(HOMEPAGE_[A-Z0-9_]+|PUID|PGID|LOG_TARGETS)$/;
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(raw) {
  const v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1);
  return v.replace(/\s+#.*$/, "");
}

function quote(value) {
  const v = String(value);
  if (/^[\w./:@,+-]*$/.test(v)) return v;
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function parseEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const m = line.match(LINE);
    if (m) values[m[1]] = unquote(m[2]);
  }
  return values;
}

/** Replace managed keys in place, append new ones, drop removed ones; keep comments and other lines. */
export function updateEnv(text, values) {
  const done = new Set();
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(LINE);
    if (!m || !MANAGED.test(m[1])) {
      out.push(line);
      continue;
    }
    const key = m[1];
    if (done.has(key)) continue; // collapse duplicates
    if (values[key] === undefined || values[key] === "") continue; // removed
    out.push(`${key}=${quote(values[key])}`);
    done.add(key);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  for (const [k, v] of Object.entries(values)) {
    if (!done.has(k) && v !== undefined && v !== "") out.push(`${k}=${quote(v)}`);
  }
  return out.join("\n") + "\n";
}

export function readEnvFile() {
  if (!env.homepageEnvFile) throw new HttpError(404, "HOMEPAGE_ENV_FILE is not configured.");
  const text = existsSync(env.homepageEnvFile) ? readFileSync(env.homepageEnvFile, "utf8") : "";
  const all = parseEnv(text);
  return { path: env.homepageEnvFile, values: Object.fromEntries(Object.entries(all).filter(([k]) => MANAGED.test(k))) };
}

export function writeEnvFile(values) {
  if (!env.homepageEnvFile) throw new HttpError(404, "HOMEPAGE_ENV_FILE is not configured.");
  if (!values || typeof values !== "object") throw new HttpError(400, "Expected values.");
  for (const [k, v] of Object.entries(values)) {
    if (!MANAGED.test(k)) throw new HttpError(400, `Not allowed in .env from here: ${k}`);
    if (typeof v !== "string") throw new HttpError(400, `${k} must be a string.`);
    if (/[\r\0]/.test(v)) throw new HttpError(400, `${k} contains invalid characters.`);
  }
  const p = env.homepageEnvFile;
  const before = existsSync(p) ? readFileSync(p, "utf8") : "";
  if (before) {
    const dir = join(env.dataDir, "backups", "homepage.env");
    mkdirSync(dir, { recursive: true });
    copyFileSync(p, join(dir, new Date().toISOString().replace(/[:.]/g, "-")));
    const all = readdirSync(dir).sort();
    for (const old of all.slice(0, Math.max(0, all.length - env.backupsPerFile))) unlinkSync(join(dir, old));
  }
  writeFileSync(p, updateEnv(before, values), { mode: 0o660 });
  return readEnvFile();
}

// ---------- restarting Homepage (systemd path unit watches the trigger file) ----------

let lastRestart = 0;

export function requestRestart() {
  if (!env.homepageRestartTrigger) throw new HttpError(404, "Restarting Homepage is not configured on this install.");
  if (Date.now() - lastRestart < 15_000) throw new HttpError(429, "Homepage was just restarted. Wait a few seconds.");
  lastRestart = Date.now();
  writeFileSync(env.homepageRestartTrigger, `${new Date().toISOString()}\n`);
  return { ok: true, message: "Homepage is restarting. It is back in a few seconds." };
}
