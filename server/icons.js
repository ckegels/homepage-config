import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, renameSync } from "node:fs";
import { join, extname } from "node:path";

import { env } from "./env.js";
import { HttpError } from "./config-files.js";

export const ICON_TYPES = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};
export const MAX_ICON_BYTES = 5 * 1024 * 1024;
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,120}$/i;

export function cleanIconName(name) {
  const base = String(name || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-+/g, "-")
    .toLowerCase();
  const ext = extname(base);
  if (!ICON_TYPES[ext]) throw new HttpError(400, `Unsupported icon type "${ext || "none"}". Use ${Object.keys(ICON_TYPES).join(", ")}.`);
  if (!NAME_RE.test(base)) throw new HttpError(400, "Invalid icon file name.");
  return base;
}

// Magic-number check so a renamed HTML/JS file can't be stored as an "image".
function sniff(buf, ext) {
  const hex = buf.subarray(0, 12).toString("hex");
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  switch (ext) {
    case ".png":
      return hex.startsWith("89504e47");
    case ".jpg":
    case ".jpeg":
      return hex.startsWith("ffd8ff");
    case ".gif":
      return hex.startsWith("47494638");
    case ".webp":
      return hex.startsWith("52494646") && buf.subarray(8, 12).toString() === "WEBP";
    case ".ico":
      return hex.startsWith("00000100");
    case ".avif":
      return buf.subarray(4, 12).toString().startsWith("ftypavi");
    case ".svg":
      return head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!--") || head.startsWith("<!doctype svg");
    default:
      return false;
  }
}

// Strip active content from SVGs. They are also served with a sandbox CSP.
function sanitizeSvg(text) {
  return text
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, "$1#");
}

export function listLocalIcons() {
  if (!existsSync(env.iconsDir)) return [];
  return readdirSync(env.iconsDir)
    .filter((f) => ICON_TYPES[extname(f).toLowerCase()] && NAME_RE.test(f))
    .map((name) => {
      const st = statSync(join(env.iconsDir, name));
      return { name, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveIcon(rawName, buf, { overwrite = false } = {}) {
  const name = cleanIconName(rawName);
  const ext = extname(name);
  if (!buf?.length) throw new HttpError(400, "Empty file.");
  if (buf.length > MAX_ICON_BYTES) throw new HttpError(413, "Icon is larger than 5 MB.");
  if (!sniff(buf, ext)) throw new HttpError(400, `File content does not look like a ${ext} image.`);
  if (ext === ".svg") buf = Buffer.from(sanitizeSvg(buf.toString("utf8")));
  mkdirSync(env.iconsDir, { recursive: true });
  const target = join(env.iconsDir, name);
  if (existsSync(target) && !overwrite) throw new HttpError(409, `An icon named "${name}" already exists.`, { exists: true });
  writeFileSync(target, buf);
  return { name, size: buf.length };
}

export function deleteIcon(name) {
  if (!NAME_RE.test(name)) throw new HttpError(400, "Invalid icon name.");
  const p = join(env.iconsDir, name);
  if (!existsSync(p)) throw new HttpError(404, "Icon not found.");
  unlinkSync(p);
}

export function renameIcon(from, to) {
  if (!NAME_RE.test(from)) throw new HttpError(400, "Invalid icon name.");
  const target = cleanIconName(to);
  if (extname(target) !== extname(from).toLowerCase()) throw new HttpError(400, "Renaming cannot change the file type.");
  const src = join(env.iconsDir, from);
  if (!existsSync(src)) throw new HttpError(404, "Icon not found.");
  if (existsSync(join(env.iconsDir, target))) throw new HttpError(409, `"${target}" already exists.`);
  renameSync(src, join(env.iconsDir, target));
  return { name: target };
}

export function readIcon(name) {
  if (!NAME_RE.test(name)) return null;
  const ext = extname(name).toLowerCase();
  const p = join(env.iconsDir, name);
  if (!ICON_TYPES[ext] || !existsSync(p)) return null;
  return { body: readFileSync(p), type: ICON_TYPES[ext] };
}

function assertPublicHttpUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "Only http(s) URLs can be imported.");
  return url;
}

export async function importIcon(rawUrl, rawName, overwrite) {
  if (!env.allowRemote) throw new HttpError(403, "Remote fetching is disabled (ALLOW_REMOTE_FETCH=false).");
  const url = assertPublicHttpUrl(rawUrl);
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new HttpError(502, `Download failed: HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_ICON_BYTES) throw new HttpError(413, "Remote file is larger than 5 MB.");
  const buf = Buffer.from(await res.arrayBuffer());
  let name = rawName;
  if (!name) {
    name = decodeURIComponent(url.pathname.split("/").pop() || "icon");
    if (!ICON_TYPES[extname(name).toLowerCase()]) {
      const type = (res.headers.get("content-type") || "").split(";")[0];
      const ext = Object.entries(ICON_TYPES).find(([, t]) => t === type)?.[0] ?? ".png";
      name += ext;
    }
  }
  return saveIcon(name, buf, { overwrite });
}

// ---------- remote icon catalogs (names only, cached for a day) ----------

const CATALOGS = {
  dashboard: {
    url: "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/tree.json",
    reduce: (tree) => {
      const map = new Map();
      for (const fmt of ["svg", "png", "webp"]) {
        for (const file of tree[fmt] ?? []) {
          const n = file.replace(/\.(svg|png|webp)$/, "");
          if (!map.has(n)) map.set(n, []);
          map.get(n).push(fmt);
        }
      }
      return [...map].map(([n, f]) => ({ n, f }));
    },
  },
  mdi: {
    url: "https://cdn.jsdelivr.net/npm/@mdi/svg@latest/meta.json",
    reduce: (meta) => meta.filter((i) => !i.deprecated).map((i) => ({ n: i.name, a: [...(i.aliases ?? []), ...(i.tags ?? [])].join(" ").toLowerCase() })),
  },
  si: {
    url: "https://cdn.jsdelivr.net/npm/simple-icons@latest/data/simple-icons.json",
    reduce: (list) => list.map((i) => ({ n: i.slug ?? titleToSlug(i.title), t: i.title, h: i.hex })),
  },
  sh: {
    url: "https://cdn.jsdelivr.net/gh/selfhst/icons@main/index.json",
    reduce: (list) =>
      list.map((i) => ({
        n: i.Reference,
        t: i.Name,
        f: ["svg", "png", "webp"].filter((f) => i[f.toUpperCase()] === "Yes"),
      })),
  },
};

// Same algorithm simple-icons uses for slugs.
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/\./g, "dot")
    .replace(/&/g, "and")
    .replace(/đ/g, "d")
    .replace(/ħ/g, "h")
    .replace(/ı/g, "i")
    .replace(/ĸ/g, "k")
    .replace(/ŀ/g, "l")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss")
    .replace(/ŧ/g, "t")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const memory = new Map();

export async function getCatalog(set) {
  const def = CATALOGS[set];
  if (!def) throw new HttpError(404, "Unknown icon set.");
  const cacheDir = join(env.dataDir, "cache");
  const cacheFile = join(cacheDir, `icons-${set}.json`);
  const fresh = (t) => Date.now() - t < 24 * 3600_000;
  if (memory.has(set) && fresh(memory.get(set).t)) return memory.get(set);
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (fresh(cached.t) || !env.allowRemote) {
      memory.set(set, cached);
      return cached;
    }
  }
  if (!env.allowRemote) throw new HttpError(503, "Icon catalogs need internet access (ALLOW_REMOTE_FETCH=false).");
  try {
    const res = await fetch(def.url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entry = { t: Date.now(), items: def.reduce(await res.json()) };
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(entry));
    memory.set(set, entry);
    return entry;
  } catch (e) {
    if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8")); // stale beats nothing
    throw new HttpError(502, `Could not load icon catalog: ${e.message}`);
  }
}
