import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "hc-files-"));
process.env.CONFIG_DIR = join(root, "config");
process.env.DATA_DIR = join(root, "data");
const files = await import("../server/config-files.js");
const icons = await import("../server/icons.js");

test("unknown file names are refused", () => {
  assert.throws(() => files.readFile("../../etc/passwd"), /Unknown config file/);
  assert.throws(() => files.writeFile("secret.key", { text: "x" }), /Unknown config file/);
});

test("write validates YAML and root type, keeps backups", () => {
  files.writeFile("services.yaml", { data: [{ A: [{ S: { href: "http://x" } }] }] });
  assert.throws(() => files.writeFile("services.yaml", { text: "a: 1\n" }), /must be a YAML list/);
  assert.throws(() => files.writeFile("settings.yaml", { text: "a: [1\n" }));
  files.writeFile("services.yaml", { text: "- B:\n    - T: { href: y }\n" });
  assert.equal(files.listBackups("services.yaml").length, 1);
  const id = files.listBackups("services.yaml")[0].id;
  files.restoreBackup("services.yaml", id);
  assert.deepEqual(files.readFile("services.yaml").data, [{ A: [{ S: { href: "http://x" } }] }]);
});

test("env placeholders are quoted so Homepage reads them as strings", () => {
  const f = files.writeFile("settings.yaml", { data: { providers: { finnhub: "{{HOMEPAGE_VAR_FINNHUB}}" } } });
  assert.match(f.text, /"\{\{HOMEPAGE_VAR_FINNHUB\}\}"/);
  assert.equal(f.data.providers.finnhub, "{{HOMEPAGE_VAR_FINNHUB}}");
});

test("core schema: yes/no stay strings like in Homepage", () => {
  writeFileSync(join(process.env.CONFIG_DIR, "widgets.yaml"), "- greeting:\n    text: yes\n");
  assert.equal(files.readFile("widgets.yaml").data[0].greeting.text, "yes");
});

test("stale writes are rejected", () => {
  assert.throws(() => files.writeFile("settings.yaml", { text: "title: x\n", baseMtime: 1 }), /changed on disk/);
});

test("icons: content sniffing, svg sanitizing, name cleaning", () => {
  assert.throws(() => icons.saveIcon("x.png", Buffer.from("<html>")), /does not look like/);
  assert.throws(() => icons.saveIcon("x.html", Buffer.from("<svg/>")), /Unsupported/);
  const r = icons.saveIcon("My Logo.SVG", Buffer.from('<svg onload="alert(1)"><script>x()</script><a href="javascript:alert(1)">a</a></svg>'));
  assert.equal(r.name, "my-logo.svg");
  const saved = readFileSync(join(process.env.DATA_DIR, "icons", "my-logo.svg"), "utf8");
  assert.doesNotMatch(saved, /script|onload|javascript:/i);
  assert.throws(() => icons.saveIcon("my-logo.svg", Buffer.from("<svg/>")), /already exists/);
  assert.equal(icons.readIcon("../auth.json"), null);
});

test("icons: name after a service and dedupe instead of overwriting", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  // baseName (the service name) sets the stem; the file keeps its own extension.
  assert.equal(icons.saveIcon("whatever-dropped.png", png, { baseName: "Sonarr" }).name, "sonarr.png");
  // same service again, dropped file already there -> deduped, original kept.
  assert.equal(icons.saveIcon("another.png", png, { baseName: "Sonarr", dedupe: true }).name, "sonarr-2.png");
  assert.equal(icons.saveIcon("again.png", png, { baseName: "Sonarr", dedupe: true }).name, "sonarr-3.png");
  // messy names are cleaned.
  assert.equal(icons.saveIcon("x.png", png, { baseName: "Pi-hole DNS!" }).name, "pi-hole-dns.png");
  // an unusable service name falls back to the dropped file's name…
  assert.equal(icons.saveIcon("logo.png", png, { baseName: "🎬" }).name, "logo.png");
  // …and only when both are unusable does it become "icon".
  assert.equal(icons.saveIcon("🎬.png", png, { baseName: "🎬" }).name, "icon.png");
  // without dedupe a clash still fails (management page keeps the replace prompt).
  assert.throws(() => icons.saveIcon("x.png", png, { baseName: "Sonarr" }), /already exists/);
  // no baseName -> falls back to the file name, as before.
  assert.equal(icons.saveIcon("Radarr.png", png).name, "radarr.png");
});
