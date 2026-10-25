import { html, useState } from "/vendor/htm-preact.js";
import { Page, Card, Loading, SaveBar, Empty, IconPreview, confirmDialog } from "../ui.js";
import { SchemaForm } from "../form.js";
import { LAYOUT_FIELDS, DOCS } from "../schemas.js";
import { useConfigFile, useFileData, parseLayout, serializeLayout, parseServices, parseBookmarks, serviceGroupNames } from "../model.js";
import { move } from "../util.js";
import { FileError, CommentsNotice } from "./settings.js";

function summary(opts) {
  const bits = [];
  if (opts.tab) bits.push(`tab: ${opts.tab}`);
  if (opts.style) bits.push(opts.style + (opts.columns ? ` × ${opts.columns}` : ""));
  else if (opts.columns) bits.push(`${opts.columns} columns`);
  if (opts.header === false) bits.push("no header");
  if (opts.initiallyCollapsed) bits.push("collapsed");
  if (opts.iconsOnly) bits.push("icons only");
  return bits.join(" · ");
}

function GroupList({ list, onChange, depth = 0, kinds }) {
  const [open, setOpen] = useState(null);
  const update = (i, g) => onChange(list.map((x, j) => (j === i ? g : x)));
  return html`<div class=${depth ? "layout-list nested" : "layout-list"}>
    ${list.map(
      (g, i) => html`<div class="layout-item" key=${g.name}>
        <div class="layout-row">
          <div class="row gap-s grow" onClick=${() => setOpen(open === i ? null : i)} role="button" tabindex="0">
            <span class="drag-num">${i + 1}</span>
            ${g.opts.icon && html`<${IconPreview} icon=${g.opts.icon} size=${20} />`}
            <strong>${g.name}</strong>
            <span class="pill">${kinds[g.name] ?? "discovered / unknown"}</span>
            <span class="muted small">${summary(g.opts)}</span>
          </div>
          <button class="icon-btn" title="Move up" disabled=${i === 0} onClick=${() => onChange(move(list, i, i - 1))}>↑</button>
          <button class="icon-btn" title="Move down" disabled=${i === list.length - 1} onClick=${() => onChange(move(list, i, i + 1))}>↓</button>
          <button class="icon-btn" title="Edit" onClick=${() => setOpen(open === i ? null : i)}>${open === i ? "▴" : "▾"}</button>
          <button
            class="icon-btn danger"
            title="Remove layout settings for this group"
            onClick=${() => confirmDialog(`Remove layout settings for "${g.name}"? The group itself stays.`) && onChange(list.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
        ${open === i &&
        html`<div class="layout-edit">
          <${SchemaForm} schema=${LAYOUT_FIELDS} value=${g.opts} onChange=${(opts) => update(i, { ...g, opts })} />
          ${(g.children.length > 0 || kinds.__nested?.[g.name]?.length > 0) &&
          html`<h3 class="form-heading">Nested groups</h3>
            <${GroupList} list=${g.children} depth=${depth + 1} kinds=${kinds} onChange=${(children) => update(i, { ...g, children })} />
            ${(kinds.__nested?.[g.name] ?? [])
              .filter((n) => !g.children.some((c) => c.name === n))
              .map(
                (n) => html`<button class="btn btn-s btn-ghost" onClick=${() => update(i, { ...g, children: [...g.children, { name: n, opts: {}, children: [] }] })}>
                  + Settings for nested "${n}"
                </button>`,
              )}`}
        </div>`}
      </div>`,
    )}
  </div>`;
}

export function LayoutPage() {
  const f = useConfigFile("settings.yaml", { parse: (d) => d ?? {} });
  const services = useFileData("services.yaml");
  const bookmarks = useFileData("bookmarks.yaml");
  const [custom, setCustom] = useState("");

  if (f.error) return html`<${Page} title="Layout & tabs"><${FileError} f=${{ error: f.error }} name="settings.yaml" /><//>`;
  if (!f.model) return html`<${Page} title="Layout & tabs"><${Loading} /><//>`;

  const layout = parseLayout(f.model.layout);
  const setLayout = (list) => {
    const next = { ...f.model };
    const s = serializeLayout(list);
    if (s) next.layout = s;
    else delete next.layout;
    f.setModel(next);
  };

  // What kind each group is, and nested groups per parent (services.yaml only).
  const kinds = { __nested: {} };
  const svc = services ? parseServices(services) : [];
  for (const g of serviceGroupNames(svc)) kinds[g.name] = g.depth ? "nested service group" : "service group";
  const collectNested = (items) =>
    items.forEach((g) => {
      if (g.kind !== "group") return;
      kinds.__nested[g.name] = g.items.filter((x) => x.kind === "group").map((x) => x.name);
      collectNested(g.items);
    });
  collectNested(svc);
  for (const g of bookmarks ? parseBookmarks(bookmarks) : []) kinds[g.name] = kinds[g.name] ? "service + bookmark ⚠" : "bookmark group";

  const inLayout = new Set(layout.map((g) => g.name));
  const missing = Object.keys(kinds).filter((n) => n !== "__nested" && !inLayout.has(n) && kinds[n] !== "nested service group");
  const tabs = [...new Set(layout.map((g) => g.opts.tab).filter(Boolean))];
  const add = (name) => name && !inLayout.has(name) && setLayout([...layout, { name, opts: {}, children: [] }]);

  return html`<${Page}
    title="Layout & tabs"
    subtitle="Order of groups, row/column style, tabs, headers and group icons (settings.yaml → layout)."
    docs=${DOCS.settings + "#layout"}
  >
    <${CommentsNotice} file=${f.file} />
    ${tabs.length > 0 &&
    html`<${Card} title="Tabs">
      <div class="chips">${tabs.map((t) => html`<span class="chip active">${t}</span>`)}</div>
      <p class="muted small">Tabs follow the order of the first group using them. Groups without a tab appear on every tab. Link directly with <code>/#${encodeURIComponent(tabs[0].toLowerCase())}</code>.</p>
    <//>`}
    <${Card} title="Group order & options" docs=${DOCS.settings + "#layout"}>
      ${layout.length === 0 && html`<${Empty} title="No layout settings yet">Groups appear in file order with default options. Add groups below to arrange them.<//>`}
      <${GroupList} list=${layout} onChange=${setLayout} kinds=${kinds} />
      <div class="add-row">
        ${missing.map((n) => html`<button class="btn btn-s btn-ghost" onClick=${() => add(n)}>+ ${n}</button>`)}
        <div class="row gap-s">
          <input class="input" placeholder="Other group name (e.g. from Docker labels)" value=${custom} onInput=${(e) => setCustom(e.target.value)} />
          <button class="btn btn-s" onClick=${() => (add(custom.trim()), setCustom(""))}>Add</button>
        </div>
      </div>
      <p class="muted small">Groups in the layout come first, in this order. Others follow. Use different names for service and bookmark groups.</p>
    <//>
    <${SaveBar} dirty=${f.dirty} saving=${f.saving} onSave=${f.save} onDiscard=${f.discard} />
  <//>`;
}
