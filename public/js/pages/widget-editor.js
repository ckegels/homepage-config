import { html, useState, useEffect, useMemo } from "/vendor/htm-preact.js";
import { get } from "../api.js";
import { Field, Modal, YamlField, ChipSelect, Notice } from "../ui.js";
import { SchemaForm, ExtraYaml } from "../form.js";
import { WIDGET_COMMON_FIELDS } from "../schemas.js";
import { Markdown } from "../markdown.js";
import YAML from "../yaml.js";

let catalogPromise;
export function useWidgetCatalog() {
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    catalogPromise = catalogPromise ?? get("/api/widget-catalog");
    catalogPromise.then(setCatalog).catch(() => setCatalog({ widgets: [] }));
  }, []);
  return catalog;
}

/** Turn an option extracted from the docs into a form field spec. */
function specFor(opt) {
  const ex = opt.example;
  const placeholder = ex === null || ex === undefined || typeof ex === "object" ? undefined : String(ex);
  const base = { key: opt.key, label: opt.key, help: opt.hint || undefined, placeholder, required: !opt.optional && ["url", "key"].includes(opt.key) };
  if (opt.enum) return { ...base, type: "select", options: opt.enum };
  if (opt.examples && opt.kind !== "yaml" && opt.kind !== "list") {
    const values = opt.examples.filter((x) => typeof x !== "object");
    if (values.length > 1 && opt.kind === "text") return { ...base, type: "text", suggestions: values.map(String) };
  }
  switch (opt.kind) {
    case "boolean":
      return { ...base, type: "bool" };
    case "number":
      return { ...base, type: "number" };
    case "list":
      return Array.isArray(ex) && ex.every((x) => typeof x !== "object")
        ? { ...base, type: "list", placeholder: ex[0] !== undefined ? String(ex[0]) : undefined }
        : { ...base, type: "yaml", placeholder: YAMLish(ex) };
    case "yaml":
      return { ...base, type: "yaml", placeholder: ex ? YAMLish(ex) : undefined };
    default:
      return { ...base, type: opt.secret ? "secret" : opt.key === "url" || /url$/i.test(opt.key) ? "url" : "text" };
  }
}

const YAMLish = (v) => YAML.stringify(v, { lineWidth: 0 }).trimEnd().split("\n").slice(0, 12).join("\n");

export function WidgetTypePicker({ catalog, onPick, onClose }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return catalog.widgets.filter((w) => !w.aliasOf && (!term || w.name.toLowerCase().includes(term) || w.type.includes(term) || w.intro.toLowerCase().includes(term)));
  }, [q, catalog]);
  return html`<${Modal} title="Choose a widget type" onClose=${onClose} wide>
    <input class="input" placeholder=${`Search ${catalog.widgets.filter((w) => !w.aliasOf).length} widgets…`} value=${q} onInput=${(e) => setQ(e.target.value)} autofocus />
    <div class="type-grid">
      ${list.map(
        (w) => html`<button class="type-card" onClick=${() => onPick(w.type)}>
          <strong>${w.name}</strong>
          <code class="small">${w.type}</code>
          <span class="muted small clamp">${w.intro.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*_]/g, "")}</span>
        </button>`,
      )}
    </div>
    ${list.length === 0 && html`<p class="muted">No match. You can still type any widget type in the YAML.</p>`}
  <//>`;
}

export function ServiceWidgetEditor({ widget, onChange, onRemove, catalog, index, total, onMove }) {
  const [picking, setPicking] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [asYaml, setAsYaml] = useState(false);
  const def = catalog?.widgets.find((w) => w.type === widget.type);
  const specs = useMemo(() => (def ? def.options.map(specFor) : []), [def]);
  const known = ["type", "fields", ...WIDGET_COMMON_FIELDS.map((f) => f.key)];

  return html`<div class="widget-card">
    <div class="widget-card-head">
      <div class="row gap-s grow">
        <span class="pill pill-accent">widget ${total > 1 ? index + 1 : ""}</span>
        <strong>${def?.name ?? widget.type ?? "No type selected"}</strong>
        ${widget.type && html`<code class="small muted">type: ${widget.type}</code>`}
      </div>
      <button class="btn btn-s btn-ghost" onClick=${() => setPicking(true)}>${widget.type ? "Change type" : "Choose type"}</button>
      ${def?.markdown && html`<button class="btn btn-s btn-ghost" onClick=${() => setShowDocs(!showDocs)}>${showDocs ? "Hide docs" : "Docs"}</button>`}
      <button class="btn btn-s btn-ghost" onClick=${() => setAsYaml(!asYaml)}>${asYaml ? "Form" : "YAML"}</button>
      ${total > 1 && html`<button class="icon-btn" title="Move up" disabled=${index === 0} onClick=${() => onMove(-1)}>↑</button>`}
      <button class="icon-btn danger" title="Remove widget" onClick=${onRemove}>✕</button>
    </div>

    ${def?.aliasOf && html`<${Notice} kind="warn">"${widget.type}" is a legacy alias. Prefer <code>type: ${def.aliasOf}</code>.<//>`}
    ${widget.type && catalog && !def && html`<${Notice} kind="warn">Unknown widget type "${widget.type}" for this Homepage version. You can still edit it as YAML.<//>`}
    ${showDocs &&
    def &&
    html`<div class="docs-panel">
      <a class="link-small" href=${`https://gethomepage.dev/widgets/services/${def.doc}/`} target="_blank" rel="noopener noreferrer">Open on gethomepage.dev ↗</a>
      <${Markdown} source=${def.markdown} />
    </div>`}

    ${asYaml
      ? html`<${Field} label="Widget YAML" wide help="The complete widget block. Must include type.">
          ${(id) => html`<${YamlField} id=${id} rows=${10} value=${widget} onChange=${(v) => v && typeof v === "object" && !Array.isArray(v) && onChange(v)} />`}
        <//>`
      : html`
          ${def && specs.length > 0 && html`<${SchemaForm} schema=${specs} value=${widget} onChange=${onChange} />`}
          ${def?.allowedFields &&
          html`<${Field} label="Visible fields" wide help="Pick which blocks to show. Nothing selected shows the defaults.">
            <${ChipSelect} value=${widget.fields} options=${def.allowedFields} onChange=${(v) => onChange(v ? { ...widget, fields: v } : omitKey(widget, "fields"))} />
          <//>`}
          <details class="details">
            <summary>Common widget options (errors, headers, highlighting)</summary>
            <${SchemaForm} schema=${WIDGET_COMMON_FIELDS} value=${widget} onChange=${onChange} />
          </details>
          <${ExtraYaml} schema=${specs} value=${widget} onChange=${onChange} alsoKnown=${known} label="Other widget options (YAML)" />
        `}
    ${picking &&
    catalog &&
    html`<${WidgetTypePicker}
      catalog=${catalog}
      onClose=${() => setPicking(false)}
      onPick=${(type) => {
        setPicking(false);
        // Keep url/credentials when switching type, drop the rest.
        const keep = Object.fromEntries(Object.entries(widget).filter(([k]) => ["url", "username", "password", "key", "hideErrors", "headers"].includes(k)));
        onChange({ type, ...keep });
      }}
    />`}
  </div>`;
}

const omitKey = (o, k) => {
  const c = { ...o };
  delete c[k];
  return c;
};
