import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "hc-auth-"));
const auth = await import("../server/auth.js");
before(() => auth.initAuth());

test("TOTP matches RFC 6238 test vector", () => {
  // secret "12345678901234567890", T=59s -> counter 1 -> 94287082
  assert.equal(auth.totpAt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1), "287082");
});

test("password hashing verifies and rejects", async () => {
  const h = await auth.hashPassword("correct horse battery");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(await auth.verifyPassword("correct horse battery", h), true);
  assert.equal(await auth.verifyPassword("wrong", h), false);
});

test("weak passwords are refused", () => {
  assert.throws(() => auth.checkPasswordStrength("short", "admin"));
  assert.throws(() => auth.checkPasswordStrength("myadminpassword!", "admin"));
  assert.throws(() => auth.checkPasswordStrength("aaaaaaaaaaaaaaaa", "x"));
  auth.checkPasswordStrength("correct horse battery", "admin");
});

test("setup needs the token, then sessions work and can be revoked", async () => {
  await auth.bootstrap();
  await assert.rejects(auth.completeSetup({ token: "nope", username: "admin", password: "correct horse battery" }), /setup token/);
  const { readFileSync } = await import("node:fs");
  const token = readFileSync(join(process.env.DATA_DIR, "setup-token.txt"), "utf8").trim();
  const account = await auth.completeSetup({ token, username: "admin", password: "correct horse battery" });
  const cookie = `hc_session=${auth.issueSession(account)}`;
  const req = { headers: { cookie } };
  assert.equal(auth.readSession(req).username, "admin");
  // tampered signature
  assert.equal(auth.readSession({ headers: { cookie: cookie.slice(0, -2) + "xx" } }), null);
  auth.logoutEverywhere();
  assert.equal(auth.readSession(req), null);
});

test("login locks out after repeated failures", async () => {
  const ip = "203.0.113.9";
  for (let i = 0; i < 5; i++) await assert.rejects(auth.login({ username: "admin", password: "bad password!!" }, ip), /Invalid/);
  await assert.rejects(auth.login({ username: "admin", password: "correct horse battery" }, ip), /Too many/);
});
