#!/usr/bin/env node
// Builds data/widget-catalog.json from a checkout of the Homepage repository.
//
//   git clone --depth 1 https://github.com/gethomepage/homepage.git /tmp/homepage
//   node scripts/build-catalog.mjs /tmp/homepage
//
// For every service widget doc (docs/widgets/services/*.md) it extracts the
// widget type(s), the options shown in the YAML examples (with their inline
// comments as hints), the "Allowed fields" list and the full doc text so the UI
// can render a form plus the original documentation next to it.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repo = process.argv[2];
if (!repo) {
  console.error("usage: node scripts/build-catalog.mjs <path-to-homepage-checkout>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "..", "data", "widget-catalog.json");
const docsDir = join(repo, "docs", "widgets", "services");
const registry = readFileSync(join(repo, "src", "widgets", "widgets.js"), "utf8");
const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));

// Authoritative list of widget types (keys of the registry object, aliases included).
const registryBody = registry.slice(registry.indexOf("const widgets = {"));
const registryEntries = [...registryBody.matchAll(/^\s+([a-z0-9_]+)(?::\s*([a-z0-9_]+))?,\s*$/gim)];
const knownTypes = new Set(registryEntries.map((m) => m[1]));
const aliases = new Map(registryEntries.filter((m) => m[2] && m[2] !== m[1]).map((m) => [m[1], m[2]]));

// Options every service widget understands; rendered separately by the UI.
const COMMON = new Set(["type", "fields", "hideErrors", "highlight", "headers"]);

function frontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  return { meta: m ? YAML.parse(m[1]) : {}, body: m ? md.slice(m[0].length) : md };
}

function yamlBlocks(md) {
  return [...md.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]);
}

function commentOf(pair) {
  const c = pair.value?.comment ?? pair.key?.comment ?? "";
  return c.trim();
}

// Walk a parsed YAML node, yielding every map that is a widget definition.
function* widgetMaps(node, parentKey) {
  if (YAML.isMap(node)) {
    const typePair = node.items.find((p) => p.key?.value === "type");
    if (typePair && (parentKey === "widget" || parentKey === "widgets" || parentKey === null)) {
      yield node;
    }
    for (const p of node.items) yield* widgetMaps(p.value, p.key?.value ?? null);
  } else if (YAML.isSeq(node)) {
    for (const item of node.items) yield* widgetMaps(item, parentKey);
  }
}

function hintEnum(comment) {
  // e.g. "Allowed values: `["full", "long"]`" or "bytes (default) or bbytes"
  const allowed = comment.match(/allowed values:?\s*`?(\[[^\]]+\])`?/i);
  if (allowed) {
    try {
      return JSON.parse(allowed[1].replace(/'/g, '"'));
    } catch {
      /* not JSON, ignore */
    }
  }
  return undefined;
}

function kindOf(value) {
  if (Array.isArray(value)) return "list";
  if (value !== null && typeof value === "object") return "yaml";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "text";
}

const SECRET = /(key|password|secret|token|pass)$/i;

const widgets = [];
for (const file of readdirSync(docsDir).sort()) {
  if (!file.endsWith(".md") || file === "index.md") continue;
  const md = readFileSync(join(docsDir, file), "utf8");
  const { meta, body } = frontmatter(md);
  const slug = basename(file, ".md");
  const byType = new Map();

  for (const block of yamlBlocks(body)) {
    let doc;
    try {
      doc = YAML.parseDocument(block, { schema: "core" });
    } catch {
      continue;
    }
    if (doc.errors.length) continue;
    for (const map of widgetMaps(doc.contents, null)) {
      const type = String(map.get("type"));
      if (!type || type.includes(" ")) continue;
      if (!byType.has(type)) byType.set(type, new Map());
      const opts = byType.get(type);
      for (const pair of map.items) {
        const key = pair.key?.value;
        if (!key || COMMON.has(key)) continue;
        const value = pair.value === null || pair.value === undefined ? null : pair.value.toJSON?.() ?? pair.value;
        const comment = commentOf(pair);
        const existing = opts.get(key);
        if (existing) {
          if (!existing.hint && comment) existing.hint = comment;
          if (!existing.examples.some((e) => JSON.stringify(e) === JSON.stringify(value)) && value !== null) {
            existing.examples.push(value);
          }
          continue;
        }
        opts.set(key, {
          key,
          kind: value === null ? "yaml" : kindOf(value),
          example: value,
          examples: value === null ? [] : [value],
          hint: comment,
          optional: /optional|default/i.test(comment),
          secret: SECRET.test(key) && typeof value === "string",
          enum: hintEnum(comment),
        });
      }
    }
  }

  const allowedMatch = body.match(/Allowed fields:?\s*(?:\(.*?\))?\s*`(\[[^`]*\])`/i);
  let allowedFields;
  if (allowedMatch) {
    try {
      allowedFields = JSON.parse(allowedMatch[1].replace(/'/g, '"'));
    } catch {
      allowedFields = undefined;
    }
  }
  const intro = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("<img") && !p.startsWith("```") && !p.startsWith("_(") && !p.startsWith("!!!"));

  for (const [type, opts] of byType) {
    widgets.push({
      type,
      name: byType.size > 1 ? `${meta.title ?? slug} (${type})` : (meta.title ?? slug),
      doc: slug,
      intro: intro ?? "",
      known: knownTypes.has(type),
      allowedFields,
      options: [...opts.values()].map(({ examples, ...o }) => ({
        ...o,
        examples: examples.length > 1 ? examples : undefined,
      })),
      markdown: body.trim(),
    });
  }
}

// Registry types without a matching doc: legacy aliases point at their target,
// anything else still gets a bare entry so it can be picked.
const documented = new Map(widgets.map((w) => [w.type, w]));
for (const type of knownTypes) {
  if (documented.has(type)) continue;
  const target = documented.get(aliases.get(type));
  if (target) {
    widgets.push({ ...target, type, name: `${target.name} (legacy alias "${type}")`, aliasOf: target.type, known: true });
  } else {
    widgets.push({ type, name: type, doc: null, intro: "", known: true, options: [], markdown: "" });
  }
}

widgets.sort((a, b) => a.name.localeCompare(b.name));
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify({ homepageVersion: pkg.version, generated: new Date().toISOString(), widgets }, null, 0),
);
console.log(`wrote ${widgets.length} widget definitions (Homepage ${pkg.version}) to ${outFile}`);
const unknown = widgets.filter((w) => !w.known).map((w) => w.type);
if (unknown.length) console.log("types in docs but not in registry:", unknown.join(", "));
