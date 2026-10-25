import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import qrcode from "qrcode-generator";

import { env } from "./env.js";
import { HttpError } from "./config-files.js";

const scrypt = promisify(scryptCb);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const COOKIE = "hc_session";
const MIN_PASSWORD = 12;

const authFile = () => join(env.dataDir, "auth.json");
const secretFile = () => join(env.dataDir, "secret.key");
const setupTokenFile = () => join(env.dataDir, "setup-token.txt");

function writePrivate(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

let secret;
let setupToken = null;

export function initAuth() {
  mkdirSync(env.dataDir, { recursive: true });
  if (!existsSync(secretFile())) writePrivate(secretFile(), randomBytes(48).toString("base64"));
  secret = readFileSync(secretFile(), "utf8").trim();
}

export function loadAccount() {
  if (!existsSync(authFile())) return null;
  return JSON.parse(readFileSync(authFile(), "utf8"));
}

function saveAccount(account) {
  writePrivate(authFile(), JSON.stringify(account, null, 2));
}

// ---------- passwords ----------

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(String(password), Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(expected, actual);
}

export function checkPasswordStrength(password, username) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters.`);
  }
  if (password.length > 512) throw new HttpError(400, "Password is too long.");
  if (username && password.toLowerCase().includes(String(username).toLowerCase())) {
    throw new HttpError(400, "Password must not contain the username.");
  }
  if (new Set(password).size < 5) throw new HttpError(400, "Password is too simple.");
}

// ---------- first-run setup ----------

/**
 * Called on startup. If ADMIN_PASSWORD is set and no account exists, the
 * account is created from the environment. Otherwise a one-time setup token is
 * generated and printed so only someone with access to the logs/volume can
 * claim the admin account.
 */
export async function bootstrap() {
  if (loadAccount()) {
    if (existsSync(setupTokenFile())) unlinkSync(setupTokenFile());
    return;
  }
  if (env.adminPassword) {
    checkPasswordStrength(env.adminPassword, env.adminUser);
    saveAccount(newAccount(env.adminUser, await hashPassword(env.adminPassword)));
    console.log(`[auth] admin account "${env.adminUser}" created from ADMIN_PASSWORD`);
    return;
  }
  setupToken = randomBytes(18).toString("base64url");
  writePrivate(setupTokenFile(), setupToken + "\n");
  console.log("============================================================");
  console.log(" Homepage Config - first run");
  console.log(" Open the web UI and use this setup token to create the admin:");
  console.log(`   ${setupToken}`);
  console.log(` (also stored in ${setupTokenFile()})`);
  console.log("============================================================");
}

function newAccount(username, passwordHash) {
  return { username, passwordHash, totpSecret: null, totpEnabled: false, epoch: 1, createdAt: new Date().toISOString() };
}

export const setupRequired = () => !loadAccount();

export async function completeSetup({ token, username, password }) {
  if (loadAccount()) throw new HttpError(409, "Setup has already been completed.");
  if (!setupToken || typeof token !== "string" || !safeEqual(token.trim(), setupToken)) {
    throw new HttpError(403, "Invalid setup token. Check the container logs.");
  }
  username = String(username || "").trim();
  if (!/^[a-zA-Z0-9._@-]{2,64}$/.test(username)) throw new HttpError(400, "Username: 2-64 letters, digits or . _ @ -");
  checkPasswordStrength(password, username);
  const account = newAccount(username, await hashPassword(password));
  saveAccount(account);
  setupToken = null;
  if (existsSync(setupTokenFile())) unlinkSync(setupTokenFile());
  return account;
}

// ---------- sessions (stateless, HMAC-signed) ----------

function sign(payload) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function issueSession(account) {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ u: account.username, e: account.epoch, iat: now, exp: now + env.sessionHours * 3600_000, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  const account = loadAccount();
  if (!account || data.u !== account.username || data.e !== account.epoch || Date.now() > data.exp) return null;
  return { username: data.u, exp: data.exp };
}

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(req, value, maxAgeSeconds) {
  const secure = env.cookieSecure === "true" || (env.cookieSecure === "auto" && isHttps(req));
  return [
    `${COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function isHttps(req) {
  if (req.socket.encrypted) return true;
  return env.trustProxy && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

export function clientIp(req) {
  if (env.trustProxy && req.headers["x-forwarded-for"]) return String(req.headers["x-forwarded-for"]).split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

// ---------- brute-force protection ----------

const failures = new Map(); // ip -> { count, lockedUntil }
let globalFailures = [];

export function assertNotLocked(ip) {
  const f = failures.get(ip);
  const now = Date.now();
  globalFailures = globalFailures.filter((t) => now - t < 60_000);
  if (f && f.lockedUntil > now) {
    throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil((f.lockedUntil - now) / 1000)}s.`);
  }
  if (globalFailures.length >= 30) throw new HttpError(429, "Too many failed sign-in attempts. Try again in a minute.");
}

export function recordFailure(ip) {
  const f = failures.get(ip) ?? { count: 0, lockedUntil: 0 };
  f.count += 1;
  if (f.count >= 5) f.lockedUntil = Date.now() + Math.min(3600_000, 60_000 * 2 ** (f.count - 5));
  failures.set(ip, f);
  globalFailures.push(Date.now());
  console.warn(`[auth] failed sign-in attempt from ${ip} (${f.count})`);
}

export const clearFailures = (ip) => failures.delete(ip);

// ---------- login ----------

const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export async function login({ username, password, code }, ip) {
  assertNotLocked(ip);
  const account = loadAccount();
  const userOk = account && typeof username === "string" && safeEqual(username.trim(), account.username);
  // Always run scrypt so timing doesn't reveal whether the username exists.
  const passOk = await verifyPassword(String(password ?? ""), userOk ? account.passwordHash : DUMMY_HASH);
  if (!userOk || !passOk) {
    recordFailure(ip);
    throw new HttpError(401, "Invalid username or password.");
  }
  if (account.totpEnabled) {
    if (!code) throw new HttpError(401, "Enter the 6-digit code from your authenticator app.", { totpRequired: true });
    if (!verifyTotp(account.totpSecret, code)) {
      recordFailure(ip);
      throw new HttpError(401, "Invalid authentication code.", { totpRequired: true });
    }
  }
  clearFailures(ip);
  return account;
}

// ---------- account management ----------

export async function changePassword(current, next) {
  const account = loadAccount();
  if (!(await verifyPassword(String(current ?? ""), account.passwordHash))) throw new HttpError(403, "Current password is incorrect.");
  checkPasswordStrength(next, account.username);
  account.passwordHash = await hashPassword(next);
  account.epoch += 1; // signs out every other session
  saveAccount(account);
  return account;
}

export function logoutEverywhere() {
  const account = loadAccount();
  account.epoch += 1;
  saveAccount(account);
  return account;
}

// ---------- TOTP (RFC 6238, SHA1, 6 digits, 30s) ----------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of str.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

let lastTotpCounter = 0;

export function verifyTotp(secretB32, code) {
  const clean = String(code).replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (const drift of [-1, 0, 1]) {
    const c = counter + drift;
    // Reject reuse of an already accepted code.
    if (c > lastTotpCounter && safeEqual(totpAt(secretB32, c), clean)) {
      lastTotpCounter = c;
      return true;
    }
  }
  return false;
}

export function beginTotpSetup() {
  const account = loadAccount();
  const pending = base32Encode(randomBytes(20));
  account.totpPending = pending;
  saveAccount(account);
  const uri = `otpauth://totp/${encodeURIComponent("Homepage Config:" + account.username)}?secret=${pending}&issuer=${encodeURIComponent("Homepage Config")}`;
  const qr = qrcode(0, "M");
  qr.addData(uri);
  qr.make();
  return { secret: pending, uri, qrSvg: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) };
}

export function enableTotp(code) {
  const account = loadAccount();
  if (!account.totpPending) throw new HttpError(400, "Start two-factor setup first.");
  if (!verifyTotp(account.totpPending, code)) throw new HttpError(400, "That code is not valid. Check your device's clock and try again.");
  account.totpSecret = account.totpPending;
  account.totpEnabled = true;
  delete account.totpPending;
  account.epoch += 1;
  saveAccount(account);
  return account;
}

export async function disableTotp(password) {
  const account = loadAccount();
  if (!(await verifyPassword(String(password ?? ""), account.passwordHash))) throw new HttpError(403, "Password is incorrect.");
  account.totpEnabled = false;
  account.totpSecret = null;
  delete account.totpPending;
  saveAccount(account);
  return account;
}
