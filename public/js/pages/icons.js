import { html, useState, useEffect, useMemo, useRef } from "/vendor/htm-preact.js";
import { api, get, post, del } from "../api.js";
import { Page, Card, Tabs, Modal, Loading, Notice, Empty, CopyButton, IconPreview, toast, confirmDialog, RestartHomepageButton } from "../ui.js";
import { bytes, iconPreviewUrl, copyText } from "../util.js";

export const SETS = [
  { id: "dashboard", label: "Dashboard Icons", site: "https://dashboardicons.com/" },
  { id: "sh", label: "selfh.st", site: "https://selfh.st/icons/" },
  { id: "mdi", label: "Material Design", site: "https://pictogrammers.com/library/mdi/" },
  { id: "si", label: "Simple Icons", site: "https://simpleicons.org/" },
];

/** Reference Homepage should use for an icon from a given source. */
export function iconRef(set, item, opts = {}) {
  switch (set) {
    case "local":
      return opts.iconMode === "url" && opts.iconBaseUrl ? `${opts.iconBaseUrl}${item.name}` : `/icons/${item.name}`;
    case "dashboard": {
      const fmt = item.f.includes("png") ? "png" : item.f[0];
      return `${item.n}.${fmt}`;
    }
    case "sh":
      return item.f.includes("png") ? `sh-${item.n}` : `sh-${item.n}.${item.f[0]}`;
    case "mdi":
      return `mdi-${item.n}${opts.color ? `-${opts.color}` : ""}`;
    case "si":
      return `si-${item.n}${opts.color ? `-${opts.color}` : ""}`;
    default:
      return "";
  }
}

const catalogCache = {};
function useCatalog(set) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    if (!set) return;
    setState({ loading: true });
    catalogCache[set] = catalogCache[set] ?? get(`/api/icon-catalog/${set}`);
    catalogCache[set]
      .then((c) => setState({ items: c.items }))
      .catch((e) => {
        delete catalogCache[set];
        setState({ error: e.message });
      });
  }, [set]);
  return state;
}

// ---------- uploads ----------

/**
 * Upload dropped/selected files.
 *  - dedupe: never overwrite; the server picks the next free name instead.
 *  - suggestName: name the icon after this (a service/bookmark name). Only used
 *    when a single file is added, so dropping several keeps their own names.
 */
async function uploadFiles(fileList, onDone, { dedupe = false, suggestName } = {}) {
  const files = [...fileList];
  const useSuggest = suggestName && files.length === 1;
  for (const file of files) {
    const params = new URLSearchParams({ name: file.name });
    if (dedupe) params.set("rename", "1");
    if (useSuggest) params.set("basename", suggestName);
    try {
      let res;
      try {
        res = await api(`/api/icons/upload?${params}`, { method: "POST", raw: file });
      } catch (e) {
        // Only the management page (no dedupe) offers to replace.
        if (!dedupe && e.status === 409 && confirmDialog(`"${file.name}" already exists. Replace it?`)) {
          params.set("overwrite", "1");
          res = await api(`/api/icons/upload?${params}`, { method: "POST", raw: file });
        } else throw e;
      }
      toast(`Saved ${res.name}`);
      onDone?.(res);
    } catch (e) {
      toast(`${file.name}: ${e.message}`, "error");
    }
  }
}

function DropZone({ onUploaded, compact, dedupe, suggestName }) {
  const input = useRef();
  const [over, setOver] = useState(false);
  const opts = { dedupe, suggestName };
  return html`<div
    class=${over ? "dropzone over" : "dropzone"}
    onDragOver=${(e) => (e.preventDefault(), setOver(true))}
    onDragLeave=${() => setOver(false)}
    onDrop=${(e) => {
      e.preventDefault();
      setOver(false);
      uploadFiles([...e.dataTransfer.files], onUploaded, opts);
    }}
    onClick=${() => input.current.click()}
    role="button"
    tabindex="0"
  >
    <input ref=${input} type="file" multiple accept=".png,.svg,.webp,.jpg,.jpeg,.gif,.ico,.avif" hidden onChange=${(e) => (uploadFiles([...e.target.files], onUploaded, opts), (e.target.value = ""))} />
    <strong>${compact ? "Upload icon" : "Drop icons here or click to upload"}</strong>
    <span class="muted small">PNG, SVG, WebP, JPG, GIF, ICO, AVIF · max 5 MB</span>
  </div>`;
}

function ImportFromUrl({ onDone }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let res;
      try {
        res = await post("/api/icons/import", { url, name: name || undefined });
      } catch (err) {
        if (err.status === 409 && confirmDialog(`${err.message} Replace it?`)) res = await post("/api/icons/import", { url, name: name || undefined, overwrite: true });
        else throw err;
      }
      toast(`Saved ${res.name}`);
      setUrl("");
      setName("");
      onDone?.(res);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return html`<form class="row gap-s wrap" onSubmit=${run}>
    <input class="input mono grow" type="url" required placeholder="https://example.com/logo.png" value=${url} onInput=${(e) => setUrl(e.target.value)} />
    <input class="input mono" style="max-width:14rem" placeholder="file name (optional)" value=${name} onInput=${(e) => setName(e.target.value)} />
    <button class="btn" disabled=${busy}>${busy ? "Downloading…" : "Import"}</button>
  </form>`;
}

function useLocalIcons() {
  const [data, setData] = useState(null);
  const load = () => get("/api/icons").then(setData).catch((e) => setData({ error: e.message, icons: [] }));
  useEffect(() => {
    load();
  }, []);
  return [data, load];
}

// ---------- library browser (shared by page and picker) ----------

function LibraryBrowser({ set, onSelect, actionLabel = "Use", onSave }) {
  const cat = useCatalog(set);
  const [q, setQ] = useState("");
  const [color, setColor] = useState("");
  const [limit, setLimit] = useState(150);
  const colorable = set === "mdi" || set === "si";
  const results = useMemo(() => {
    if (!cat.items) return [];
    const term = q.trim().toLowerCase();
    if (!term) return cat.items;
    const exact = [];
    const starts = [];
    const contains = [];
    for (const it of cat.items) {
      const hay = `${it.n} ${it.t ?? ""}`.toLowerCase();
      if (it.n === term || it.t?.toLowerCase() === term) exact.push(it);
      else if (it.n.startsWith(term)) starts.push(it);
      else if (hay.includes(term) || it.a?.includes(term)) contains.push(it);
    }
    return [...exact, ...starts, ...contains];
  }, [cat.items, q]);
  useEffect(() => setLimit(150), [q, set]);

  if (cat.loading) return html`<${Loading} label="Loading icon list…" />`;
  if (cat.error) return html`<${Notice} kind="error">${cat.error}<//>`;
  const info = SETS.find((s) => s.id === set);
  return html`<div class="stack-s">
    <div class="row gap-s wrap">
      <input class="input grow" type="search" placeholder=${`Search ${cat.items.length.toLocaleString()} icons…`} value=${q} onInput=${(e) => setQ(e.target.value)} autofocus />
      ${colorable &&
      html`<label class="row gap-s small">
        <input type="checkbox" checked=${!!color} onChange=${(e) => setColor(e.target.checked ? "#3b82f6" : "")} /> custom color
        ${color && html`<input type="color" value=${color} onInput=${(e) => setColor(e.target.value)} />`}
      </label>`}
      <a class="link-small" href=${info.site} target="_blank" rel="noopener noreferrer">${info.label} ↗</a>
    </div>
    <div class="icon-grid">
      ${results.slice(0, limit).map((it) => {
        const ref = iconRef(set, it, { color });
        return html`<div class="icon-tile" key=${it.n} title=${ref}>
          <button class="icon-tile-main" onClick=${() => onSelect(ref, it)}>
            <${IconPreview} icon=${ref} size=${40} />
            <span class="icon-name">${it.t ?? it.n}</span>
          </button>
          ${onSave &&
          (set === "dashboard" || set === "sh") &&
          html`<button class="icon-tile-save" title="Save a copy to my icons (works offline)" onClick=${() => onSave(ref, it)}>⤓</button>`}
        </div>`;
      })}
    </div>
    ${results.length === 0 && html`<p class="muted">No icons match “${q}”.</p>`}
    ${results.length > limit && html`<button class="btn btn-ghost" onClick=${() => setLimit(limit + 300)}>Show more (${results.length - limit} left)</button>`}
    <p class="muted small">${actionLabel === "Use" ? "Click an icon to use it." : "Click an icon to copy its reference."} Homepage loads these from the jsDelivr CDN in the visitor's browser.</p>
  </div>`;
}

async function saveRemoteCopy(ref, onDone) {
  const url = iconPreviewUrl(ref);
  const name = url.split("/").pop();
  try {
    const res = await post("/api/icons/import", { url, name });
    toast(`Saved ${res.name} to my icons`);
    onDone?.(res);
  } catch (e) {
    toast(e.message, "error");
  }
}

// ---------- my icons grid ----------

function LocalGrid({ data, reload, onSelect, manage }) {
  const [q, setQ] = useState("");
  const icons = (data?.icons ?? []).filter((i) => i.name.includes(q.toLowerCase()));
  if (!data) return html`<${Loading} />`;
  if (!data.icons.length) return html`<${Empty} title="No icons uploaded yet">Upload PNG/SVG/WebP files to use them on your dashboard.<//>`;
  return html`<div class="stack-s">
    ${data.icons.length > 12 && html`<input class="input" type="search" placeholder="Filter…" value=${q} onInput=${(e) => setQ(e.target.value)} />`}
    <div class="icon-grid">
      ${icons.map((ic) => {
        const ref = iconRef("local", ic, data);
        return html`<div class="icon-tile" key=${ic.name} title=${ref}>
          <button class="icon-tile-main" onClick=${() => onSelect(ref, ic)}>
            <span class="icon-preview" style="width:40px;height:40px"><img src=${`/icons/${encodeURIComponent(ic.name)}?v=${Math.round(ic.mtime)}`} alt="" /></span>
            <span class="icon-name">${ic.name}</span>
            ${manage && html`<span class="muted xsmall">${bytes(ic.size)}</span>`}
          </button>
          ${manage &&
          html`<div class="icon-tile-actions">
            <button
              class="icon-btn xs"
              title="Rename"
              onClick=${async () => {
                const to = prompt("New file name:", ic.name);
                if (!to || to === ic.name) return;
                try {
                  await post(`/api/icons/${encodeURIComponent(ic.name)}/rename`, { to });
                  toast("Renamed. Update services that used the old name.");
                  reload();
                } catch (e) {
                  toast(e.message, "error");
                }
              }}
            >
              ✎
            </button>
            <button
              class="icon-btn xs danger"
              title="Delete"
              onClick=${async () => {
                if (!confirmDialog(`Delete ${ic.name}? Services using it will show a broken icon.`)) return;
                try {
                  await del(`/api/icons/${encodeURIComponent(ic.name)}`);
                  reload();
                } catch (e) {
                  toast(e.message, "error");
                }
              }}
            >
              ✕
            </button>
          </div>`}
        </div>`;
      })}
    </div>
  </div>`;
}

function ModeNotice({ data, meta }) {
  if (!data) return null;
  if (data.iconMode === "url") {
    return html`<${Notice} kind="info">
      Icons are referenced by URL (<code>${data.iconBaseUrl || "set the base URL on Account & app"}</code>). Homepage visitors load them from this app, and new uploads
      show up immediately. Change this on <a href="#/account">Account & app</a>.
    <//>`;
  }
  if (meta?.canRestart) {
    return html`<${Notice} kind="info">
      <div class="row gap-s wrap between">
        <span>Icons are referenced as <code>/icons/name.png</code>. Homepage only finds <em>newly added</em> files after a restart.</span>
        <${RestartHomepageButton} meta=${meta} small />
      </div>
    <//>`;
  }
  return html`<${Notice} kind="info">
    Icons are referenced as <code>/icons/name.png</code>. Mount this app's icons folder into Homepage at <code>/app/public/icons</code>. Restart Homepage after adding <em>new</em>
    files so it finds them (Homepage limitation). To skip restarts, switch to URL mode on <a href="#/account">Account & app</a>.
  <//>`;
}

export function IconsPage({ meta }) {
  const [tab, setTab] = useState("mine");
  const [data, reload] = useLocalIcons();
  const copy = async (ref) => {
    await copyText(ref);
    toast(`Copied “${ref}”`);
  };
  return html`<${Page} title="Icons" subtitle="Upload your own icons or browse thousands of free ones. Pick icons right from any icon field.">
    <${Tabs}
      tabs=${[{ id: "mine", label: "My icons", badge: data?.icons?.length || null }, ...SETS.map((s) => ({ id: s.id, label: s.label }))]}
      value=${tab}
      onChange=${setTab}
    />
    ${tab === "mine"
      ? html`<${ModeNotice} data=${data} meta=${meta} />
          <${Card} title="Add icons">
            <${DropZone} onUploaded=${reload} />
            <h3 class="form-heading">Import from a URL</h3>
            <${ImportFromUrl} onDone=${reload} />
          <//>
          <${Card} title="Library" actions=${html`<span class="muted small">Click an icon to copy its reference</span>`}>
            <${LocalGrid} data=${data} reload=${reload} onSelect=${copy} manage />
          <//>`
      : html`<${Card}>
          <${LibraryBrowser} set=${tab} onSelect=${copy} actionLabel="Copy" onSave=${(ref) => saveRemoteCopy(ref, reload)} />
        <//>`}
  <//>`;
}

/** Modal opened from any icon field. `suggestName` is the service/bookmark name. */
export function IconPicker({ onPick, onClose, suggestName }) {
  const [tab, setTab] = useState("mine");
  const [data, reload] = useLocalIcons();
  const [url, setUrl] = useState("");
  return html`<${Modal} title="Choose an icon" onClose=${onClose} wide>
    <${Tabs} tabs=${[{ id: "mine", label: "My icons" }, ...SETS.map((s) => ({ id: s.id, label: s.label })), { id: "url", label: "URL" }]} value=${tab} onChange=${setTab} />
    ${tab === "mine" &&
    html`<div class="stack-s">
      ${suggestName && html`<p class="muted small">An uploaded icon is named after “${suggestName}”, keeping its file type. A number is added if that name is taken, so nothing is overwritten.</p>`}
      <${DropZone}
        compact
        dedupe
        suggestName=${suggestName}
        onUploaded=${(res) => {
          reload();
          if (res?.name) onPick(iconRef("local", res, data ?? {}));
        }}
      />
      <${LocalGrid} data=${data} reload=${reload} onSelect=${onPick} />
    </div>`}
    ${tab === "url" &&
    html`<form class="stack-s" onSubmit=${(e) => (e.preventDefault(), url && onPick(url))}>
      <p class="muted">Any image URL. Homepage visitors' browsers load it directly.</p>
      <div class="row gap-s">
        <${IconPreview} icon=${url} size=${40} />
        <input class="input mono grow" type="url" placeholder="https://…/icon.png" value=${url} onInput=${(e) => setUrl(e.target.value)} />
        <button class="btn btn-primary">Use</button>
      </div>
    </form>`}
    ${SETS.some((s) => s.id === tab) && html`<${LibraryBrowser} set=${tab} onSelect=${onPick} />`}
  <//>`;
}

export { CopyButton };
