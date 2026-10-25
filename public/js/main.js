import { html, render, useState, useEffect } from "/vendor/htm-preact.js";
import { get, post, setUnauthorizedHandler } from "./api.js";
import { Toasts, Loading, setIconPickerOpener } from "./ui.js";
import { IconPicker } from "./pages/icons.js";
import { LoginScreen } from "./pages/login.js";
import { Overview } from "./pages/overview.js";
import { SettingsPage } from "./pages/settings.js";
import { LayoutPage } from "./pages/layout.js";
import { ServicesPage } from "./pages/services.js";
import { BookmarksPage } from "./pages/bookmarks.js";
import { InfoWidgetsPage } from "./pages/info-widgets.js";
import { IntegrationsPage } from "./pages/integrations.js";
import { IconsPage } from "./pages/icons.js";
import { FilesPage } from "./pages/files.js";
import { EnvironmentPage } from "./pages/environment.js";
import { AccountPage } from "./pages/account.js";

const NAV = [
  { id: "overview", label: "Overview", icon: "◎", page: Overview },
  { section: "Dashboard" },
  { id: "services", label: "Services", icon: "▦", page: ServicesPage },
  { id: "bookmarks", label: "Bookmarks", icon: "☆", page: BookmarksPage },
  { id: "widgets", label: "Info widgets", icon: "◔", page: InfoWidgetsPage },
  { id: "layout", label: "Layout & tabs", icon: "▤", page: LayoutPage },
  { id: "settings", label: "Settings", icon: "⚙", page: SettingsPage },
  { id: "icons", label: "Icons", icon: "◈", page: IconsPage },
  { section: "Advanced" },
  { id: "integrations", label: "Docker · K8s · Proxmox", icon: "⇄", page: IntegrationsPage },
  { id: "files", label: "Files, CSS & JS", icon: "❮❯", page: FilesPage },
  { id: "environment", label: "Environment & auth", icon: "⌘", page: EnvironmentPage },
  { id: "account", label: "Account & app", icon: "◍", page: AccountPage },
];

function currentRoute() {
  const [id, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  return { id: id || "overview", arg: rest.join("/") ? decodeURIComponent(rest.join("/")) : null };
}

export const navigate = (id, arg) => (location.hash = `#/${id}${arg ? "/" + encodeURIComponent(arg) : ""}`);

function hasUnsaved() {
  return window.__hcDirty && window.__hcDirty.size > 0;
}

function Shell({ state, onLogout }) {
  const [route, setRoute] = useState(currentRoute());
  const [menuOpen, setMenuOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [picker, setPicker] = useState(null);

  useEffect(() => {
    let last = location.hash;
    const onHash = () => {
      if (hasUnsaved() && !confirm("You have unsaved changes. Leave this page and lose them?")) {
        history.replaceState(null, "", last);
        return;
      }
      window.__hcDirty?.clear();
      last = location.hash;
      setRoute(currentRoute());
      setMenuOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    const onBeforeUnload = (e) => {
      if (hasUnsaved()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    setIconPickerOpener((cb) => setPicker({ cb }));
    get("/api/meta").then(setMeta).catch(() => {});
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const item = NAV.find((n) => n.id === route.id) ?? NAV[0];
  const Page = item.page;

  return html`<div class=${menuOpen ? "shell menu-open" : "shell"}>
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">⌂</span>
        <div>
          <strong>Homepage Config</strong>
          <small class="muted">${meta?.homepageVersion ? `for Homepage ${meta.homepageVersion}` : ""}</small>
        </div>
      </div>
      <nav>
        ${NAV.map((n) =>
          n.section
            ? html`<div class="nav-section">${n.section}</div>`
            : html`<a href=${`#/${n.id}`} class=${n.id === item.id ? "nav-link active" : "nav-link"} aria-current=${n.id === item.id ? "page" : undefined}>
                <span class="nav-icon" aria-hidden="true">${n.icon}</span>${n.label}
              </a>`,
        )}
      </nav>
      <div class="sidebar-foot">
        ${meta?.app?.homepageUrl && html`<a class="btn btn-ghost btn-block" href=${meta.app.homepageUrl} target="_blank" rel="noopener noreferrer">Open Homepage ↗</a>`}
        <div class="row between">
          <span class="muted small">Signed in as <strong>${state.username}</strong></span>
          <button class="btn btn-s btn-ghost" onClick=${onLogout}>Sign out</button>
        </div>
      </div>
    </aside>
    <div class="topbar">
      <button class="icon-btn" aria-label="Menu" onClick=${() => setMenuOpen(!menuOpen)}>☰</button>
      <strong>${item.label}</strong>
    </div>
    <div class="scrim" onClick=${() => setMenuOpen(false)}></div>
    <main class="main">
      <${Page} key=${item.id + (route.arg ?? "")} arg=${route.arg} meta=${meta} navigate=${navigate} refreshMeta=${() => get("/api/meta").then(setMeta)} />
    </main>
    ${picker &&
    html`<${IconPicker}
      meta=${meta}
      onClose=${() => setPicker(null)}
      onPick=${(ref) => {
        picker.cb(ref);
        setPicker(null);
      }}
    />`}
  </div>`;
}

function App() {
  const [state, setState] = useState(null);
  const refresh = () =>
    get("/api/auth/state")
      .then(setState)
      .catch(() => setState({ error: true }));
  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => setState((s) => ({ ...s, authenticated: false })));
  }, []);

  if (!state) return html`<div class="center-screen"><${Loading} /></div>`;
  if (state.error) return html`<div class="center-screen">Cannot reach the server. <button class="btn" onClick=${refresh}>Retry</button></div>`;
  if (!state.authenticated) return html`<${LoginScreen} setup=${state.setupRequired} onDone=${refresh} />`;
  return html`<${Shell}
    state=${state}
    onLogout=${async () => {
      if (hasUnsaved() && !confirm("Discard unsaved changes and sign out?")) return;
      await post("/api/auth/logout");
      window.__hcDirty?.clear();
      refresh();
    }}
  />`;
}

render(html`<${App} /><${Toasts} />`, document.getElementById("app"));
