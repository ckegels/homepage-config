import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, copyFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

import { env } from "./env.js";

// Every file Homepage reads from its config directory.
export const CONFIG_FILES = {
  "settings.yaml": { kind: "yaml", root: "map", docs: "https://gethomepage.dev/configs/settings/" },
  "services.yaml": { kind: "yaml", root: "seq", docs: "https://gethomepage.dev/configs/services/" },
  "bookmarks.yaml": { kind: "yaml", root: "seq", docs: "https://gethomepage.dev/configs/bookmarks/" },
  "widgets.yaml": { kind: "yaml", root: "seq", docs: "https://gethomepage.dev/configs/info-widgets/" },
  "docker.yaml": { kind: "yaml", root: "map", docs: "https://gethomepage.dev/configs/docker/" },
  "kubernetes.yaml": { kind: "yaml", root: "map", docs: "https://gethomepage.dev/configs/kubernetes/" },
  "proxmox.yaml": { kind: "yaml", root: "map", docs: "https://gethomepage.dev/configs/proxmox/" },
  "custom.css": { kind: "text", docs: "https://gethomepage.dev/configs/custom-css-js/" },
  "custom.js": { kind: "text", docs: "https://gethomepage.dev/configs/custom-css-js/" },
};

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function assertKnown(name) {
  if (!Object.hasOwn(CONFIG_FILES, name)) throw new HttpError(404, `Unknown config file: ${name}`);
  return CONFIG_FILES[name];
}

const filePath = (name) => join(env.configDir, name);
const backupDir = (name) => join(env.dataDir, "backups", name);

// Homepage parses with js-yaml's CORE schema (YAML 1.2 booleans, merge keys).
export function parseYaml(text) {
  const doc = YAML.parseDocument(text, { schema: "core", merge: true, prettyErrors: true, uniqueKeys: false });
  if (doc.errors.length) {
    const e = doc.errors[0];
    const [start] = e.linePos ?? [];
    throw new HttpError(422, e.message.split("\n")[0], {
      line: start?.line,
      col: start?.col,
      errors: doc.errors.map((err) => ({ message: err.message.split("\n")[0], line: err.linePos?.[0]?.line, col: err.linePos?.[0]?.col })),
    });
  }
  return doc.toJS({ maxAliasCount: 1000 }) ?? null;
}

export function stringifyYaml(data) {
  if (data === null || data === undefined) return "---\n";
  return "---\n" + YAML.stringify(data, { schema: "core", lineWidth: 0, indent: 2, aliasDuplicateObjects: false });
}

function hasComments(text) {
  return text.split("\n").some((l) => /^\s*#/.test(l) || /\s#\s/.test(l.replace(/(["'])(?:(?!\1).)*\1/g, "")));
}

function checkRoot(meta, data) {
  if (data === null || meta.kind !== "yaml") return;
  if (meta.root === "seq" && !Array.isArray(data)) throw new HttpError(422, "This file must be a YAML list (entries starting with '- ').");
  if (meta.root === "map" && (Array.isArray(data) || typeof data !== "object")) {
    throw new HttpError(422, "This file must be a YAML mapping (key: value pairs).");
  }
}

export function listFiles() {
  return Object.entries(CONFIG_FILES).map(([name, meta]) => {
    const p = filePath(name);
    const exists = existsSync(p);
    const st = exists ? statSync(p) : null;
    return { name, kind: meta.kind, docs: meta.docs, exists, size: st?.size ?? 0, mtime: st?.mtimeMs ?? 0 };
  });
}

export function readFile(name) {
  const meta = assertKnown(name);
  const p = filePath(name);
  if (!existsSync(p)) return { name, kind: meta.kind, exists: false, text: "", data: null, mtime: 0, hasComments: false };
  const text = readFileSync(p, "utf8");
  const mtime = statSync(p).mtimeMs;
  const result = { name, kind: meta.kind, exists: true, text, mtime, data: null, hasComments: false, error: null };
  if (meta.kind === "yaml") {
    result.hasComments = hasComments(text);
    try {
      result.data = parseYaml(text);
    } catch (e) {
      result.error = { message: e.message, ...(e.extra ?? {}) };
    }
  }
  return result;
}

export function validate(name, text) {
  const meta = assertKnown(name);
  if (meta.kind !== "yaml") return { ok: true };
  try {
    checkRoot(meta, parseYaml(text));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message, ...(e.extra ?? {}) };
  }
}

function backup(name) {
  const p = filePath(name);
  if (!existsSync(p)) return null;
  const dir = backupDir(name);
  mkdirSync(dir, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(p, join(dir, id));
  const all = readdirSync(dir).sort();
  for (const old of all.slice(0, Math.max(0, all.length - env.backupsPerFile))) unlinkSync(join(dir, old));
  return id;
}

/**
 * Overwrite in place (keeps inode/ownership, works with single-file bind mounts).
 * If the file itself isn't writable (e.g. Homepage created it as root with 0644)
 * but the folder is, replace it via a temp file + rename instead.
 */
function writeInPlace(p, content) {
  try {
    writeFileSync(p, content, "utf8");
  } catch (e) {
    if (e.code !== "EACCES" && e.code !== "EPERM") throw e;
    const tmp = `${p}.hc-${process.pid}.tmp`;
    try {
      writeFileSync(tmp, content, "utf8");
      renameSync(tmp, p);
    } catch (inner) {
      if (existsSync(tmp)) unlinkSync(tmp);
      throw new HttpError(500, `Cannot write ${p}: ${inner.code ?? inner.message}. Check folder permissions (installer: --fix-permissions).`);
    }
  }
}

/**
 * Write a config file. Accepts either raw `text` or structured `data` (YAML
 * files only). `baseMtime` guards against overwriting edits made elsewhere.
 */
export function writeFile(name, { text, data, baseMtime, force }) {
  const meta = assertKnown(name);
  const p = filePath(name);
  if (!force && baseMtime !== undefined && existsSync(p)) {
    const current = statSync(p).mtimeMs;
    if (baseMtime && Math.abs(current - baseMtime) > 1) {
      throw new HttpError(409, `${name} was changed on disk since you opened it. Reload to see the latest version.`);
    }
  }
  let out = text;
  if (meta.kind === "yaml") {
    if (data !== undefined) out = stringifyYaml(data);
    if (typeof out !== "string") throw new HttpError(400, "Nothing to save");
    checkRoot(meta, parseYaml(out));
  } else if (typeof out !== "string") {
    throw new HttpError(400, "Nothing to save");
  }
  mkdirSync(env.configDir, { recursive: true });
  const backupId = backup(name);
  writeInPlace(p, out);
  return { ...readFile(name), backupId };
}

export function listBackups(name) {
  assertKnown(name);
  const dir = backupDir(name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .reverse()
    .map((id) => ({ id, size: statSync(join(dir, id)).size }));
}

export function readBackup(name, id) {
  assertKnown(name);
  if (!/^[0-9TZ-]+$/.test(id)) throw new HttpError(400, "Bad backup id");
  const p = join(backupDir(name), id);
  if (!existsSync(p)) throw new HttpError(404, "Backup not found");
  return readFileSync(p, "utf8");
}

export function restoreBackup(name, id) {
  return writeFile(name, { text: readBackup(name, id), force: true });
}
