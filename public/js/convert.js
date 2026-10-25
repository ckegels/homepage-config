// Pure conversions between Homepage's YAML shapes (lists of single-key maps)
// and editable structures. No browser imports, so it is unit-tested in Node.

// Keys of a layout group that are options; any other object-valued key is a nested group.
export const LAYOUT_OPTIONS = ["style", "columns", "header", "icon", "iconsOnly", "initiallyCollapsed", "useEqualHeights", "tab"];

const entry = (item) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return [null, item];
  const [k] = Object.keys(item);
  return [k, item[k]];
};

// ---------- services.yaml ----------
// - Group:            -> { kind: "group", name, items: [...] }
//     - Service: {..} -> { kind: "service", name, props }
//     - Nested: [..]  -> nested group

export function parseServices(data) {
  const walk = (list) =>
    (Array.isArray(list) ? list : []).map((item) => {
      const [name, value] = entry(item);
      if (Array.isArray(value)) return { kind: "group", name: String(name), items: walk(value) };
      return { kind: "service", name: String(name), props: value && typeof value === "object" ? value : {} };
    });
  return walk(data);
}

export function serializeServices(groups) {
  const walk = (items) =>
    items.map((it) => (it.kind === "group" ? { [it.name]: walk(it.items) } : { [it.name]: Object.keys(it.props).length ? it.props : null }));
  return walk(groups);
}

// ---------- bookmarks.yaml ----------
// - Group:
//     - Bookmark:
//         - href: …     (a one-element list)

export function parseBookmarks(data) {
  return (Array.isArray(data) ? data : []).map((g) => {
    const [name, list] = entry(g);
    return {
      name: String(name),
      items: (Array.isArray(list) ? list : []).map((b) => {
        const [bname, value] = entry(b);
        const props = Array.isArray(value) ? Object.assign({}, ...value.filter((x) => x && typeof x === "object")) : value ?? {};
        return { name: String(bname), props };
      }),
    };
  });
}

export function serializeBookmarks(groups) {
  return groups.map((g) => ({ [g.name]: g.items.map((b) => ({ [b.name]: [b.props] })) }));
}

// ---------- widgets.yaml ----------

export function parseInfoWidgets(data) {
  return (Array.isArray(data) ? data : []).map((w) => {
    const [type, opts] = entry(w);
    return { type: String(type), opts: opts && typeof opts === "object" ? opts : {} };
  });
}

export const serializeInfoWidgets = (list) => list.map((w) => ({ [w.type]: Object.keys(w.opts).length ? w.opts : null }));

// ---------- settings.yaml → layout ----------
// Either a map { Group: {opts} } or a list [{ Group: {opts} }]. Nested groups are
// keys inside a group's options whose value is an object.

export function parseLayout(layout) {
  const pairs = Array.isArray(layout) ? layout.map(entry).filter(([k]) => k !== null) : Object.entries(layout ?? {});
  return pairs.map(([name, value]) => {
    const opts = {};
    const children = [];
    for (const [k, v] of Object.entries(value ?? {})) {
      if (!LAYOUT_OPTIONS.includes(k) && v && typeof v === "object" && !Array.isArray(v)) children.push([k, v]);
      else opts[k] = v;
    }
    return { name: String(name), opts, children: parseLayout(Object.fromEntries(children)) };
  });
}

export function serializeLayout(list) {
  if (!list.length) return undefined;
  const out = {};
  for (const g of list) {
    const nested = serializeLayout(g.children ?? []);
    out[g.name] = { ...g.opts, ...(nested ?? {}) };
    if (!Object.keys(out[g.name]).length) out[g.name] = null;
  }
  return out;
}

// Names of every group (incl. nested) in services.yaml.
export function serviceGroupNames(groups, depth = 0, out = []) {
  for (const g of groups) {
    if (g.kind !== "group") continue;
    out.push({ name: g.name, depth });
    serviceGroupNames(g.items, depth + 1, out);
  }
  return out;
}
