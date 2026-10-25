import { html } from "/vendor/htm-preact.js";

// Minimal markdown → vnodes for the bundled widget docs. No raw HTML is ever
// injected: everything is built as elements, so doc content can't run script.

const DOCS_BASE = "https://gethomepage.dev/widgets/services/";

function resolveLink(href) {
  if (/^https?:\/\//.test(href)) return href;
  if (href.startsWith("#")) return null;
  // relative doc links like ../../configs/services.md#icons
  const clean = href.replace(/\.md(#|$)/, "/$1");
  try {
    return new URL(clean, DOCS_BASE + "x/").href;
  } catch {
    return null;
  }
}

function inline(text) {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(!?\[[^\]]*\]\([^)]+\))|(_\([^)]*\)_)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(html`<code>${t.slice(1, -1)}</code>`);
    else if (m[2]) out.push(html`<strong>${t.slice(2, -2)}</strong>`);
    else if (m[3]) {
      const lm = t.match(/^!?\[([^\]]*)\]\(([^)\s]+)/);
      const href = resolveLink(lm[2]);
      const label = lm[1] || (t.startsWith("!") ? "image" : lm[2]);
      out.push(href ? html`<a href=${href} target="_blank" rel="noopener noreferrer">${label}</a>` : label);
    } else out.push(html`<em>${inline(t.slice(2, -2))}</em>`);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }) {
  const lines = String(source || "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push(html`<pre class="code" data-lang=${lang}><code>${body.join("\n")}</code></pre>`);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push(level <= 2 ? html`<h3>${inline(line.replace(/^#+\s*/, ""))}</h3>` : html`<h4>${inline(line.replace(/^#+\s*/, ""))}</h4>`);
      i++;
      continue;
    }
    if (/^!!!\s/.test(line)) {
      const title = line.replace(/^!!!\s*\w+\s*/, "").replace(/"/g, "");
      const body = [];
      i++;
      while (i < lines.length && (lines[i].startsWith("    ") || lines[i].trim() === "")) {
        if (lines[i].trim()) body.push(lines[i].trim());
        i++;
        if (lines[i] !== undefined && lines[i].trim() === "" && !(lines[i + 1] ?? "").startsWith("    ")) break;
      }
      blocks.push(html`<div class="notice notice-info">${title && html`<strong>${title} </strong>`}${inline(body.join(" "))}</div>`);
      continue;
    }
    if (/^\s*[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s/, ""));
      blocks.push(html`<ul>${items.map((it) => html`<li>${inline(it)}</li>`)}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s/, ""));
      blocks.push(html`<ol>${items.map((it) => html`<li>${inline(it)}</li>`)}</ol>`);
      continue;
    }
    if (line.trim().startsWith("<img") || line.trim().startsWith("<")) {
      i++;
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(```|#|!!!|\s*[-*]\s|\s*\d+\.\s|<)/.test(lines[i])) para.push(lines[i++]);
    if (para.length) blocks.push(html`<p>${inline(para.join(" "))}</p>`);
    else i++;
  }
  return html`<div class="markdown">${blocks}</div>`;
}
