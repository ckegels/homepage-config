import { html, useState, useEffect } from "/vendor/htm-preact.js";
import { Page, Card, Notice, Field, TextInput, SecretInput, Switch, Select, CopyButton, KeyValue, Loading, toast, confirmDialog } from "../ui.js";
import { get, put, post } from "../api.js";
import { randomSecret } from "../util.js";
import { DOCS } from "../schemas.js";

// Draft is kept only in this browser (sessionStorage) — it may contain secrets.
const KEY = "hc-env-draft";
const load = () => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
};

/** Form state -> ordered [key, value] pairs. `extra` holds .env keys this form doesn't model. */
function buildEnv(s) {
  const env = [];
  const add = (k, v) => v !== undefined && v !== "" && env.push([k, String(v)]);
  add("HOMEPAGE_ALLOWED_HOSTS", s.allowedHosts);
  if (s.puid) add("PUID", s.puid);
  if (s.pgid) add("PGID", s.pgid);
  add("LOG_TARGETS", s.logTargets);
  if (s.authMode !== "off") {
    add("HOMEPAGE_AUTH_ENABLED", "true");
    add("HOMEPAGE_AUTH_SECRET", s.authSecret);
    add("HOMEPAGE_EXTERNAL_URL", s.externalUrl);
    if (s.authMode === "password") add("HOMEPAGE_AUTH_PASSWORD", s.authPassword);
    if (s.authMode === "oidc") {
      add("HOMEPAGE_OIDC_ISSUER", s.oidcIssuer);
      add("HOMEPAGE_OIDC_CLIENT_ID", s.oidcClientId);
      add("HOMEPAGE_OIDC_CLIENT_SECRET", s.oidcClientSecret);
      add("HOMEPAGE_OIDC_NAME", s.oidcName);
      add("HOMEPAGE_OIDC_SCOPE", s.oidcScope);
      if (s.oidcAutoLogin) add("HOMEPAGE_OIDC_AUTO_LOGIN", "true");
    }
  }
  if (s.mcp) {
    add("HOMEPAGE_MCP_ENABLED", "true");
    add("HOMEPAGE_MCP_TOKEN", s.mcpToken);
    if (s.mcpWrite) add("HOMEPAGE_MCP_ALLOW_WRITE", "true");
  }
  for (const [k, v] of Object.entries(s.vars ?? {})) add(`HOMEPAGE_VAR_${k.replace(/^HOMEPAGE_VAR_/, "")}`, v);
  for (const [k, v] of Object.entries(s.files ?? {})) add(`HOMEPAGE_FILE_${k.replace(/^HOMEPAGE_FILE_/, "")}`, v);
  for (const [k, v] of Object.entries(s.extra ?? {})) add(k, v);
  return env;
}

const MODELLED = /^(HOMEPAGE_(ALLOWED_HOSTS|AUTH_ENABLED|AUTH_SECRET|EXTERNAL_URL|AUTH_PASSWORD|OIDC_[A-Z_]+|MCP_ENABLED|MCP_TOKEN|MCP_ALLOW_WRITE|VAR_.+|FILE_.+)|PUID|PGID|LOG_TARGETS)$/;

/** Homepage .env values -> form state. */
function fromEnv(v) {
  const on = (k) => String(v[k] ?? "").toLowerCase() === "true";
  const pick = (prefix) => Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith(prefix)).map(([k, val]) => [k.slice(prefix.length), val]));
  return {
    allowedHosts: v.HOMEPAGE_ALLOWED_HOSTS ?? "",
    puid: v.PUID,
    pgid: v.PGID,
    logTargets: v.LOG_TARGETS ?? "",
    authMode: !on("HOMEPAGE_AUTH_ENABLED") ? "off" : v.HOMEPAGE_OIDC_ISSUER || v.HOMEPAGE_OIDC_CLIENT_ID ? "oidc" : "password",
    authSecret: v.HOMEPAGE_AUTH_SECRET,
    externalUrl: v.HOMEPAGE_EXTERNAL_URL,
    authPassword: v.HOMEPAGE_AUTH_PASSWORD,
    oidcIssuer: v.HOMEPAGE_OIDC_ISSUER,
    oidcClientId: v.HOMEPAGE_OIDC_CLIENT_ID,
    oidcClientSecret: v.HOMEPAGE_OIDC_CLIENT_SECRET,
    oidcName: v.HOMEPAGE_OIDC_NAME,
    oidcScope: v.HOMEPAGE_OIDC_SCOPE,
    oidcAutoLogin: on("HOMEPAGE_OIDC_AUTO_LOGIN"),
    mcp: on("HOMEPAGE_MCP_ENABLED"),
    mcpToken: v.HOMEPAGE_MCP_TOKEN,
    mcpWrite: on("HOMEPAGE_MCP_ALLOW_WRITE"),
    vars: pick("HOMEPAGE_VAR_"),
    files: pick("HOMEPAGE_FILE_"),
    extra: Object.fromEntries(Object.entries(v).filter(([k]) => !MODELLED.test(k))),
  };
}

const EMPTY = { allowedHosts: "", authMode: "off", logTargets: "", vars: {}, files: {} };

export function EnvironmentPage({ meta }) {
  const direct = !!meta?.envFile;
  const [s, setS] = useState(() => (direct ? null : { ...EMPTY, ...load() }));
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!meta) return;
    if (meta.envFile) {
      get("/api/homepage/env")
        .then((r) => {
          const st = { ...EMPTY, ...fromEnv(r.values) };
          setS(st);
          setSaved(JSON.stringify(buildEnv(st)));
        })
        .catch((e) => {
          toast(e.message, "error");
          setS({ ...EMPTY });
        });
    } else if (!s) setS({ ...EMPTY, ...load() });
  }, [meta?.envFile]);

  useEffect(() => {
    if (!s || direct) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* private mode */
    }
  }, [s]);

  const isDirty = direct && !!s && saved !== null && saved !== JSON.stringify(buildEnv(s));
  useEffect(() => {
    window.__hcDirty = window.__hcDirty || new Set();
    if (isDirty) window.__hcDirty.add("homepage.env");
    else window.__hcDirty.delete("homepage.env");
    return () => window.__hcDirty.delete("homepage.env");
  }, [isDirty]);

  if (!s) return html`<${Page} title="Environment & auth"><${Loading} /><//>`;
  const set = (k) => (v) => setS({ ...s, [k]: v });
  const env = buildEnv(s);
  const dirty = direct && saved !== JSON.stringify(env);

  const apply = async (restart) => {
    setBusy(true);
    try {
      const r = await put("/api/homepage/env", { values: Object.fromEntries(env) });
      const st = { ...EMPTY, ...fromEnv(r.values) };
      setS(st);
      setSaved(JSON.stringify(buildEnv(st)));
      if (restart) toast((await post("/api/homepage/restart")).message);
      else toast(`Saved to ${meta.envFile}. Restart Homepage to apply.`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const q = (v) => (/^[\w./:@,-]*$/.test(v) && !/^(true|false|yes|no|on|off|null|\d+)$/i.test(v) ? v : JSON.stringify(v));
  const compose = `    environment:\n${env.map(([k, v]) => `      ${k}: ${q(v)}`).join("\n")}`;
  const dotenv = env.map(([k, v]) => `${k}=${/[\s#"'$]/.test(v) ? JSON.stringify(v) : v}`).join("\n");

  const warnings = [];
  if (s.authMode !== "off" && (s.authSecret ?? "").length < 32) warnings.push("HOMEPAGE_AUTH_SECRET must be at least 32 characters.");
  if (s.authMode !== "off" && !s.externalUrl) warnings.push("HOMEPAGE_EXTERNAL_URL is required for authentication.");
  if (s.authMode === "password" && (s.authPassword ?? "").length < 12) warnings.push("Use a strong Homepage password (12+ characters).");
  if (s.mcp && (s.mcpToken ?? "").length < 32 && s.authMode === "off") warnings.push("MCP needs auth enabled or a token of at least 32 characters.");
  if (s.allowedHosts === "*") warnings.push("Allowing every host (*) is not recommended.");

  return html`<${Page}
    title="Environment & auth"
    subtitle=${direct
      ? "Options Homepage only reads from environment variables: allowed hosts, login, MCP and secrets."
      : "Homepage reads some options only from environment variables. Fill them in here and paste the result into Homepage's docker-compose.yml or .env."}
    docs=${DOCS.install}
  >
    ${direct
      ? html`<${Notice} kind="info">
          Editing Homepage's environment file <code>${meta.envFile}</code> directly. Keys this page doesn't show are kept, and the previous version is backed up.
          Homepage reads it at startup, so restart after saving.
        <//>`
      : html`<${Notice} kind="info">
          Nothing on this page is saved on the server or applied automatically. Your draft stays in this browser tab only. Restart Homepage after changing its environment
          (<code>docker compose up -d</code>).
        <//>`}
    <${Card} title="Access" docs=${DOCS.install + "#homepage_allowed_hosts"}>
      <div class="form-grid">
        <${Field} label="HOMEPAGE_ALLOWED_HOSTS" help="Comma-separated hosts (with port if not 80/443) you open Homepage with. localhost:3000 is always allowed." wide>
          ${(id) => html`<${TextInput} id=${id} mono value=${s.allowedHosts} onChange=${set("allowedHosts")} placeholder="home.example.com,192.168.1.10:3000" />`}
        <//>
        ${(!direct || s.puid || s.pgid) &&
        html`<${Field} label="PUID" help="Docker image only: run as this user id (non-root).">${(id) => html`<${TextInput} id=${id} value=${s.puid} onChange=${set("puid")} placeholder="1000" />`}<//>
          <${Field} label="PGID">${(id) => html`<${TextInput} id=${id} value=${s.pgid} onChange=${set("pgid")} placeholder="1000" />`}<//>`}
        <${Field} label="LOG_TARGETS">${(id) => html`<${Select} id=${id} value=${s.logTargets || undefined} onChange=${set("logTargets")} options=${["both", "stdout", "file"]} placeholder="Default (both)" />`}<//>
      </div>
    <//>

    <${Card} title="Homepage login" docs=${DOCS.install + "#security-authentication"}>
      <p class="muted">Homepage 2.x can require a password or OIDC (Authentik, Keycloak, Authelia…) before showing the dashboard.</p>
      <div class="segmented">
        ${[
          ["off", "Off"],
          ["password", "Password"],
          ["oidc", "OIDC / SSO"],
        ].map(([v, l]) => html`<button class=${s.authMode === v ? "seg active" : "seg"} onClick=${() => set("authMode")(v)}>${l}</button>`)}
      </div>
      ${s.authMode !== "off" &&
      html`<div class="form-grid">
        <${Field} label="HOMEPAGE_AUTH_SECRET" help="Random, 32+ characters, signs cookies." wide>
          ${(id) => html`<div class="row gap-s"><${SecretInput} id=${id} value=${s.authSecret} onChange=${set("authSecret")} /><button class="btn btn-s" onClick=${() => set("authSecret")(randomSecret())}>Generate</button></div>`}
        <//>
        <${Field} label="HOMEPAGE_EXTERNAL_URL" help="Full URL you open Homepage with. Use https:// for Secure cookies." wide>
          ${(id) => html`<${TextInput} id=${id} mono value=${s.externalUrl ?? meta?.app?.homepageUrl} onChange=${set("externalUrl")} placeholder="https://home.example.com" />`}
        <//>
        ${s.authMode === "password" &&
        html`<${Field} label="HOMEPAGE_AUTH_PASSWORD" wide help="Homepage doesn't rate-limit logins. Rate-limit POST /api/auth/callback/credentials at your reverse proxy if it's exposed.">
          ${(id) => html`<${SecretInput} id=${id} value=${s.authPassword} onChange=${set("authPassword")} />`}
        <//>`}
        ${s.authMode === "oidc" &&
        html`
          <${Field} label="HOMEPAGE_OIDC_ISSUER" wide>${(id) => html`<${TextInput} id=${id} mono value=${s.oidcIssuer} onChange=${set("oidcIssuer")} placeholder="https://auth.example.com/realms/homepage" />`}<//>
          <${Field} label="HOMEPAGE_OIDC_CLIENT_ID">${(id) => html`<${TextInput} id=${id} mono value=${s.oidcClientId} onChange=${set("oidcClientId")} />`}<//>
          <${Field} label="HOMEPAGE_OIDC_CLIENT_SECRET">${(id) => html`<${SecretInput} id=${id} value=${s.oidcClientSecret} onChange=${set("oidcClientSecret")} />`}<//>
          <${Field} label="HOMEPAGE_OIDC_NAME" help="Button label.">${(id) => html`<${TextInput} id=${id} value=${s.oidcName} onChange=${set("oidcName")} placeholder="Authentik" />`}<//>
          <${Field} label="HOMEPAGE_OIDC_SCOPE">${(id) => html`<${TextInput} id=${id} value=${s.oidcScope} onChange=${set("oidcScope")} placeholder="openid email profile" />`}<//>
          <${Field} label="Auto login" help="Skip the login page. Escape hatch: /auth/signin?autologin=0">
            <${Switch} checked=${s.oidcAutoLogin} onChange=${set("oidcAutoLogin")} label="HOMEPAGE_OIDC_AUTO_LOGIN" />
          <//>
          <${Notice} kind="info">
            Callback URL for your identity provider: <code>${(s.externalUrl || "https://homepage.example.com").replace(/\/$/, "")}/api/auth/callback/homepage-oidc</code>. Homepage lets in
            anyone the provider authorizes for this client.
          <//>
        `}
      </div>`}
    <//>

    <${Card} title="MCP endpoint (AI assistants)" docs=${DOCS.mcp}>
      <${Switch} checked=${s.mcp} onChange=${set("mcp")} label="Enable /api/mcp" />
      ${s.mcp &&
      html`<div class="form-grid">
        <${Field} label="HOMEPAGE_MCP_TOKEN" help="32+ characters. Grants read access to all service credentials." wide>
          ${(id) => html`<div class="row gap-s"><${SecretInput} id=${id} value=${s.mcpToken} onChange=${set("mcpToken")} /><button class="btn btn-s" onClick=${() => set("mcpToken")(randomSecret())}>Generate</button></div>`}
        <//>
        <${Field} label="Allow writes"><${Switch} checked=${s.mcpWrite} onChange=${set("mcpWrite")} label="HOMEPAGE_MCP_ALLOW_WRITE" /><//>
      </div>`}
    <//>

    <${Card} title="Secrets in config files" docs=${DOCS.docker_install + "#using-environment-secrets"}>
      <p class="muted">
        Keep API keys out of the YAML: define <code>HOMEPAGE_VAR_NAME</code> here and write <code>{{HOMEPAGE_VAR_NAME}}</code> in any field (e.g. a widget key).
        <code>HOMEPAGE_FILE_NAME</code> reads the value from a file (Docker secrets).
      </p>
      <h3 class="form-heading">HOMEPAGE_VAR_…</h3>
      <${KeyValue} value=${s.vars} onChange=${(v) => set("vars")(v ?? {})} keyPlaceholder="SONARR_KEY" valuePlaceholder="value" secretValues />
      <h3 class="form-heading">HOMEPAGE_FILE_…</h3>
      <${KeyValue} value=${s.files} onChange=${(v) => set("files")(v ?? {})} keyPlaceholder="SONARR_KEY" valuePlaceholder="/run/secrets/sonarr_key" />
      ${Object.keys(s.vars ?? {}).length > 0 &&
      html`<p class="small">Use in fields: ${Object.keys(s.vars).map((k) => html`<code class="tag">{{HOMEPAGE_VAR_${k.replace(/^HOMEPAGE_VAR_/, "")}}}</code> `)}</p>`}
    <//>

    ${direct
      ? html`<${Card} title="Result" actions=${html`<${CopyButton} text=${dotenv} label="Copy .env" />`}>
          ${warnings.map((w) => html`<${Notice} kind="warn">${w}<//>`)}
          <p class="muted small">Managed lines in <code>${meta.envFile}</code> after saving (comments and other lines are kept):</p>
          <pre class="code"><code>${env.length ? dotenv : "# nothing configured"}</code></pre>
        <//>
        ${dirty &&
        html`<div class="savebar">
          <span>Unsaved changes to Homepage's environment.</span>
          <div class="row gap-s">
            <button class="btn btn-ghost" disabled=${busy} onClick=${() => get("/api/homepage/env").then((r) => setS({ ...EMPTY, ...fromEnv(r.values) }))}>Discard</button>
            <button class="btn btn-ghost" disabled=${busy} onClick=${() => apply(false)}>Save only</button>
            ${meta.canRestart &&
            html`<button class="btn btn-primary" disabled=${busy} onClick=${() => (!warnings.length || confirmDialog(`There are warnings:\n\n${warnings.join("\n")}\n\nSave and restart anyway?`)) && apply(true)}>
              Save & restart Homepage
            </button>`}
          </div>
        </div>`}`
      : html`<${Card} title="Result" actions=${html`<${CopyButton} text=${compose} label="Copy compose" /><${CopyButton} text=${dotenv} label="Copy .env" />`}>
          ${warnings.map((w) => html`<${Notice} kind="warn">${w}<//>`)}
          <p class="muted small">Paste under the <code>homepage:</code> service in docker-compose.yml, or into Homepage's <code>.env</code> for source installs:</p>
          <pre class="code"><code>${env.length ? compose : "    # nothing configured yet"}</code></pre>
        <//>`}
  <//>`;
}
