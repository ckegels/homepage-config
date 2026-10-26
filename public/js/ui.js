import { html, useState, useEffect, useRef, useMemo } from "/vendor/htm-preact.js";
import YAML from "./yaml.js";
import { iconPreviewUrl, iconColor, numberish, move, copyText } from "./util.js";
import { post } from "./api.js";

// ---------- toasts ----------

let pushToast = () => {};
export const toast = (message, kind = "ok") => pushToast({ message, kind, id: Math.random() });

export function Toasts() {
  const [items, setItems] = useState([]);
  pushToast = (t) => {
    setItems((list) => [...list, t]);
    setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.kind === "error" ? 7000 : 3500);
  };
  return html`<div class="toasts" role="status" aria-live="polite">
    ${items.map((t) => html`<div class=${`toast toast-${t.kind}`} key=${t.id}>${t.message}</div>`)}
  </div>`;
}

// ---------- layout primitives ----------

export function Page({ title, subtitle, docs, actions, children }) {
  return html`<div class="page">
    <header class="page-head">
      <div>
        <h1>${title}</h1>
        ${subtitle && html`<p class="muted">${subtitle}</p>`}
      </div>
      <div class="page-actions">
        ${docs && html`<a class="btn btn-ghost" href=${docs} target="_blank" rel="noopener noreferrer">Docs ↗</a>`} ${actions}
      </div>
    </header>
    ${children}
  </div>`;
}

export function Card({ title, docs, actions, children, class: cls = "" }) {
  return html`<section class=${`card ${cls}`}>
    ${(title || actions) &&
    html`<div class="card-head">
      <h2>${title}</h2>
      <div class="row gap-s">
        ${docs && html`<a class="link-small" href=${docs} target="_blank" rel="noopener noreferrer">docs ↗</a>`} ${actions}
      </div>
    </div>`}
    <div class="card-body">${children}</div>
  </section>`;
}

export function Notice({ kind = "info", children }) {
  return html`<div class=${`notice notice-${kind}`}>${children}</div>`;
}

export function Loading({ label = "Loading…" }) {
  return html`<div class="loading"><span class="spinner"></span>${label}</div>`;
}

export function Tabs({ tabs, value, onChange }) {
  return html`<div class="tabs" role="tablist">
    ${tabs.map(
      (t) =>
        html`<button role="tab" aria-selected=${value === t.id} class=${value === t.id ? "tab active" : "tab"} onClick=${() => onChange(t.id)}>
          ${t.label}${t.badge ? html` <span class="badge">${t.badge}</span>` : ""}
        </button>`,
    )}
  </div>`;
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return html`<div class="modal-backdrop" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class=${wide ? "modal modal-wide" : "modal"} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="icon-btn" onClick=${onClose} aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${children}</div>
      ${footer && html`<div class="modal-foot">${footer}</div>`}
    </div>
  </div>`;
}

export function confirmDialog(message) {
  return window.confirm(message);
}

// ---------- form fields ----------

let fieldIds = 0;
const useId = () => useMemo(() => `f${++fieldIds}`, []);

export function Field({ label, help, required, children, wide, error }) {
  const id = useId();
  return html`<div class=${wide ? "field field-wide" : "field"}>
    ${label && html`<label class="field-label" for=${id}>${label}${required && html`<span class="req" title="Required">*</span>`}</label>`}
    ${typeof children === "function" ? children(id) : children}
    ${error && html`<div class="field-error">${error}</div>`}
    ${help && html`<div class="field-help">${help}</div>`}
  </div>`;
}

export function TextInput({ value, onChange, placeholder, type = "text", id, list, mono, autoComplete = "off" }) {
  return html`<input
    id=${id}
    class=${mono ? "input mono" : "input"}
    type=${type}
    value=${value ?? ""}
    placeholder=${placeholder ?? ""}
    list=${list}
    autocomplete=${autoComplete}
    spellcheck=${false}
    onInput=${(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
  />`;
}

export function SecretInput({ value, onChange, placeholder, id }) {
  const [show, setShow] = useState(false);
  return html`<div class="input-group">
    <input
      id=${id}
      class="input mono"
      type=${show ? "text" : "password"}
      value=${value ?? ""}
      placeholder=${placeholder ?? ""}
      autocomplete="new-password"
      spellcheck=${false}
      onInput=${(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
    <button type="button" class="btn btn-ghost btn-s" onClick=${() => setShow(!show)}>${show ? "Hide" : "Show"}</button>
  </div>`;
}

/** Number field that also accepts {{HOMEPAGE_VAR_…}} placeholders. */
export function NumberInput({ value, onChange, placeholder, id, min, max }) {
  return html`<input
    id=${id}
    class="input"
    inputmode="decimal"
    value=${value ?? ""}
    placeholder=${placeholder ?? ""}
    min=${min}
    max=${max}
    onInput=${(e) => onChange(numberish(e.target.value))}
  />`;
}

export function TextArea({ value, onChange, placeholder, rows = 4, id, mono = true }) {
  return html`<textarea
    id=${id}
    class=${mono ? "input mono" : "input"}
    rows=${rows}
    placeholder=${placeholder ?? ""}
    spellcheck=${false}
    onInput=${(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
  >${value ?? ""}</textarea>`;
}

/** Three-state switch: not set (Homepage default) / on / off. */
export function TriToggle({ value, onChange, defaultLabel = "Default" }) {
  const opt = (v, label) =>
    html`<button type="button" class=${value === v ? "seg active" : "seg"} aria-pressed=${value === v} onClick=${() => onChange(v)}>${label}</button>`;
  return html`<div class="segmented">${opt(undefined, defaultLabel)}${opt(true, "On")}${opt(false, "Off")}</div>`;
}

export function Switch({ checked, onChange, label }) {
  return html`<label class="switch">
    <input type="checkbox" checked=${!!checked} onChange=${(e) => onChange(e.target.checked)} />
    <span class="switch-track"><span class="switch-thumb"></span></span>
    ${label && html`<span>${label}</span>`}
  </label>`;
}

export function Select({ value, onChange, options, placeholder = "Default", id, allowEmpty = true }) {
  const norm = options.map((o) => (typeof o === "object" ? o : { value: o, label: String(o) }));
  const known = value === undefined || norm.some((o) => String(o.value) === String(value));
  return html`<select
    id=${id}
    class="input"
    value=${value === undefined ? "" : String(value)}
    onChange=${(e) => {
      const raw = e.target.value;
      if (raw === "") return onChange(undefined);
      const hit = norm.find((o) => String(o.value) === raw);
      onChange(hit ? hit.value : raw);
    }}
  >
    ${allowEmpty && html`<option value="">${placeholder}</option>`}
    ${!known && html`<option value=${String(value)}>${String(value)} (custom)</option>`}
    ${norm.map((o) => html`<option value=${String(o.value)}>${o.label}</option>`)}
  </select>`;
}

/** Editable list of strings. */
export function StringList({ value, onChange, placeholder, addLabel = "Add" }) {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const [draft, setDraft] = useState("");
  const set = (next) => onChange(next.length ? next : undefined);
  const add = () => {
    if (!draft.trim()) return;
    set([...list, draft.trim()]);
    setDraft("");
  };
  return html`<div class="string-list">
    ${list.map(
      (item, i) => html`<div class="row gap-s" key=${i}>
        <input class="input mono" value=${String(item)} onInput=${(e) => set(list.map((x, j) => (j === i ? e.target.value : x)))} />
        <button type="button" class="icon-btn" title="Move up" disabled=${i === 0} onClick=${() => set(move(list, i, i - 1))}>↑</button>
        <button type="button" class="icon-btn" title="Remove" onClick=${() => set(list.filter((_, j) => j !== i))}>✕</button>
      </div>`,
    )}
    <div class="row gap-s">
      <input
        class="input mono"
        value=${draft}
        placeholder=${placeholder ?? ""}
        onInput=${(e) => setDraft(e.target.value)}
        onKeyDown=${(e) => e.key === "Enter" && (e.preventDefault(), add())}
      />
      <button type="button" class="btn btn-s" onClick=${add}>${addLabel}</button>
    </div>
  </div>`;
}

/** Toggleable chips, for picking a subset of known values (e.g. widget fields). */
export function ChipSelect({ value, onChange, options, max }) {
  const list = Array.isArray(value) ? value : [];
  const extra = list.filter((v) => !options.includes(v));
  const toggle = (opt) => {
    const next = list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt];
    onChange(next.length ? next : undefined);
  };
  return html`<div class="chips">
    ${[...options, ...extra].map(
      (opt) =>
        html`<button
          type="button"
          class=${list.includes(opt) ? "chip active" : "chip"}
          aria-pressed=${list.includes(opt)}
          disabled=${max && !list.includes(opt) && list.length >= max}
          onClick=${() => toggle(opt)}
        >
          ${opt}
        </button>`,
    )}
  </div>`;
}

/** Key/value editor for flat string maps (headers, providers…). */
export function KeyValue({ value, onChange, keyPlaceholder = "Name", valuePlaceholder = "Value", secretValues }) {
  const entries = Object.entries(value && typeof value === "object" ? value : {});
  const emit = (list) => {
    const obj = {};
    for (const [k, v] of list) if (k !== "") obj[k] = v;
    onChange(Object.keys(obj).length ? obj : undefined);
  };
  const [rows, setRows] = useState(entries.length ? entries : []);
  useEffect(() => {
    const current = rows.filter(([k]) => k !== "");
    if (JSON.stringify(current) !== JSON.stringify(entries)) setRows(entries);
  }, [JSON.stringify(entries)]);
  const update = (next) => {
    setRows(next);
    emit(next);
  };
  return html`<div class="kv">
    ${rows.map(
      ([k, v], i) => html`<div class="row gap-s" key=${i}>
        <input class="input mono" placeholder=${keyPlaceholder} value=${k} onInput=${(e) => update(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
        <input
          class="input mono"
          type=${secretValues ? "password" : "text"}
          autocomplete="new-password"
          placeholder=${valuePlaceholder}
          value=${typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
          onInput=${(e) => update(rows.map((r, j) => (j === i ? [r[0], numberishKeep(e.target.value)] : r)))}
        />
        <button type="button" class="icon-btn" title="Remove" onClick=${() => update(rows.filter((_, j) => j !== i))}>✕</button>
      </div>`,
    )}
    <button type="button" class="btn btn-s btn-ghost" onClick=${() => setRows([...rows, ["", ""]])}>+ Add entry</button>
  </div>`;
}
const numberishKeep = (v) => v;

/** Free-form YAML for nested/advanced values. Parses on every change, reports errors inline. */
export function YamlField({ value, onChange, rows = 6, placeholder, id }) {
  const toText = (v) => (v === undefined || v === null ? "" : YAML.stringify(v, { lineWidth: 0 }).trimEnd());
  const [text, setText] = useState(toText(value));
  const [error, setError] = useState(null);
  const last = useRef(value);
  useEffect(() => {
    if (JSON.stringify(value) !== JSON.stringify(last.current)) {
      setText(toText(value));
      last.current = value;
      setError(null);
    }
  }, [JSON.stringify(value)]);
  const onInput = (e) => {
    const t = e.target.value;
    setText(t);
    if (!t.trim()) {
      setError(null);
      last.current = undefined;
      return onChange(undefined);
    }
    const doc = YAML.parseDocument(t, { schema: "core" });
    if (doc.errors.length) {
      const err = doc.errors[0];
      setError(`Line ${err.linePos?.[0]?.line ?? "?"}: ${err.message.split("\n")[0]}`);
      return;
    }
    setError(null);
    const parsed = doc.toJS();
    last.current = parsed;
    onChange(parsed);
  };
  return html`<div>
    <textarea id=${id} class=${error ? "input mono invalid" : "input mono"} rows=${rows} spellcheck=${false} placeholder=${placeholder ?? ""} onInput=${onInput} onKeyDown=${tabIndent}>
${text}</textarea
    >
    ${error && html`<div class="field-error">${error}</div>`}
  </div>`;
}

export function tabIndent(e) {
  if (e.key !== "Tab" || e.shiftKey) return;
  e.preventDefault();
  const ta = e.target;
  const { selectionStart: s, selectionEnd: end, value } = ta;
  ta.value = value.slice(0, s) + "  " + value.slice(end);
  ta.selectionStart = ta.selectionEnd = s + 2;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

// ---------- icons ----------

export function IconPreview({ icon, size = 32 }) {
  const [failed, setFailed] = useState(false);
  const url = iconPreviewUrl(icon);
  const color = iconColor(icon);
  useEffect(() => setFailed(false), [icon]);
  if (!icon) return html`<span class="icon-preview empty" style=${`width:${size}px;height:${size}px`}></span>`;
  if (!url || failed) {
    return html`<span class="icon-preview empty" style=${`width:${size}px;height:${size}px`} title=${url ? "Could not load preview" : "No preview for this path"}>?</span>`;
  }
  if (color) {
    return html`<span class="icon-preview" style=${`width:${size}px;height:${size}px`}>
      <span class="icon-mask" style=${`background:${color};-webkit-mask-image:url("${url}");mask-image:url("${url}")`}></span>
    </span>`;
  }
  return html`<span class="icon-preview" style=${`width:${size}px;height:${size}px`}>
    <img src=${url} alt="" loading="lazy" referrerpolicy="no-referrer" onError=${() => setFailed(true)} />
  </span>`;
}

let openIconPicker = () => {};
export const setIconPickerOpener = (fn) => (openIconPicker = fn);

/** Icon reference input with live preview and a picker (uploads, Dashboard Icons, MDI, Simple Icons, selfh.st). */
export function IconInput({ value, onChange, id, suggestName, placeholder = "e.g. sonarr.png, mdi-home, si-github, /icons/my.png" }) {
  return html`<div class="icon-input">
    <${IconPreview} icon=${value} size=${36} />
    <input
      id=${id}
      class="input mono"
      value=${value ?? ""}
      placeholder=${placeholder}
      spellcheck=${false}
      onInput=${(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
    <button type="button" class="btn btn-s" onClick=${() => openIconPicker((ref) => onChange(ref), { suggestName })}>Choose…</button>
    ${value && html`<button type="button" class="icon-btn" title="Clear" onClick=${() => onChange(undefined)}>✕</button>`}
  </div>`;
}

// ---------- save bar ----------

export function SaveBar({ dirty, saving, onSave, onDiscard, note }) {
  if (!dirty) return null;
  return html`<div class="savebar">
    <span>${note ?? "You have unsaved changes."}</span>
    <div class="row gap-s">
      <button class="btn btn-ghost" onClick=${onDiscard} disabled=${saving}>Discard</button>
      <button class="btn btn-primary" onClick=${onSave} disabled=${saving}>${saving ? "Saving…" : "Save changes"}</button>
    </div>
  </div>`;
}

export function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return html`<button
    type="button"
    class="btn btn-s btn-ghost"
    onClick=${async () => {
      if (await copyText(typeof text === "function" ? text() : text)) {
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }
    }}
  >
    ${done ? "Copied ✓" : label}
  </button>`;
}

export function Empty({ title, children }) {
  return html`<div class="empty-state"><strong>${title}</strong>${children && html`<div class="muted">${children}</div>`}</div>`;
}

/** Shown only on installs where the server can restart Homepage (LXC/systemd). */
export function RestartHomepageButton({ meta, label = "Restart Homepage", small }) {
  const [busy, setBusy] = useState(false);
  if (!meta?.canRestart) return null;
  return html`<button
    class=${small ? "btn btn-s" : "btn"}
    disabled=${busy}
    onClick=${async () => {
      if (!confirmDialog("Restart Homepage now? The dashboard is unavailable for a few seconds.")) return;
      setBusy(true);
      try {
        toast((await post("/api/homepage/restart")).message);
      } catch (e) {
        toast(e.message, "error");
      } finally {
        setTimeout(() => setBusy(false), 3000);
      }
    }}
  >
    ${busy ? "Restarting…" : label}
  </button>`;
}
