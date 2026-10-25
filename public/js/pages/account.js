import { html, useState, useEffect } from "/vendor/htm-preact.js";
import { get, put, post } from "../api.js";
import { Page, Card, Loading, Notice, Field, TextInput, toast, confirmDialog } from "../ui.js";

function PasswordForm() {
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.confirm) return toast("New passwords do not match", "error");
    setBusy(true);
    try {
      await post("/api/account/password", { current: f.current, next: f.next });
      toast("Password changed. Other sessions were signed out.");
      setF({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const input = (k, label, ac) =>
    html`<${Field} label=${label}>${(id) => html`<input id=${id} class="input" type="password" autocomplete=${ac} value=${f[k]} onInput=${(e) => setF({ ...f, [k]: e.target.value })} required />`}<//>`;
  return html`<form onSubmit=${submit}>
    <div class="form-grid">
      ${input("current", "Current password", "current-password")} ${input("next", "New password (12+ characters)", "new-password")}
      ${input("confirm", "Repeat new password", "new-password")}
    </div>
    <button class="btn btn-primary" disabled=${busy}>Change password</button>
  </form>`;
}

function TwoFactor({ account, reload }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  if (account.totpEnabled) {
    return html`<div class="stack-s">
      <${Notice} kind="ok">Two-factor authentication is <strong>on</strong>. Sign-ins need a code from your authenticator app.<//>
      <div class="row gap-s wrap">
        <input class="input" type="password" placeholder="Password to turn it off" value=${pw} onInput=${(e) => setPw(e.target.value)} autocomplete="current-password" />
        <button
          class="btn btn-danger"
          onClick=${async () => {
            try {
              await post("/api/account/totp/disable", { password: pw });
              toast("Two-factor authentication turned off");
              setPw("");
              reload();
            } catch (e) {
              toast(e.message, "error");
            }
          }}
        >
          Turn off 2FA
        </button>
      </div>
    </div>`;
  }
  if (!setup) {
    return html`<div class="stack-s">
      <p class="muted">Add a second step at sign-in using any TOTP app (Aegis, 2FAS, Google Authenticator, 1Password, Bitwarden…).</p>
      <button class="btn btn-primary" onClick=${async () => setSetup(await post("/api/account/totp/setup"))}>Set up 2FA</button>
    </div>`;
  }
  return html`<div class="totp-setup">
    <div class="qr" dangerouslySetInnerHTML=${{ __html: setup.qrSvg }}></div>
    <div class="stack-s">
      <p>1. Scan the QR code, or enter this key manually:</p>
      <code class="secret-code">${setup.secret.match(/.{1,4}/g).join(" ")}</code>
      <p>2. Enter the 6-digit code it shows:</p>
      <form
        class="row gap-s"
        onSubmit=${async (e) => {
          e.preventDefault();
          try {
            await post("/api/account/totp/enable", { code });
            toast("Two-factor authentication is on");
            setSetup(null);
            reload();
          } catch (err) {
            toast(err.message, "error");
          }
        }}
      >
        <input class="input mono" inputmode="numeric" maxlength="7" placeholder="123456" value=${code} onInput=${(e) => setCode(e.target.value)} autocomplete="one-time-code" />
        <button class="btn btn-primary">Verify & enable</button>
        <button type="button" class="btn btn-ghost" onClick=${() => setSetup(null)}>Cancel</button>
      </form>
    </div>
  </div>`;
}

function AppSettings({ refreshMeta }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    get("/api/app-settings").then(setS);
  }, []);
  if (!s) return html`<${Loading} />`;
  const save = async () => {
    try {
      setS(await put("/api/app-settings", s));
      refreshMeta?.();
      toast("Saved");
    } catch (e) {
      toast(e.message, "error");
    }
  };
  return html`<div class="stack-s">
    <div class="form-grid">
      <${Field} label="Homepage URL" help="Used for the 'Open Homepage' link and cache refresh." wide>
        ${(id) => html`<${TextInput} id=${id} mono value=${s.homepageUrl} onChange=${(v) => setS({ ...s, homepageUrl: v ?? "" })} placeholder="https://home.example.com" />`}
      <//>
    </div>
    <h3 class="form-heading">How uploaded icons are referenced</h3>
    <label class="radio-card">
      <input type="radio" name="iconMode" checked=${s.iconMode === "local"} onChange=${() => setS({ ...s, iconMode: "local" })} />
      <div>
        <strong>Local path</strong> — <code>/icons/name.png</code>
        <div class="muted small">Mount the icons folder into Homepage at <code>/app/public/icons</code>. Homepage must be restarted to see newly added files. Icons work even if this app is down.</div>
      </div>
    </label>
    <label class="radio-card">
      <input type="radio" name="iconMode" checked=${s.iconMode === "url"} onChange=${() => setS({ ...s, iconMode: "url" })} />
      <div>
        <strong>Served by this app</strong> — <code>${s.iconBaseUrl || "https://config.example.com/icons/"}name.png</code>
        <div class="muted small">New icons show up instantly, no restart. Visitors' browsers must be able to reach this URL. Only the <code>/icons/</code> path is public.</div>
      </div>
    </label>
    ${s.iconMode === "url" &&
    html`<${Field} label="Icon base URL" wide help="Public URL of this app followed by /icons/. Use https if Homepage is on https.">
      ${(id) => html`<${TextInput} id=${id} mono value=${s.iconBaseUrl} onChange=${(v) => setS({ ...s, iconBaseUrl: v ?? "" })} placeholder="https://config.example.com/icons/" />`}
    <//>`}
    <div><button class="btn btn-primary" onClick=${save}>Save app settings</button></div>
    <p class="muted small">Changing the mode doesn't rewrite icons you already chose. Existing references keep working as long as their source is reachable.</p>
  </div>`;
}

export function AccountPage({ meta, refreshMeta }) {
  const [account, setAccount] = useState(null);
  const reload = () => get("/api/account").then(setAccount);
  useEffect(() => {
    reload();
  }, []);
  if (!account) return html`<${Page} title="Account & app"><${Loading} /><//>`;
  return html`<${Page} title="Account & app" subtitle=${`Signed in as ${account.username}. Sessions last ${account.sessionHours} hours.`}>
    <${Card} title="Password"><${PasswordForm} /><//>
    <${Card} title="Two-factor authentication"><${TwoFactor} account=${account} reload=${reload} /><//>
    <${Card} title="Sessions">
      <p class="muted">Sign out every browser, including ones you may have forgotten. This browser stays signed in.</p>
      <button
        class="btn"
        onClick=${async () => {
          if (!confirmDialog("Sign out all other sessions?")) return;
          await post("/api/account/logout-all");
          toast("All other sessions were signed out");
        }}
      >
        Sign out everywhere else
      <//>
    <//>
    <${Card} title="App settings"><${AppSettings} refreshMeta=${refreshMeta} /><//>
    <${Card} title="About">
      <dl class="kv-list">
        <dt>Version</dt><dd>${meta?.version}</dd>
        <dt>Widget catalog</dt><dd>Homepage ${meta?.homepageVersion}</dd>
        <dt>Config folder</dt><dd><code>${meta?.configDir}</code></dd>
        <dt>Icons folder</dt><dd><code>${meta?.iconsDir}</code></dd>
        <dt>Remote fetch</dt><dd>${meta?.allowRemote ? "enabled (icon catalogs, URL import)" : "disabled"}</dd>
      </dl>
    <//>
  <//>`;
}
