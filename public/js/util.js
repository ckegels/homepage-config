// Small helpers shared by pages: deep get/set on plain objects, cleaning, clipboard.

export const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

const isEmpty = (v) =>
  v === undefined ||
  v === "" ||
  (Array.isArray(v) && v.length === 0) ||
  (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

/** Immutable set. Setting undefined/"" removes the key and prunes empty parents. */
export function setPath(obj, path, value) {
  const keys = path.split(".");
  const root = obj && typeof obj === "object" && !Array.isArray(obj) ? { ...obj } : {};
  let cur = root;
  const chain = [root];
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k] && typeof cur[k] === "object" && !Array.isArray(cur[k]) ? { ...cur[k] } : {};
    cur[k] = next;
    cur = next;
    chain.push(cur);
  }
  const last = keys[keys.length - 1];
  if (isEmpty(value)) delete cur[last];
  else cur[last] = value;
  for (let i = keys.length - 2; i >= 0; i--) {
    if (isEmpty(chain[i + 1])) delete chain[i][keys[i]];
  }
  return root;
}

export function omit(obj, keys) {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) if (!keys.includes(k)) out[k] = v;
  return out;
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && Object.hasOwn(obj, k)) out[k] = obj[k];
  return out;
}

export function move(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function randomSecret(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

export const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Coerce text from an input into a number when it looks like one, keep env placeholders as text. */
export function numberish(text) {
  if (text === "" || text === undefined || text === null) return undefined;
  const t = String(text).trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

/** Where Homepage would load an icon reference from (for previews). */
export function iconPreviewUrl(icon) {
  if (!icon || typeof icon !== "string") return null;
  if (icon.startsWith("http://") || icon.startsWith("https://")) return icon;
  if (icon.startsWith("/icons/")) return icon; // same files are served by this app
  if (icon.startsWith("/")) return null;
  const m = icon.match(/^(mdi|si)-(.+?)(-#[0-9a-fA-F]{3,8})?$/);
  if (m) {
    return m[1] === "mdi"
      ? `https://cdn.jsdelivr.net/npm/@mdi/svg@latest/svg/${m[2]}.svg`
      : `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${m[2]}.svg`;
  }
  if (icon.startsWith("sh-")) {
    const name = icon.slice(3).replace(/\.(svg|png|webp)$/, "");
    const ext = icon.match(/\.(svg|png|webp)$/)?.[1] ?? "png";
    return `https://cdn.jsdelivr.net/gh/selfhst/icons@main/${ext}/${name}.${ext}`;
  }
  const ext = icon.match(/\.(svg|png|webp)$/)?.[1] ?? "png";
  const name = icon.replace(/\.(svg|png|webp)$/, "");
  return `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/${ext}/${name}.${ext}`;
}

export const iconColor = (icon) => (typeof icon === "string" ? icon.match(/^(?:mdi|si)-.+?-(#[0-9a-fA-F]{3,8})$/)?.[1] : null);

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
