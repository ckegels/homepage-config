import { html, useState } from "/vendor/htm-preact.js";
import { Page, Card, Loading, SaveBar, Empty, IconPreview, Field, TextInput, confirmDialog } from "../ui.js";
import { SchemaForm, ExtraYaml } from "../form.js";
import { BOOKMARK_FIELDS, DOCS } from "../schemas.js";
import { useConfigFile, parseBookmarks, serializeBookmarks } from "../model.js";
import { move } from "../util.js";
import { FileError, CommentsNotice } from "./settings.js";

const uniqueName = (list, base) => {
  let name = base;
  let n = 2;
  while (list.some((x) => x.name === name)) name = `${base} ${n++}`;
  return name;
};

export function BookmarksPage() {
  const f = useConfigFile("bookmarks.yaml", { parse: (d) => parseBookmarks(d ?? []), serialize: serializeBookmarks });
  const [sel, setSel] = useState(null); // { g, b? }

  if (f.error) return html`<${Page} title="Bookmarks"><${FileError} f=${{ error: f.error }} name="bookmarks.yaml" /><//>`;
  if (!f.model) return html`<${Page} title="Bookmarks"><${Loading} /><//>`;

  const groups = f.model;
  const set = f.setModel;
  const setGroup = (gi, g) => set(groups.map((x, i) => (i === gi ? g : x)));
  const group = sel ? groups[sel.g] : null;
  const bookmark = group && sel.b !== undefined ? group.items[sel.b] : null;

  const addGroup = () => {
    const name = prompt("Name of the new bookmark group:", uniqueName(groups, "Links"));
    if (!name) return;
    set([...groups, { name, items: [] }]);
    setSel({ g: groups.length });
  };
  const addBookmark = (gi) => {
    const g = groups[gi];
    setGroup(gi, { ...g, items: [...g.items, { name: uniqueName(g.items, "New bookmark"), props: { href: "https://" } }] });
    setSel({ g: gi, b: g.items.length });
  };

  return html`<${Page} title="Bookmarks" subtitle="bookmarks.yaml — simple links with an icon or two-letter abbreviation." docs=${DOCS.bookmarks}>
    <${CommentsNotice} file=${f.file} />
    <div class="split">
      <aside class="split-side card">
        <div class="card-head">
          <h2>Groups</h2>
          <button class="btn btn-s btn-primary" onClick=${addGroup}>+ Group</button>
        </div>
        ${groups.length === 0 && html`<${Empty} title="No bookmarks yet" />`}
        <ul class="tree">
          ${groups.map(
            (g, gi) => html`<li key=${gi}>
              <div class=${sel?.g === gi && sel.b === undefined ? "tree-row active" : "tree-row"}>
                <button class="tree-label" onClick=${() => setSel({ g: gi })}><span class="tree-group">▸ ${g.name}</span><span class="muted small">${g.items.length}</span></button>
                <span class="tree-actions">
                  <button class="icon-btn xs" disabled=${gi === 0} onClick=${() => (set(move(groups, gi, gi - 1)), setSel(null))}>↑</button>
                  <button class="icon-btn xs" disabled=${gi === groups.length - 1} onClick=${() => (set(move(groups, gi, gi + 1)), setSel(null))}>↓</button>
                </span>
              </div>
              <ul class="tree nested">
                ${g.items.map(
                  (b, bi) => html`<li key=${bi}>
                    <div class=${sel?.g === gi && sel.b === bi ? "tree-row active" : "tree-row"}>
                      <button class="tree-label" onClick=${() => setSel({ g: gi, b: bi })}>
                        ${b.props.icon ? html`<${IconPreview} icon=${b.props.icon} size=${18} />` : html`<span class="abbr">${b.props.abbr ?? "··"}</span>`}
                        <span>${b.name}</span>
                      </button>
                      <span class="tree-actions">
                        <button class="icon-btn xs" disabled=${bi === 0} onClick=${() => (setGroup(gi, { ...g, items: move(g.items, bi, bi - 1) }), setSel({ g: gi, b: bi - 1 }))}>↑</button>
                        <button class="icon-btn xs" disabled=${bi === g.items.length - 1} onClick=${() => (setGroup(gi, { ...g, items: move(g.items, bi, bi + 1) }), setSel({ g: gi, b: bi + 1 }))}>↓</button>
                      </span>
                    </div>
                  </li>`,
                )}
              </ul>
            </li>`,
          )}
        </ul>
      </aside>
      <section class="split-main">
        ${!group && html`<${Card}><${Empty} title="Select a group or bookmark" /><//>`}
        ${group &&
        !bookmark &&
        html`<${Card}
          title=${`Group: ${group.name}`}
          actions=${html`<button class="btn btn-s btn-danger" onClick=${() => confirmDialog(`Delete group "${group.name}" and its ${group.items.length} bookmarks?`) && (set(groups.filter((_, i) => i !== sel.g)), setSel(null))}>Delete group</button>`}
        >
          <div class="form-grid">
            <${Field} label="Group name" help="Must differ from every service group name.">
              ${(id) => html`<${TextInput} id=${id} value=${group.name} onChange=${(v) => setGroup(sel.g, { ...group, name: v ?? "" })} />`}
            <//>
          </div>
          <div class="row gap-s wrap">
            <button class="btn btn-primary" onClick=${() => addBookmark(sel.g)}>+ Add bookmark</button>
            <a class="btn btn-ghost" href="#/layout">Layout options (icons only, columns, tab) →</a>
          </div>
        <//>`}
        ${bookmark &&
        html`<${Card}
          key=${`${sel.g}.${sel.b}`}
          title=${html`<span class="row gap-s">${bookmark.props.icon ? html`<${IconPreview} icon=${bookmark.props.icon} size=${24} />` : html`<span class="abbr">${bookmark.props.abbr ?? "··"}</span>`} ${bookmark.name}</span>`}
          actions=${html`
            <select
              class="input input-s"
              value=""
              onChange=${(e) => {
                const target = Number(e.target.value);
                if (Number.isNaN(target) || e.target.value === "") return;
                const next = groups.map((g, i) => (i === sel.g ? { ...g, items: g.items.filter((_, j) => j !== sel.b) } : g));
                next[target] = { ...next[target], items: [...next[target].items, bookmark] };
                set(next);
                setSel({ g: target, b: next[target].items.length - 1 });
              }}
            >
              <option value="">Move to…</option>
              ${groups.map((g, i) => i !== sel.g && html`<option value=${i}>${g.name}</option>`)}
            </select>
            <button class="btn btn-s btn-danger" onClick=${() => confirmDialog(`Delete "${bookmark.name}"?`) && (setGroup(sel.g, { ...group, items: group.items.filter((_, j) => j !== sel.b) }), setSel({ g: sel.g }))}>Delete</button>
          `}
        >
          <div class="form-grid">
            <${Field} label="Name" required>
              ${(id) => html`<${TextInput} id=${id} value=${bookmark.name} onChange=${(v) => setGroup(sel.g, { ...group, items: group.items.map((b, j) => (j === sel.b ? { ...b, name: v ?? "" } : b)) })} />`}
            <//>
          </div>
          <${SchemaForm}
            schema=${BOOKMARK_FIELDS}
            value=${bookmark.props}
            context=${{ suggestIconName: bookmark.name }}
            onChange=${(props) => setGroup(sel.g, { ...group, items: group.items.map((b, j) => (j === sel.b ? { ...b, props } : b)) })}
          />
          <${ExtraYaml}
            schema=${BOOKMARK_FIELDS}
            value=${bookmark.props}
            onChange=${(props) => setGroup(sel.g, { ...group, items: group.items.map((b, j) => (j === sel.b ? { ...b, props } : b)) })}
          />
        <//>`}
      </section>
    </div>
    <${SaveBar} dirty=${f.dirty} saving=${f.saving} onSave=${f.save} onDiscard=${f.discard} />
  <//>`;
}
