import { html, useState } from "/vendor/htm-preact.js";
import { Page, Card, Tabs, Loading, Notice, SaveBar } from "../ui.js";
import { SchemaForm, ExtraYaml } from "../form.js";
import { SETTINGS_SECTIONS, DOCS } from "../schemas.js";
import { useConfigFile } from "../model.js";

export function FileError({ f, name }) {
  return html`<${Notice} kind="error">
    <strong>${name}</strong> cannot be parsed${f.error.line ? ` (line ${f.error.line})` : ""}: ${f.error.message}
    <div><a href=${`#/files/${name}`}>Open the file editor to fix it →</a></div>
  <//>`;
}

export function CommentsNotice({ file }) {
  if (!file?.hasComments) return null;
  return html`<${Notice} kind="info">
    This file has YAML comments. Saving from this form rewrites the file without them; the previous version is kept in the backups.
    To keep comments, use the <a href=${`#/files/${file.name}`}>file editor</a>.
  <//>`;
}

export function SettingsPage({ arg }) {
  const [tab, setTab] = useState(arg && SETTINGS_SECTIONS.some((s) => s.id === arg) ? arg : "general");
  const f = useConfigFile("settings.yaml", { parse: (d) => d ?? {} });
  const section = SETTINGS_SECTIONS.find((s) => s.id === tab);
  // Keys handled by some form section (or the Layout page), so the "other" box only shows the rest.
  const allSpecs = SETTINGS_SECTIONS.flatMap((s) => s.fields);

  return html`<${Page} title="Settings" subtitle="settings.yaml — application-wide options." docs=${DOCS.settings}>
    ${f.error && html`<${FileError} f=${{ error: f.error }} name="settings.yaml" />`}
    ${!f.model && !f.error && html`<${Loading} />`}
    ${f.model &&
    html`<${CommentsNotice} file=${f.file} />
      <${Tabs} tabs=${SETTINGS_SECTIONS.map((s) => ({ id: s.id, label: s.label }))} value=${tab} onChange=${setTab} />
      <${Card} title=${section.label} docs=${DOCS.settings}>
        ${section.intro && html`<p class="muted">${section.intro}</p>`}
        <${SchemaForm} schema=${section.fields} value=${f.model} onChange=${f.setModel} />
        ${tab === "general" &&
        html`<${ExtraYaml}
          schema=${allSpecs}
          value=${f.model}
          onChange=${f.setModel}
          alsoKnown=${["layout"]}
          label="Other settings (YAML)"
          help="Settings not covered by these forms (e.g. options added in newer Homepage versions). Layout is edited on the Layout page."
        />`}
      <//>
      <${SaveBar} dirty=${f.dirty} saving=${f.saving} onSave=${f.save} onDiscard=${f.discard} />`}
  <//>`;
}
