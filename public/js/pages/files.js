import { html, useState, useEffect } from "/vendor/htm-preact.js";
import { get, put, post } from "../api.js";
import { Page, Card, Loading, Notice, SaveBar, Modal, toast, tabIndent, confirmDialog } from "../ui.js";
import YAML from "../yaml.js";
import { bytes } from "../util.js";

const FILES = ["settings.yaml", "services.yaml", "bookmarks.yaml", "widgets.yaml", "docker.yaml", "kubernetes.yaml", "proxmox.yaml", "custom.css", "custom.js"];
const ROOTS = { "settings.yaml": "map", "docker.yaml": "map", "kubernetes.yaml": "map", "proxmox.yaml": "map", "services.yaml": "seq", "bookmarks.yaml": "seq", "widgets.yaml": "seq" };

function check(name, text) {
  if (!name.endsWith(".yaml")) return null;
  const doc = YAML.parseDocument(text, { schema: "core", uniqueKeys: false });
  if (doc.errors.length) {
    const e = doc.errors[0];
    return { line: e.linePos?.[0]?.line, col: e.linePos?.[0]?.col, message: e.message.split("\n")[0] };
  }
  const data = doc.toJS();
  if (data === null || data === undefined) return null;
  if (ROOTS[name] === "seq" && !Array.isArray(data)) return { message: "This file must be a list (entries start with '- ')." };
  if (ROOTS[name] === "map" && (Array.isArray(data) || typeof data !== "object")) return { message: "This file must be a mapping (key: value)." };
  return null;
}

function LineNumbers({ text, errorLine }) {
  const n = text.split("\n").length;
  return html`<div class="gutter" aria-hidden="true">
    ${Array.from({ length: n }, (_, i) => html`<div class=${errorLine === i + 1 ? "err" : ""}>${i + 1}</div>`)}
  </div>`;
}

export function FilesPage({ arg }) {
  const [name, setName] = useState(FILES.includes(arg) ? arg : "settings.yaml");
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = async (n = name) => {
    setFile(null);
    const f = await get(`/api/files/${n}`);
    setFile(f);
    setText(f.text);
    setBackups(await get(`/api/backups/${n}`));
  };
  useEffect(() => {
    load(name);
  }, [name]);

  const dirty = file && text !== file.text;
  useEffect(() => {
    window.__hcDirty = window.__hcDirty || new Set();
    if (dirty) window.__hcDirty.add("raw:" + name);
    else window.__hcDirty.delete("raw:" + name);
    return () => window.__hcDirty.delete("raw:" + name);
  }, [dirty, name]);

  const err = file ? check(name, text) : null;

  const save = async () => {
    if (err && !confirmDialog("The file has errors and will be rejected by the server. Try anyway?")) return;
    setSaving(true);
    try {
      const f = await put(`/api/files/${name}`, { text, baseMtime: file.mtime });
      setFile(f);
      setText(f.text);
      setBackups(await get(`/api/backups/${name}`));
      toast(`${name} saved`);
    } catch (e) {
      toast(e.message + (e.data?.line ? ` (line ${e.data.line})` : ""), "error");
    } finally {
      setSaving(false);
    }
  };

  const switchFile = (n) => {
    if (dirty && !confirmDialog("Discard unsaved changes to this file?")) return;
    window.__hcDirty?.delete("raw:" + name);
    history.replaceState(null, "", `#/files/${n}`);
    setName(n);
  };

  const restore = async (id) => {
    if (!confirmDialog(`Restore ${name} from ${id}? The current version is backed up first.`)) return;
    try {
      const f = await post(`/api/backups/${name}/${id}/restore`);
      setFile(f);
      setText(f.text);
      setBackups(await get(`/api/backups/${name}`));
      setViewing(null);
      toast("Restored");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return html`<${Page} title="Files, CSS & JS" subtitle="Edit any config file directly. Comments and formatting are kept. Every save makes a backup.">
    <div class="file-tabs">
      ${FILES.map((n) => html`<button class=${n === name ? "chip active" : "chip"} onClick=${() => switchFile(n)}>${n}</button>`)}
    </div>
    ${name === "custom.css" &&
    html`<${Notice} kind="warn">custom.css is public even when Homepage authentication is on (it styles the sign-in page). Don't put secrets or internal URLs here.<//>`}
    ${name === "custom.js" && html`<${Notice} kind="warn">custom.js runs in every visitor's browser. Only add code you trust.<//>`}
    ${!file
      ? html`<${Loading} />`
      : html`<div class="editor-wrap">
          <div class="editor-head">
            <code>${name}</code>
            <span class="muted small">${file.exists ? `${bytes(file.size ?? file.text.length)} · modified ${new Date(file.mtime).toLocaleString()}` : "not created yet — saving creates it"}</span>
            <span class="grow"></span>
            ${name.endsWith(".yaml") && (err ? html`<span class="pill pill-error">✕ ${err.line ? `line ${err.line}: ` : ""}${err.message}</span>` : html`<span class="pill pill-ok">✓ valid YAML</span>`)}
          </div>
          <div class="editor">
            <${LineNumbers} text=${text} errorLine=${err?.line} />
            <textarea
              class="code-input"
              spellcheck=${false}
              value=${text}
              onInput=${(e) => setText(e.target.value)}
              onKeyDown=${(e) => {
                tabIndent(e);
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                  e.preventDefault();
                  if (dirty) save();
                }
              }}
              onScroll=${(e) => {
                const g = e.target.previousElementSibling;
                if (g) g.scrollTop = e.target.scrollTop;
              }}
            ></textarea>
          </div>
          <p class="muted small">Tab inserts two spaces · Ctrl/⌘+S saves</p>
        </div>`}

    <${Card} title="History" actions=${html`<span class="muted small">Last ${backups?.length ?? 0} versions before each save</span>`}>
      ${!backups?.length
        ? html`<p class="muted">No backups yet. Each save stores the previous version here.</p>`
        : html`<table class="table">
            <tbody>
              ${backups.map(
                (b) => html`<tr>
                  <td><code>${b.id.replace(/T(\d\d)-(\d\d)-(\d\d)-\d+Z/, " $1:$2:$3 UTC")}</code></td>
                  <td>${bytes(b.size)}</td>
                  <td class="right">
                    <button class="btn btn-s btn-ghost" onClick=${async () => setViewing({ id: b.id, text: (await get(`/api/backups/${name}/${b.id}`)).text })}>View</button>
                    <button class="btn btn-s" onClick=${() => restore(b.id)}>Restore</button>
                  </td>
                </tr>`,
              )}
            </tbody>
          </table>`}
    <//>
    ${viewing &&
    html`<${Modal}
      title=${`${name} — ${viewing.id}`}
      wide
      onClose=${() => setViewing(null)}
      footer=${html`<button class="btn btn-ghost" onClick=${() => setViewing(null)}>Close</button><button class="btn btn-primary" onClick=${() => restore(viewing.id)}>Restore this version</button>`}
    >
      <pre class="code tall"><code>${viewing.text}</code></pre>
    <//>`}
    <${SaveBar} dirty=${dirty} saving=${saving} onSave=${save} onDiscard=${() => setText(file.text)} />
  <//>`;
}
