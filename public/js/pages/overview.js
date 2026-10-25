import { html, useState, useEffect } from "/vendor/htm-preact.js";
import { get, post } from "../api.js";
import { Page, Card, Loading, Notice, toast, RestartHomepageButton } from "../ui.js";
import { parseServices, parseBookmarks, parseInfoWidgets, parseLayout, serviceGroupNames } from "../model.js";
import { bytes } from "../util.js";

const FILE_PAGES = {
  "settings.yaml": "settings",
  "services.yaml": "services",
  "bookmarks.yaml": "bookmarks",
  "widgets.yaml": "widgets",
  "docker.yaml": "integrations",
  "kubernetes.yaml": "integrations",
  "proxmox.yaml": "integrations",
  "custom.css": "files/custom.css",
  "custom.js": "files/custom.js",
};

function countServices(items) {
  return items.reduce((n, it) => n + (it.kind === "group" ? countServices(it.items) : 1), 0);
}

export function Overview({ meta }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    (async () => {
      const list = await get("/api/files");
      const read = async (n) => get(`/api/files/${n}`).catch(() => null);
      const [settings, services, bookmarks, widgets] = await Promise.all(["settings.yaml", "services.yaml", "bookmarks.yaml", "widgets.yaml"].map(read));
      const errors = [settings, services, bookmarks, widgets].filter((f) => f?.error);
      const svc = services?.data ? parseServices(services.data) : [];
      const bm = bookmarks?.data ? parseBookmarks(bookmarks.data) : [];
      const warnings = [];
      const svcGroups = serviceGroupNames(svc).map((g) => g.name);
      const bmGroups = bm.map((g) => g.name);
      for (const g of svcGroups.filter((n) => bmGroups.includes(n))) {
        warnings.push(`"${g}" is used as both a service group and a bookmark group. Homepage may hide one of them — rename one.`);
      }
      const layout = parseLayout(settings?.data?.layout);
      const allGroups = new Set([...svcGroups, ...bmGroups]);
      const flat = (l) => l.flatMap((g) => [g.name, ...flat(g.children)]);
      const orphan = flat(layout).filter((n) => !allGroups.has(n));
      if (orphan.length) {
        warnings.push(`Layout settings for groups not in services/bookmarks: ${orphan.join(", ")} (fine if they come from Docker/Kubernetes discovery).`);
      }
      const walk = (items, group) =>
        items.forEach((it) => {
          if (it.kind === "group") return walk(it.items, it.name);
          const ws = [it.props.widget, ...(it.props.widgets ?? [])].filter(Boolean);
          if (ws.some((w) => !w.type)) warnings.push(`Service "${it.name}" in "${group}" has a widget without a type.`);
        });
      walk(svc, null);
      setInfo({
        list,
        errors,
        warnings,
        counts: {
          groups: svcGroups.length,
          services: countServices(svc),
          bookmarkGroups: bm.length,
          bookmarks: bm.reduce((n, g) => n + g.items.length, 0),
          widgets: widgets?.data ? parseInfoWidgets(widgets.data).length : 0,
          tabs: new Set(flat(layout).length ? layout.map((g) => g.opts.tab).filter(Boolean) : []).size,
        },
        title: settings?.data?.title,
      });
    })().catch((e) => setInfo({ failed: e.message }));
  }, []);

  const refreshHomepage = async () => {
    const r = await post("/api/homepage/refresh").catch((e) => ({ ok: false, message: e.message }));
    toast(r.message, r.ok ? "ok" : "error");
  };

  if (!info) return html`<${Page} title="Overview"><${Loading} /><//>`;
  if (info.failed) return html`<${Page} title="Overview"><${Notice} kind="error">${info.failed}<//><//>`;
  const c = info.counts;

  return html`<${Page}
    title=${info.title ? `${info.title}` : "Overview"}
    subtitle="Everything Homepage reads from its config folder, editable here. Changes are picked up by Homepage on the next page load."
    actions=${html`${meta?.app?.homepageUrl && !meta?.canRestart && html`<button class="btn" onClick=${refreshHomepage}>Refresh Homepage cache</button>`}<${RestartHomepageButton} meta=${meta} />`}
  >
    ${info.errors.map(
      (f) => html`<${Notice} kind="error">
        <strong>${f.name}</strong> has a YAML error${f.error.line ? ` on line ${f.error.line}` : ""}: ${f.error.message}.
        <a href=${`#/files/${f.name}`}>Fix it in the file editor →</a>
      <//>`,
    )}
    ${info.warnings.map((w) => html`<${Notice} kind="warn">${w}<//>`)}

    <div class="stat-grid">
      <a class="stat" href="#/services"><span class="stat-num">${c.services}</span><span>services in ${c.groups} groups</span></a>
      <a class="stat" href="#/bookmarks"><span class="stat-num">${c.bookmarks}</span><span>bookmarks in ${c.bookmarkGroups} groups</span></a>
      <a class="stat" href="#/widgets"><span class="stat-num">${c.widgets}</span><span>info widgets</span></a>
      <a class="stat" href="#/layout"><span class="stat-num">${c.tabs}</span><span>tabs</span></a>
    </div>

    <${Card} title="Config files" docs="https://gethomepage.dev/configs/">
      <table class="table">
        <thead><tr><th>File</th><th>Status</th><th>Size</th><th>Last changed</th><th></th></tr></thead>
        <tbody>
          ${info.list.map(
            (f) => html`<tr>
              <td><code>${f.name}</code></td>
              <td>${f.exists ? html`<span class="pill pill-ok">present</span>` : html`<span class="pill">not created</span>`}</td>
              <td>${f.exists ? bytes(f.size) : "—"}</td>
              <td>${f.exists ? new Date(f.mtime).toLocaleString() : "—"}</td>
              <td class="right"><a href=${`#/${FILE_PAGES[f.name]}`}>Edit →</a></td>
            </tr>`,
          )}
        </tbody>
      </table>
      <p class="muted small">Config folder: <code>${meta?.configDir}</code> · every save keeps a backup (Files page → History).</p>
    <//>

    <${Card} title="Getting started">
      <ol class="steps">
        <li>Add your apps on <a href="#/services">Services</a>. Pick a widget type to show live stats; every option from the docs is listed.</li>
        <li>Upload your own icons on <a href="#/icons">Icons</a>, or pick from Dashboard Icons, Material Design, Simple Icons and selfh.st.</li>
        <li>Arrange groups, columns and tabs on <a href="#/layout">Layout & tabs</a>. Then set the look on <a href="#/settings">Settings</a>.</li>
        <li>Connect Docker, Kubernetes or Proxmox on <a href="#/integrations">Integrations</a> to show container status.</li>
        <li>Turn on 2FA on <a href="#/account">Account & app</a>.</li>
      </ol>
    <//>
  <//>`;
}
