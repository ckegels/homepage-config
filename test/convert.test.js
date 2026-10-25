import { test } from "node:test";
import assert from "node:assert/strict";
import YAML from "yaml";
import * as c from "../public/js/convert.js";

const roundTrip = (parse, serialize, yaml) => {
  const data = YAML.parse(yaml);
  assert.deepEqual(serialize(parse(data)), data);
};

test("services: groups, nested groups and widgets survive a round trip", () => {
  roundTrip(
    c.parseServices,
    c.serializeServices,
    `
- Group A:
    - Service A:
        href: http://a/
        widget: { type: sonarr, url: http://a, key: k }
    - Nested:
        - Service B:
            href: http://b/
            widgets:
              - { type: emby, url: http://b }
              - { type: uptimekuma, url: http://u, slug: s }
- Group B:
    - Service C:
        href: http://c/
`,
  );
});

test("services: nested group detection", () => {
  const m = c.parseServices(YAML.parse("- A:\n    - S: { href: x }\n    - N:\n        - T: { href: y }\n"));
  assert.equal(m[0].items[0].kind, "service");
  assert.equal(m[0].items[1].kind, "group");
  assert.deepEqual(c.serviceGroupNames(m), [{ name: "A", depth: 0 }, { name: "N", depth: 1 }]);
});

test("bookmarks round trip", () => {
  roundTrip(
    c.parseBookmarks,
    c.serializeBookmarks,
    `
- Developer:
    - Github:
        - abbr: GH
          href: https://github.com/
- Social:
    - Reddit:
        - icon: reddit.png
          href: https://reddit.com/
          description: The front page of the internet
`,
  );
});

test("info widgets round trip, including option-less widgets", () => {
  roundTrip(c.parseInfoWidgets, c.serializeInfoWidgets, "- logo:\n- search:\n    provider: [brave, google]\n- datetime:\n    format: { timeStyle: short }\n");
});

test("layout: map form, nested groups and option keys", () => {
  const layout = YAML.parse(`
Group A: { style: row, columns: 4 }
Group C:
  style: row
  columns: 2
  Nested Group A: { style: row, columns: 2 }
  Nested Group B: { header: false }
Section D:
`);
  const m = c.parseLayout(layout);
  assert.equal(m.length, 3);
  assert.equal(m[1].children.length, 2);
  assert.deepEqual(m[1].opts, { style: "row", columns: 2 });
  assert.deepEqual(c.serializeLayout(m), layout);
});

test("layout: list form is read in order", () => {
  const m = c.parseLayout(YAML.parse("- Auto1:\n- Configured1: { tab: First }\n- Auto2:\n"));
  assert.deepEqual(m.map((g) => g.name), ["Auto1", "Configured1", "Auto2"]);
  assert.equal(m[1].opts.tab, "First");
});
