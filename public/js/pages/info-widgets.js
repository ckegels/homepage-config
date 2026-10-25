import { html, useState } from "/vendor/htm-preact.js";
import { Page, Card, Loading, SaveBar, Empty, Modal, Field, YamlField, Notice, confirmDialog } from "../ui.js";
import { SchemaForm, ExtraYaml } from "../form.js";
import { INFO_WIDGETS, DOCS } from "../schemas.js";
import { useConfigFile, parseInfoWidgets, serializeInfoWidgets } from "../model.js";
import { move } from "../util.js";
import { FileError, CommentsNotice } from "./settings.js";

const docUrl = (type) => `https://gethomepage.dev/widgets/info/${type === "unifi_console" ? "unifi_controller" : type}/`;

export function InfoWidgetsPage() {
  const f = useConfigFile("widgets.yaml", { parse: (d) => parseInfoWidgets(d ?? []), serialize: serializeInfoWidgets });
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [yamlMode, setYamlMode] = useState({});

  if (f.error) return html`<${Page} title="Info widgets"><${FileError} f=${{ error: f.error }} name="widgets.yaml" /><//>`;
  if (!f.model) return html`<${Page} title="Info widgets"><${Loading} /><//>`;
  const list = f.model;
  const set = f.setModel;
  const update = (i, w) => set(list.map((x, j) => (j === i ? w : x)));

  return html`<${Page}
    title="Info widgets"
    subtitle="widgets.yaml — the header bar: clock, weather, search, system resources and more. Shown in this order; weather, search and date/time sit on the right."
    docs=${DOCS.infoWidgets}
    actions=${html`<button class="btn btn-primary" onClick=${() => setAdding(true)}>+ Add widget</button>`}
  >
    <${CommentsNotice} file=${f.file} />
    ${list.length === 0 && html`<${Card}><${Empty} title="No info widgets">Add a clock, weather or search bar to the top of Homepage.<//><//>`}
    ${list.map((w, i) => {
      const def = INFO_WIDGETS[w.type];
      const isOpen = open === i;
      return html`<section class="card" key=${i}>
        <div class="card-head clickable" onClick=${() => setOpen(isOpen ? null : i)}>
          <h2>
            <span class="drag-num">${i + 1}</span> ${def?.label ?? w.type}
            <code class="small muted">${w.type}</code>
            ${w.opts.label && html`<span class="muted small">“${w.opts.label}”</span>`}
          </h2>
          <div class="row gap-s" onClick=${(e) => e.stopPropagation()}>
            <a class="link-small" href=${docUrl(w.type)} target="_blank" rel="noopener noreferrer">docs ↗</a>
            <button class="icon-btn" disabled=${i === 0} onClick=${() => (set(move(list, i, i - 1)), setOpen(null))}>↑</button>
            <button class="icon-btn" disabled=${i === list.length - 1} onClick=${() => (set(move(list, i, i + 1)), setOpen(null))}>↓</button>
            <button class="icon-btn danger" onClick=${() => confirmDialog(`Remove the ${def?.label ?? w.type} widget?`) && (set(list.filter((_, j) => j !== i)), setOpen(null))}>✕</button>
            <button class="icon-btn" onClick=${() => setOpen(isOpen ? null : i)}>${isOpen ? "▴" : "▾"}</button>
          </div>
        </div>
        ${isOpen &&
        html`<div class="card-body">
          ${def && html`<p class="muted">${def.description}</p>`}
          ${!def && html`<${Notice} kind="warn">Unknown info widget type "${w.type}". Edit it as YAML.<//>`}
          <div class="row gap-s">
            <button class="btn btn-s btn-ghost" onClick=${() => setYamlMode({ ...yamlMode, [i]: !yamlMode[i] })}>${yamlMode[i] || !def ? "Show form" : "Edit as YAML"}</button>
          </div>
          ${yamlMode[i] || !def
            ? html`<${Field} label=${`${w.type} options (YAML)`} wide>
                ${(id) => html`<${YamlField} id=${id} rows=${10} value=${w.opts} onChange=${(v) => update(i, { ...w, opts: v && typeof v === "object" ? v : {} })} />`}
              <//>`
            : html`<${SchemaForm} schema=${def.fields} value=${w.opts} onChange=${(opts) => update(i, { ...w, opts })} />
                <${ExtraYaml} schema=${def.fields} value=${w.opts} onChange=${(opts) => update(i, { ...w, opts })} />`}
        </div>`}
      </section>`;
    })}
    ${adding &&
    html`<${Modal} title="Add an info widget" onClose=${() => setAdding(false)} wide>
      <div class="type-grid">
        ${Object.entries(INFO_WIDGETS).map(
          ([type, def]) => html`<button
            class="type-card"
            onClick=${() => {
              set([...list, { type, opts: { ...(def.defaults ?? {}) } }]);
              setOpen(list.length);
              setAdding(false);
            }}
          >
            <strong>${def.label}</strong><code class="small">${type}</code><span class="muted small">${def.description}</span>
          </button>`,
        )}
      </div>
    <//>`}
    <${SaveBar} dirty=${f.dirty} saving=${f.saving} onSave=${f.save} onDiscard=${f.discard} />
  <//>`;
}
