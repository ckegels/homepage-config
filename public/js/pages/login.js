import { html, useState } from "/vendor/htm-preact.js";
import { post } from "../api.js";

export function LoginScreen({ setup, onDone }) {
  const [form, setForm] = useState({ username: setup ? "admin" : "", password: "", confirm: "", token: "", code: "" });
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (setup && form.password !== form.confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      if (setup) await post("/api/auth/setup", { token: form.token, username: form.username, password: form.password });
      else await post("/api/auth/login", { username: form.username, password: form.password, code: needCode ? form.code : undefined });
      onDone();
    } catch (err) {
      if (err.data?.totpRequired) setNeedCode(true);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return html`<div class="center-screen login-bg">
    <form class="login-card" onSubmit=${submit}>
      <div class="brand brand-lg">
        <span class="brand-mark">⌂</span>
        <div>
          <strong>Homepage Config</strong>
          <small class="muted">${setup ? "First-time setup" : "Sign in to continue"}</small>
        </div>
      </div>
      ${setup &&
      html`<p class="muted small">
        Create the administrator account. You need the <strong>setup token</strong> printed in the container logs
        (<code>docker logs homepage-config</code>) or stored in <code>/data/setup-token.txt</code>.
      </p>`}
      ${setup &&
      html`<label class="field-label" for="token">Setup token</label>
        <input id="token" class="input mono" value=${form.token} onInput=${set("token")} autocomplete="off" required />`}
      <label class="field-label" for="username">Username</label>
      <input id="username" class="input" value=${form.username} onInput=${set("username")} autocomplete="username" required autofocus=${!setup} />
      <label class="field-label" for="password">Password</label>
      <input
        id="password"
        class="input"
        type="password"
        value=${form.password}
        onInput=${set("password")}
        autocomplete=${setup ? "new-password" : "current-password"}
        required
        minlength=${setup ? 12 : undefined}
      />
      ${setup &&
      html`<label class="field-label" for="confirm">Repeat password</label>
        <input id="confirm" class="input" type="password" value=${form.confirm} onInput=${set("confirm")} autocomplete="new-password" required />
        <p class="field-help">At least 12 characters. A passphrase of several words works well.</p>`}
      ${needCode &&
      html`<label class="field-label" for="code">Authenticator code</label>
        <input id="code" class="input mono" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" value=${form.code} onInput=${set("code")} autocomplete="one-time-code" autofocus />`}
      ${error && html`<div class="notice notice-error">${error}</div>`}
      <button class="btn btn-primary btn-block" disabled=${busy}>${busy ? "Please wait…" : setup ? "Create account" : "Sign in"}</button>
    </form>
  </div>`;
}
