import { html } from "/vendor/htm-preact.js";
import { Field, TextInput, SecretInput, NumberInput, TextArea, TriToggle, Select, StringList, ChipSelect, KeyValue, YamlField, IconInput } from "./ui.js";
import { getPath, setPath, move } from "./util.js";

/**
 * Renders a list of field specs against a plain object.
 *
 * spec: { key: "a.b", label, type, help, placeholder, options, required, fields (objlist), wide, render }
 * types: text | url | secret | number | bool | select | icon | textarea | list | chips | kv | yaml | objlist | custom
 *
 * Keys not mentioned in the schema are left untouched, so nothing unknown is lost.
 */
export function SchemaForm({ schema, value, onChange, context }) {
  return html`<div class="form-grid">
    ${schema.map((spec) => {
      if (spec.when && !spec.when(value ?? {}, context)) return null;
      if (spec.type === "heading") return html`<h3 class="form-heading field-wide">${spec.label}${spec.help && html`<small class="muted">${spec.help}</small>`}</h3>`;
      const v = getPath(value, spec.key);
      const set = (nv) => onChange(setPath(value ?? {}, spec.key, nv));
      return html`<${Field} key=${spec.key} label=${spec.label} help=${spec.help} required=${spec.required} wide=${spec.wide || ["textarea", "list", "kv", "yaml", "objlist", "chips"].includes(spec.type)}>
        ${(id) => renderControl(spec, v, set, id, value, context)}
      <//>`;
    })}
  </div>`;
}

export function renderControl(spec, v, set, id, whole, context) {
  const placeholder = spec.placeholder;
  switch (spec.type) {
    case "secret":
      return html`<${SecretInput} id=${id} value=${v} onChange=${set} placeholder=${placeholder} />`;
    case "number":
      return html`<${NumberInput} id=${id} value=${v} onChange=${set} placeholder=${placeholder} />`;
    case "bool":
      return html`<${TriToggle} value=${v} onChange=${set} defaultLabel=${spec.defaultLabel ?? "Default"} />`;
    case "select": {
      const options = typeof spec.options === "function" ? spec.options(whole, context) : spec.options;
      return html`<${Select} id=${id} value=${v} onChange=${set} options=${options} placeholder=${spec.placeholder ?? "Default"} />`;
    }
    case "icon":
      return html`<${IconInput} id=${id} value=${v} onChange=${set} suggestName=${context?.suggestIconName} />`;
    case "textarea":
      return html`<${TextArea} id=${id} value=${v} onChange=${set} placeholder=${placeholder} rows=${spec.rows} />`;
    case "list":
      return html`<${StringList} value=${v} onChange=${set} placeholder=${placeholder} />`;
    case "chips": {
      const options = typeof spec.options === "function" ? spec.options(whole, context) : spec.options;
      return html`<${ChipSelect} value=${v} onChange=${set} options=${options} max=${spec.max} />`;
    }
    case "kv":
      return html`<${KeyValue} value=${v} onChange=${set} keyPlaceholder=${spec.keyPlaceholder} valuePlaceholder=${spec.valuePlaceholder} secretValues=${spec.secretValues} />`;
    case "yaml":
      return html`<${YamlField} id=${id} value=${v} onChange=${set} rows=${spec.rows ?? 5} placeholder=${placeholder} />`;
    case "objlist":
      return html`<${ObjectList} value=${v} onChange=${set} fields=${spec.fields} addLabel=${spec.addLabel} />`;
    case "custom":
      return spec.render({ value: v, onChange: set, id, whole, context });
    case "url":
    case "text":
    default: {
      const listId = spec.suggestions ? `${id}-dl` : undefined;
      return html`<${TextInput} id=${id} value=${v === undefined || v === null ? undefined : String(v)} onChange=${(nv) => set(spec.coerce ? spec.coerce(nv) : nv)} placeholder=${placeholder} list=${listId} mono=${spec.type === "url" || spec.mono} />
        ${spec.suggestions && html`<datalist id=${listId}>${spec.suggestions.map((s) => html`<option value=${s} />`)}</datalist>`}`;
    }
  }
}

/** List of small objects, each edited with its own sub-schema (PWA icons, shortcuts…). */
export function ObjectList({ value, onChange, fields, addLabel = "Add" }) {
  const list = Array.isArray(value) ? value : [];
  const set = (next) => onChange(next.length ? next : undefined);
  return html`<div class="objlist">
    ${list.map(
      (item, i) => html`<div class="objlist-item" key=${i}>
        <${SchemaForm} schema=${fields} value=${item} onChange=${(nv) => set(list.map((x, j) => (j === i ? nv : x)))} />
        <div class="objlist-actions">
          <button type="button" class="icon-btn" title="Move up" disabled=${i === 0} onClick=${() => set(move(list, i, i - 1))}>↑</button>
          <button type="button" class="icon-btn" title="Move down" disabled=${i === list.length - 1} onClick=${() => set(move(list, i, i + 1))}>↓</button>
          <button type="button" class="icon-btn danger" title="Remove" onClick=${() => set(list.filter((_, j) => j !== i))}>✕</button>
        </div>
      </div>`,
    )}
    <button type="button" class="btn btn-s btn-ghost" onClick=${() => set([...list, {}])}>+ ${addLabel}</button>
  </div>`;
}

/** Top-level keys of `obj` that no spec in `schema` covers. */
export function unknownKeys(schema, obj, alsoKnown = []) {
  const known = new Set([...schema.filter((s) => s.key).map((s) => s.key.split(".")[0]), ...alsoKnown]);
  return Object.keys(obj ?? {}).filter((k) => !known.has(k));
}

/** YAML box for keys the form doesn't know about, so every option stays reachable. */
export function ExtraYaml({ schema, value, onChange, alsoKnown = [], label = "Other options (YAML)", help }) {
  const keys = unknownKeys(schema, value, alsoKnown);
  const extra = Object.fromEntries(keys.map((k) => [k, value[k]]));
  return html`<${Field}
    label=${label}
    wide
    help=${help ?? "Anything not covered by the form above. Written to the file exactly as entered."}
  >
    ${(id) => html`<${YamlField}
      id=${id}
      rows=${3}
      value=${keys.length ? extra : undefined}
      placeholder="someOption: value"
      onChange=${(nv) => {
        const base = { ...(value ?? {}) };
        for (const k of keys) delete base[k];
        if (nv && typeof nv === "object" && !Array.isArray(nv)) Object.assign(base, nv);
        onChange(base);
      }}
    />`}
  <//>`;
}
