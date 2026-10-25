import { html, useState } from "/vendor/htm-preact.js";
import { Page, Card, Loading, SaveBar, Empty, IconPreview, Field, TextInput, Notice, confirmDialog } from "../ui.js";
import { SchemaForm, ExtraYaml } from "../form.js";
import { SERVICE_FIELDS, SERVICE_KNOWN, DOCS } from "../schemas.js";
import { useConfigFile, useFileData, parseServices, serializeServices } from "../model.js";
import { move } from "../util.js";
import { FileError, CommentsNotice } from "./settings.js";
import { ServiceWidgetEditor, useWidgetCatalog } from "./widget-editor.js";

// Tree helpers. A path is a list of indices from the top-level groups down.
const at = (items, path) => path.reduce((node, i, depth) => (depth === 0 ? items[i] : node.items[i]), null);
function updateAt(items, path, fn) {
  if (path.length === 1) return items.map((x, i) => (i === path[0] ? fn(x) : x));
  return items.map((x, i) => (i === path[0] ? { ...x, items: updateAt(x.items, path.slice(1), fn) } : x));
}
function removeAt(items, path) {
  if (path.length === 1) return items.filter((_, i) => i !== path[0]);
  return updateAt(items, path.slice(0, -1), (g) => ({ ...g, items: g.items.filter((_, i) => i !== path[path.length - 1]) }));
}
function moveAt(items, path, delta) {
  if (path.length === 1) return move(items, path[0], path[0] + delta);
  return updateAt(items, path.slice(0, -1), (g) => ({ ...g, items: move(g.items, path[path.length - 1], path[path.length - 1] + delta) }));
}
const siblings = (items, path) => (path.length === 1 ? items : at(items, path.slice(0, -1)).items);
const samePath = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);

function allGroups(items, prefix = [], out = []) {
  items.forEach((it, i) => {
    if (it.kind !== "group") return;
    const path = [...prefix, i];
    out.push({ path, label: "— ".repeat(prefix.length) + it.name });
    allGroups(it.items, path, out);
  });
  return out;
}

function widgetsOf(props) {
  const list = [];
  if (props.widget) list.push(props.widget);
  if (Array.isArray(props.widgets)) list.push(...props.widgets);
  return list;
}
function withWidgets(props, list) {
  const next = { ...props };
  delete next.widget;
  delete next.widgets;
  if (list.length === 1) next.widget = list[0];
  else if (list.length > 1) next.widgets = list;
  return next;
}

function Tree({ items, path = [], selected, onSelect, onMove }) {
  return html`<ul class=${path.length ? "tree nested" : "tree"}>
    ${items.map((it, i) => {
      const p = [...path, i];
      const active = samePath(p, selected);
      const count = siblings(items, [i]).length;
      return html`<li key=${it.kind + it.name + i}>
        <div class=${active ? "tree-row active" : "tree-row"}>
          <button class="tree-label" onClick=${() => onSelect(p)}>
            ${it.kind === "group"
              ? html`<span class="tree-group">▸ ${it.name}</span><span class="muted small">${it.items.length}</span>`
              : html`<${IconPreview} icon=${it.props.icon} size=${18} /><span>${it.name}</span>${widgetsOf(it.props).length > 0 && html`<span class="dot" title="Has widget"></span>`}`}
          </button>
          <span class="tree-actions">
            <button class="icon-btn xs" title="Move up" disabled=${i === 0} onClick=${() => onMove(p, -1)}>↑</button>
            <button class="icon-btn xs" title="Move down" disabled=${i === count - 1} onClick=${() => onMove(p, 1)}>↓</button>
          </span>
        </div>
        ${it.kind === "group" && it.items.length > 0 && html`<${Tree} items=${it.items} path=${p} selected=${selected} onSelect=${onSelect} onMove=${onMove} />`}
      </li>`;
    })}
  </ul>`;
}

function uniqueName(list, base) {
  let name = base;
  let n = 2;
  while (list.some((x) => x.name === name)) name = `${base} ${n++}`;
  return name;
}

export function ServicesPage() {
  const f = useConfigFile("services.yaml", { parse: (d) => parseServices(d ?? []), serialize: serializeServices });
  const docker = useFileData("docker.yaml");
  const proxmox = useFileData("proxmox.yaml");
  const catalog = useWidgetCatalog();
  const [selected, setSelected] = useState(null);

  if (f.error) return html`<${Page} title="Services"><${FileError} f=${{ error: f.error }} name="services.yaml" /><//>`;
  if (!f.model) return html`<${Page} title="Services"><${Loading} /><//>`;

  const groups = f.model;
  const node = selected ? at(groups, selected) : null;
  const set = (next) => f.setModel(next);
  const context = { dockerServers: Object.keys(docker ?? {}), proxmoxNodes: Object.keys(proxmox ?? {}) };

  const addGroup = () => {
    const name = prompt("Name of the new group:", uniqueName(groups, "New group"));
    if (!name) return;
    set([...groups, { kind: "group", name, items: [] }]);
    setSelected([groups.length]);
  };
  const addService = (groupPath) => {
    const g = at(groups, groupPath);
    const name = uniqueName(g.items, "New service");
    set(updateAt(groups, groupPath, (x) => ({ ...x, items: [...x.items, { kind: "service", name, props: { href: "" } }] })));
    setSelected([...groupPath, g.items.length]);
  };
  const addNested = (groupPath) => {
    const g = at(groups, groupPath);
    const name = prompt("Name of the nested group:", uniqueName(g.items, "Subgroup"));
    if (!name) return;
    set(updateAt(groups, groupPath, (x) => ({ ...x, items: [...x.items, { kind: "group", name, items: [] }] })));
  };
  const onMove = (path, delta) => {
    set(moveAt(groups, path, delta));
    if (samePath(path, selected)) setSelected([...path.slice(0, -1), path[path.length - 1] + delta]);
  };
  const remove = (path) => {
    const n = at(groups, path);
    const what = n.kind === "group" ? `group "${n.name}" and everything in it` : `service "${n.name}"`;
    if (!confirmDialog(`Delete ${what}?`)) return;
    set(removeAt(groups, path));
    setSelected(null);
  };
  const moveToGroup = (path, targetPath) => {
    const n = at(groups, path);
    let next = removeAt(groups, path);
    // Removing may shift the target's indices if it came after the source in the same list.
    const fixed = targetPath.map((idx, d) => (d === path.length - 1 && samePath(targetPath.slice(0, d), path.slice(0, d)) && idx > path[d] ? idx - 1 : idx));
    next = updateAt(next, fixed, (g) => ({ ...g, items: [...g.items, n] }));
    set(next);
    setSelected([...fixed, at(next, fixed).items.length - 1]);
  };
  const duplicate = (path) => {
    const n = at(groups, path);
    const sibs = siblings(groups, path);
    const copy = { ...structuredClone(n), name: uniqueName(sibs, n.name + " copy") };
    const parent = path.slice(0, -1);
    if (!parent.length) set([...groups, copy]);
    else set(updateAt(groups, parent, (g) => ({ ...g, items: [...g.items, copy] })));
  };

  return html`<${Page} title="Services" subtitle="services.yaml — groups, services, status checks and widgets." docs=${DOCS.services}>
    <${CommentsNotice} file=${f.file} />
    <div class="split">
      <aside class="split-side card">
        <div class="card-head">
          <h2>Groups</h2>
          <button class="btn btn-s btn-primary" onClick=${addGroup}>+ Group</button>
        </div>
        ${groups.length === 0 ? html`<${Empty} title="No services yet">Create a group to start.<//>` : html`<${Tree} items=${groups} selected=${selected} onSelect=${setSelected} onMove=${onMove} />`}
      </aside>
      <section class="split-main">
        ${!node && html`<${Card}><${Empty} title="Select a group or service">Pick something on the left, or add a group.<//><//>`}
        ${node?.kind === "group" &&
        html`<${GroupEditor}
          group=${node}
          key=${selected.join(".")}
          onRename=${(name) => set(updateAt(groups, selected, (g) => ({ ...g, name })))}
          onAddService=${() => addService(selected)}
          onAddNested=${() => addNested(selected)}
          onDelete=${() => remove(selected)}
          onDuplicate=${() => duplicate(selected)}
          onSelectChild=${(i) => setSelected([...selected, i])}
        />`}
        ${node?.kind === "service" &&
        html`<${ServiceEditor}
          key=${selected.join(".")}
          service=${node}
          context=${context}
          catalog=${catalog}
          groups=${allGroups(groups).filter((g) => !samePath(g.path, selected.slice(0, -1)))}
          onChange=${(svc) => set(updateAt(groups, selected, () => svc))}
          onDelete=${() => remove(selected)}
          onDuplicate=${() => duplicate(selected)}
          onMoveTo=${(target) => moveToGroup(selected, target)}
        />`}
      </section>
    </div>
    <${SaveBar} dirty=${f.dirty} saving=${f.saving} onSave=${f.save} onDiscard=${f.discard} />
  <//>`;
}

function GroupEditor({ group, onRename, onAddService, onAddNested, onDelete, onDuplicate, onSelectChild }) {
  return html`<${Card}
    title=${`Group: ${group.name}`}
    actions=${html`<button class="btn btn-s btn-ghost" onClick=${onDuplicate}>Duplicate</button><button class="btn btn-s btn-danger" onClick=${onDelete}>Delete group</button>`}
  >
    <div class="form-grid">
      <${Field} label="Group name" help="Use a different name than any bookmark group. Columns, tabs and icon: see Layout & tabs.">
        ${(id) => html`<${TextInput} id=${id} value=${group.name} onChange=${(v) => onRename(v ?? "")} />`}
      <//>
    </div>
    <div class="row gap-s wrap">
      <button class="btn btn-primary" onClick=${onAddService}>+ Add service</button>
      <button class="btn" onClick=${onAddNested}>+ Add nested group</button>
      <a class="btn btn-ghost" href="#/layout">Layout options →</a>
    </div>
    ${group.items.length > 0 &&
    html`<div class="mini-list">
      ${group.items.map(
        (it, i) => html`<button class="mini-item" onClick=${() => onSelectChild(i)}>
          ${it.kind === "group" ? html`<span>▸</span>` : html`<${IconPreview} icon=${it.props.icon} size=${22} />`}
          <span>${it.name}</span>
          <span class="muted small">${it.kind === "group" ? `${it.items.length} items` : it.props.href || ""}</span>
        </button>`,
      )}
    </div>`}
  <//>`;
}

function ServiceEditor({ service, onChange, onDelete, onDuplicate, onMoveTo, groups, context, catalog }) {
  const props = service.props;
  const setProps = (p) => onChange({ ...service, props: p });
  const widgets = widgetsOf(props);
  const setWidgets = (list) => setProps(withWidgets(props, list));

  return html`
    <${Card}
      title=${html`<span class="row gap-s"><${IconPreview} icon=${props.icon} size=${26} /> ${service.name || "Unnamed service"}</span>`}
      actions=${html`
        <select class="input input-s" value="" onChange=${(e) => e.target.value && onMoveTo(JSON.parse(e.target.value))} title="Move to group">
          <option value="">Move to…</option>
          ${groups.map((g) => html`<option value=${JSON.stringify(g.path)}>${g.label}</option>`)}
        </select>
        <button class="btn btn-s btn-ghost" onClick=${onDuplicate}>Duplicate</button>
        <button class="btn btn-s btn-danger" onClick=${onDelete}>Delete</button>
      `}
    >
      <div class="form-grid">
        <${Field} label="Name" required help="Shown on the card. Must be unique within the group.">
          ${(id) => html`<${TextInput} id=${id} value=${service.name} onChange=${(v) => onChange({ ...service, name: v ?? "" })} />`}
        <//>
      </div>
      <${SchemaForm} schema=${SERVICE_FIELDS} value=${props} onChange=${setProps} context=${context} />
      <${ExtraYaml} schema=${SERVICE_FIELDS} value=${props} onChange=${setProps} alsoKnown=${SERVICE_KNOWN} label="Other service options (YAML)" />
    <//>

    <${Card}
      title="Widgets"
      docs=${DOCS.widgets}
      actions=${html`<button class="btn btn-s btn-primary" onClick=${() => setWidgets([...widgets, { type: undefined }])}>+ Add widget</button>`}
    >
      ${widgets.length === 0 && html`<p class="muted">No widget. Add one to show live data from this service (${catalog ? catalog.widgets.filter((w) => !w.aliasOf).length : "160+"} integrations).</p>`}
      ${widgets.length > 1 && html`<${Notice} kind="info">Several widgets per service work in services.yaml and Docker labels, but not with Kubernetes annotations.<//>`}
      ${widgets.map(
        (w, i) => html`<${ServiceWidgetEditor}
          key=${i}
          index=${i}
          total=${widgets.length}
          widget=${w}
          catalog=${catalog}
          onChange=${(nw) => setWidgets(widgets.map((x, j) => (j === i ? nw : x)))}
          onRemove=${() => confirmDialog("Remove this widget?") && setWidgets(widgets.filter((_, j) => j !== i))}
          onMove=${(d) => setWidgets(move(widgets, i, i + d))}
        />`,
      )}
    <//>
  `;
}
