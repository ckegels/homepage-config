import { html } from "/vendor/htm-preact.js";
import { Field, Select, TextInput, NumberInput, ChipSelect } from "../ui.js";

const SWATCH = {
  slate: "#64748b", gray: "#6b7280", zinc: "#71717a", neutral: "#737373", stone: "#78716c", amber: "#f59e0b",
  yellow: "#eab308", lime: "#84cc16", green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4",
  sky: "#0ea5e9", blue: "#3b82f6", indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7", fuchsia: "#d946ef",
  pink: "#ec4899", rose: "#f43f5e", red: "#ef4444", white: "#ffffff",
};

export function ColorPicker({ value, onChange }) {
  return html`<div class="swatches">
    <button type="button" class=${value === undefined ? "swatch-btn active" : "swatch-btn"} onClick=${() => onChange(undefined)} title="Not fixed">
      <span class="swatch swatch-none"></span><span>none</span>
    </button>
    ${Object.entries(SWATCH).map(
      ([name, hex]) => html`<button type="button" class=${value === name ? "swatch-btn active" : "swatch-btn"} onClick=${() => onChange(name)} title=${name} aria-pressed=${value === name}>
        <span class="swatch" style=${`background:${hex}`}></span><span>${name}</span>
      </button>`,
    )}
  </div>`;
}

const FILTERS = [
  { key: "blur", label: "Blur", options: ["none", "sm", "", "md", "lg", "xl", "2xl", "3xl"].map((v) => ({ value: v, label: v === "" ? '"" (default blur)' : v })) },
  { key: "saturate", label: "Saturate", options: [0, 50, 100, 150, 200] },
  { key: "brightness", label: "Brightness", options: [0, 50, 75, 90, 95, 100, 105, 110, 125, 150, 200] },
];

/** settings.background: either a plain URL string or { image, blur, saturate, brightness, opacity }. */
export function BackgroundEditor({ value, onChange }) {
  const obj = typeof value === "string" ? { image: value } : value && typeof value === "object" ? value : {};
  const emit = (next) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    const keys = Object.keys(clean);
    if (!keys.length) return onChange(undefined);
    onChange(keys.length === 1 && keys[0] === "image" ? clean.image : clean);
  };
  const set = (k, v) => emit({ ...obj, [k]: v });
  const preview = obj.image && (obj.image.startsWith("http") || obj.image.startsWith("/icons/")) ? obj.image : null;
  return html`<div class="bg-editor">
    <div class="form-grid">
      <${Field} label="Image URL or path" wide help="Full URL, or a path like /images/background.png (mount a folder at /app/public/images and restart Homepage).">
        ${(id) => html`<${TextInput} id=${id} mono value=${obj.image} onChange=${(v) => set("image", v)} placeholder="https://images.unsplash.com/…" />`}
      <//>
      ${FILTERS.map(
        (f) => html`<${Field} label=${f.label}>
          ${(id) => html`<${Select} id=${id} value=${obj[f.key]} options=${f.options} onChange=${(v) => set(f.key, v)} />`}
        <//>`,
      )}
      <${Field} label="Opacity (0–100)">
        ${(id) => html`<${NumberInput} id=${id} value=${obj.opacity} onChange=${(v) => set("opacity", v)} placeholder="100" />`}
      <//>
    </div>
    ${preview && html`<div class="bg-preview" style=${`background-image:url("${preview.replace(/"/g, "%22")}")`}></div>`}
  </div>`;
}

const PROVIDERS = ["google", "duckduckgo", "bing", "baidu", "brave"];

/** search widget `provider`: single string, "custom", or a list for a dropdown. */
export function SearchProviders({ value, onChange }) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const isCustom = list.includes("custom");
  return html`<div class="stack-s">
    <${ChipSelect}
      value=${isCustom ? [] : list}
      options=${PROVIDERS}
      onChange=${(next) => onChange(!next || !next.length ? undefined : next.length === 1 ? next[0] : next)}
    />
    <label class="row gap-s">
      <input type="checkbox" checked=${isCustom} onChange=${(e) => onChange(e.target.checked ? "custom" : undefined)} />
      Custom search engine
    </label>
  </div>`;
}
