import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "hc-env-"));
process.env.DATA_DIR = join(root, "data");
process.env.HOMEPAGE_ENV_FILE = join(root, ".env");
process.env.HOMEPAGE_RESTART_TRIGGER = join(root, "restart");
const envfile = await import("../server/envfile.js");

const COMMUNITY = `HOMEPAGE_ALLOWED_HOSTS=localhost:3000,10.0.0.5:3000
## Optional Authentication
# HOMEPAGE_AUTH_ENABLED=true
# HOMEPAGE_AUTH_SECRET="xyz"
NODE_OPTIONS=--max-old-space-size=512
`;

test("parses quotes and comments", () => {
  assert.deepEqual(envfile.parseEnv('A=1\nB="two words"\nC=\'x y\'\n# D=4\nexport E=5 # note\n'), { A: "1", B: "two words", C: "x y", E: "5" });
});

test("updates managed keys in place, keeps comments and foreign keys", () => {
  const out = envfile.updateEnv(COMMUNITY, {
    HOMEPAGE_ALLOWED_HOSTS: "home.lan",
    HOMEPAGE_AUTH_ENABLED: "true",
    HOMEPAGE_AUTH_PASSWORD: 'p@ss "word"',
  });
  assert.match(out, /^HOMEPAGE_ALLOWED_HOSTS=home\.lan$/m);
  assert.match(out, /^# HOMEPAGE_AUTH_SECRET="xyz"$/m); // comment untouched
  assert.match(out, /^NODE_OPTIONS=--max-old-space-size=512$/m); // not managed, kept
  assert.equal(envfile.parseEnv(out).HOMEPAGE_AUTH_PASSWORD, 'p@ss "word"'); // round-trips
});

test("removes managed keys that are no longer set", () => {
  const out = envfile.updateEnv("HOMEPAGE_VAR_OLD=1\nHOMEPAGE_VAR_KEEP=2\n", { HOMEPAGE_VAR_KEEP: "2" });
  assert.doesNotMatch(out, /OLD/);
  assert.match(out, /HOMEPAGE_VAR_KEEP=2/);
});

test("writeEnvFile backs up, refuses foreign keys and newlines", () => {
  writeFileSync(process.env.HOMEPAGE_ENV_FILE, COMMUNITY);
  const r = envfile.writeEnvFile({ HOMEPAGE_ALLOWED_HOSTS: "a.lan", HOMEPAGE_VAR_X: "multi\nline" });
  assert.equal(r.values.HOMEPAGE_VAR_X, "multi\nline");
  assert.match(readFileSync(process.env.HOMEPAGE_ENV_FILE, "utf8"), /NODE_OPTIONS/);
  assert.throws(() => envfile.writeEnvFile({ PATH: "/tmp" }), /Not allowed/);
  assert.throws(() => envfile.writeEnvFile({ HOMEPAGE_VAR_X: "a\rb" }), /invalid/);
});

test("restart writes the trigger file and is throttled", () => {
  envfile.requestRestart();
  assert.ok(readFileSync(process.env.HOMEPAGE_RESTART_TRIGGER, "utf8").length > 0);
  assert.throws(() => envfile.requestRestart(), /just restarted/);
});
