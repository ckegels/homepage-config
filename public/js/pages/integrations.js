import { html, useState } from "/vendor/htm-preact.js";
import { Page, Card, Loading, SaveBar, Empty, Field, TextInput, Notice, Tabs, confirmDialog } from "../ui.js";
import { SchemaForm, ExtraYaml } from "../form.js";
import { DOCKER_SOCKET_FIELDS, DOCKER_TCP_FIELDS, DOCKER_COMMON_FIELDS, KUBERNETES_FIELDS, PROXMOX_FIELDS, DOCS } from "../schemas.js";
import { useConfigFile } from "../model.js";
import { FileError, CommentsNotice } from "./settings.js";

const asMap = (d) => (d && typeof d === "object" && !Array.isArray(d) ? d : {});

/** Rename a key while keeping insertion order. */
function renameKey(obj, from, to) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k === from ? to : k, v]));
}

function NamedEntries({ value, onChange, renderEntry, addLabel, newEntry, nameHelp, emptyText }) {
  const entries = Object.entries(value);
  const [names, setNames] = useState({});
  return html`<div class="stack">
    ${entries.length === 0 && html`<${Empty} title=${emptyText} />`}
    ${entries.map(
      ([name, conf]) => html`<div class="sub-card" key=${name}>
        <div class="row gap-s">
          <${Field} label="Name" help=${nameHelp}>
            ${(id) => html`<input
              id=${id}
              class="input mono"
              value=${names[name] ?? name}
              onInput=${(e) => setNames({ ...names, [name]: e.target.value })}
              onBlur=${(e) => {
                const to = e.target.value.trim();
                setNames({});
                if (to && to !== name && !value[to]) onChange(renameKey(value, name, to));
              }}
            />`}
          <//>
          <span class="grow"></span>
          <button class="btn btn-s btn-danger" onClick=${() => confirmDialog(`Remove "${name}"?`) && onChange(Object.fromEntries(entries.filter(([k]) => k !== name)))}>Remove</button>
        </div>
        ${renderEntry(name, conf ?? {}, (next) => onChange({ ...value, [name]: next }))}
      </div>`,
    )}
    <button
      class="btn btn-s"
      onClick=${() => {
        let n = 1;
        while (value[`${newEntry.base}${n > 1 ? n : ""}`]) n++;
        onChange({ ...value, [`${newEntry.base}${n > 1 ? n : ""}`]: newEntry.value });
      }}
    >
      + ${addLabel}
    </button>
  </div>`;
}

function DockerEntry({ conf, onChange }) {
  const socket = conf.socket !== undefined;
  const switchTo = (s) => {
    if (s === socket) return;
    const { socket: _s, host, port, protocol, tls, headers, ...rest } = conf;
    onChange(s ? { socket: "/var/run/docker.sock", ...rest } : { host: "dockerproxy", port: 2375, ...rest });
  };
  const fields = [...(socket ? DOCKER_SOCKET_FIELDS : DOCKER_TCP_FIELDS), ...DOCKER_COMMON_FIELDS];
  return html`<div class="stack-s">
    <div class="segmented">
      <button class=${!socket ? "seg active" : "seg"} onClick=${() => switchTo(false)}>Host / port (socket proxy, remote)</button>
      <button class=${socket ? "seg active" : "seg"} onClick=${() => switchTo(true)}>Local socket</button>
    </div>
    <${SchemaForm} schema=${fields} value=${conf} onChange=${onChange} />
    <${ExtraYaml} schema=${[...DOCKER_SOCKET_FIELDS, ...DOCKER_TCP_FIELDS, ...DOCKER_COMMON_FIELDS]} value=${conf} onChange=${onChange} />
  </div>`;
}

export function IntegrationsPage({ arg }) {
  const [tab, setTab] = useState(["docker", "kubernetes", "proxmox"].includes(arg) ? arg : "docker");
  const docker = useConfigFile("docker.yaml", { parse: (d) => asMap(d) });
  const k8s = useConfigFile("kubernetes.yaml", { parse: (d) => asMap(d) });
  const pve = useConfigFile("proxmox.yaml", { parse: (d) => asMap(d) });
  const all = [docker, k8s, pve];
  const dirty = all.some((f) => f.dirty);

  const body = () => {
    if (tab === "docker") {
      if (docker.error) return html`<${FileError} f=${{ error: docker.error }} name="docker.yaml" />`;
      if (!docker.model) return html`<${Loading} />`;
      return html`<${CommentsNotice} file=${docker.file} />
        <${Card} title="Docker servers" docs=${DOCS.docker}>
          <p class="muted">
            Connect Docker hosts to show container status and stats for services that set <code>server</code> + <code>container</code>, and to discover
            services from <code>homepage.*</code> container labels. A
            <a href="https://github.com/Tecnativa/docker-socket-proxy" target="_blank" rel="noopener noreferrer">docker-socket-proxy</a> with <code>POST=0</code> is safer than
            mounting the socket.
          </p>
          <${NamedEntries}
            value=${docker.model}
            onChange=${docker.setModel}
            addLabel="Add Docker server"
            emptyText="No Docker servers configured"
            nameHelp="Referenced as server: <name> in services."
            newEntry=${{ base: "my-docker", value: { host: "dockerproxy", port: 2375 } }}
            renderEntry=${(name, conf, set) => html`<${DockerEntry} conf=${conf} onChange=${set} />`}
          />
        <//>
        <${LabelHelp} />`;
    }
    if (tab === "kubernetes") {
      if (k8s.error) return html`<${FileError} f=${{ error: k8s.error }} name="kubernetes.yaml" />`;
      if (!k8s.model) return html`<${Loading} />`;
      return html`<${CommentsNotice} file=${k8s.file} />
        <${Card} title="Kubernetes" docs=${DOCS.kubernetes}>
          <p class="muted">Needs Kubernetes 1.19+, metrics-server and an ingress controller. Services then use <code>namespace</code> + <code>app</code> or <code>podSelector</code>. Ingresses can be discovered with <code>gethomepage.dev/*</code> annotations.</p>
          <${SchemaForm} schema=${KUBERNETES_FIELDS} value=${k8s.model} onChange=${k8s.setModel} />
          <${ExtraYaml} schema=${KUBERNETES_FIELDS} value=${k8s.model} onChange=${k8s.setModel} />
        <//>`;
    }
    if (pve.error) return html`<${FileError} f=${{ error: pve.error }} name="proxmox.yaml" />`;
    if (!pve.model) return html`<${Loading} />`;
    return html`<${CommentsNotice} file=${pve.file} />
      <${Card} title="Proxmox nodes" docs=${DOCS.proxmox}>
        <p class="muted">
          Show CPU and memory of VMs and LXCs. The name must match the Proxmox node name and the <code>proxmoxNode</code> of your services. Use an API token with the
          <strong>PVEAuditor</strong> role (Datacenter → Permissions → API Tokens).
        </p>
        <${NamedEntries}
          value=${pve.model}
          onChange=${pve.setModel}
          addLabel="Add Proxmox node"
          emptyText="No Proxmox nodes configured"
          nameHelp="Must equal the Proxmox node name, e.g. pve."
          newEntry=${{ base: "pve", value: { url: "https://proxmox.local:8006", token: "api@pam!homepage", secret: "" } }}
          renderEntry=${(name, conf, set) => html`<${SchemaForm} schema=${PROXMOX_FIELDS} value=${conf} onChange=${set} /><${ExtraYaml} schema=${PROXMOX_FIELDS} value=${conf} onChange=${set} />`}
        />
      <//>`;
  };

  return html`<${Page} title="Docker · Kubernetes · Proxmox" subtitle="Connections that add status and stats to your services.">
    <${Tabs}
      tabs=${[
        { id: "docker", label: "Docker", badge: docker.dirty ? "●" : null },
        { id: "kubernetes", label: "Kubernetes", badge: k8s.dirty ? "●" : null },
        { id: "proxmox", label: "Proxmox", badge: pve.dirty ? "●" : null },
      ]}
      value=${tab}
      onChange=${setTab}
    />
    ${body()}
    <${SaveBar}
      dirty=${dirty}
      saving=${all.some((f) => f.saving)}
      note=${`Unsaved changes in ${all.filter((f) => f.dirty).map((f) => f.file?.name).join(", ")}`}
      onSave=${async () => {
        for (const f of all) if (f.dirty) await f.save();
      }}
      onDiscard=${() => all.forEach((f) => f.dirty && f.discard())}
    />
  <//>`;
}

/** Docker label generator: turn a service form into homepage.* labels. */
function LabelHelp() {
  const [svc, setSvc] = useState({ group: "Media", name: "Emby", icon: "emby.png", href: "http://emby.home/", description: "Media server", widgetType: "", widgetUrl: "", widgetKey: "" });
  const set = (k) => (v) => setSvc({ ...svc, [k]: v ?? "" });
  const labels = [
    ["group", svc.group],
    ["name", svc.name],
    ["icon", svc.icon],
    ["href", svc.href],
    ["description", svc.description],
    ["widget.type", svc.widgetType],
    ["widget.url", svc.widgetUrl],
    ["widget.key", svc.widgetKey],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `      - homepage.${k}=${v}`)
    .join("\n");
  return html`<${Card} title="Docker label generator" docs=${DOCS.docker + "#automatic-service-discovery"}>
    <p class="muted">Services can also come from container labels instead of services.yaml. Fill in the basics and copy the labels into your compose file.</p>
    <div class="form-grid">
      ${["group", "name", "icon", "href", "description", "widgetType", "widgetUrl", "widgetKey"].map(
        (k) => html`<${Field} label=${k}>${(id) => html`<${TextInput} id=${id} value=${svc[k]} onChange=${set(k)} />`}<//>`,
      )}
    </div>
    <pre class="code"><code>${`    labels:\n${labels}`}</code></pre>
    <${Notice} kind="info">With Swarm, put labels under <code>deploy.labels</code>. For one Homepage instance only, use <code>homepage.instance.NAME.href=…</code>.<//>
  <//>`;
}
