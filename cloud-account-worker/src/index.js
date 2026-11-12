// Nexus cloud account + hosted web app on one Cloudflare Worker.
//
//   GET  /api/account/health               -> { ok, database, service }  (no login)
//   POST /api/account/register { user, key, blob }
//   POST /api/account/login    { user, key }
//   POST /api/account/load     { user, key } -> { blob, updatedAt }
//   POST /api/account/save     { user, key, blob }
//   POST /api/account/rekey    { user, key, newUser, newKey, blob }  (change user name and/or password; the data is sealed anew by the client)
//   POST /api/account/delete   { user, key }
//   POST /api/sync/…                       -> automatic sync PC ↔ cloud ↔ devices (see sync.js)
//
// Everything outside /api is the built hosted app (env.ASSETS, see wrangler.json). The browser sends only a derived
// login key (never the password) and an AES-GCM ciphertext it alone can open; the server keeps a PBKDF2 hash of
// that login key. `accounts` and `login_fails` are created by the migration and (defensively) on first use.

import { deleteSyncData, handleSync } from "./sync.js";
import { handleLink, PcLink } from "./link.js";

// The cloud link (PC ↔ devices of one account) lives in a Durable Object – see link.js.
export { PcLink };

const API_PREFIX = "/api/account/";
const SYNC_PREFIX = "/api/sync/";
const ACTIONS = new Set(["register", "login", "load", "save", "delete", "rekey"]);
const USER_RX = /^[a-z0-9._-]{3,24}$/;
const KEY_RX = /^[0-9a-f]{64}$/;
const BLOB_RX = /^[A-Za-z0-9+/=]+$/;
const MAX_BLOB = 900_000;
const MAX_BODY = 1_200_000;
const MAX_ACCOUNTS = 5000;
const ITERATIONS = 100_000;
const MAX_FAILS = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const SERVICE = "nexus-cloud-account";

const MSG_DB_MISSING = "Die Datenbank ist nicht verbunden – im Worker die D1-Bindung DB eintragen.";
const MSG_SERVER = "Der Cloud-Dienst hatte einen Fehler – bitte später erneut probieren.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // WebSockets of the cloud link go straight to the account's object (no CORS: browsers do not apply it to WebSockets; the token is the key).
    if (url.pathname.startsWith("/api/link/")) return handleLink(request, env, url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    // The hosted build (web/dist-hosted) is served by the platform from the ASSETS binding.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Nexus: statische Dateien fehlen (ASSETS-Bindung).", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};

async function handleApi(request, env, url) {
  const started = Date.now();
  const cors = corsHeaders(request, env);
  let response;
  try {
    response = await route(request, env, url, cors);
  } catch (e) {
    // Never echo internals (they may contain SQL); the client shows a clear sentence anyway.
    console.error("account api failed:", e?.stack ?? e?.message ?? String(e));
    response = fail("error", MSG_SERVER, 500, cors);
  }
  console.log(JSON.stringify({
    event: "account_api",
    method: request.method,
    path: url.pathname,
    status: response.status,
    ms: Date.now() - started,
  }));
  return response;
}

async function route(request, env, url, cors) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (url.pathname === `${API_PREFIX}health`) {
    if (request.method !== "GET") return fail("method-not-allowed", "Health ist nur per GET verfügbar.", 405, cors);
    return healthResponse(env, cors);
  }
  if (!env.DB) return fail("database-unavailable", MSG_DB_MISSING, 503, cors);
  if (url.pathname.startsWith(SYNC_PREFIX)) {
    return handleSync(request, env, url.pathname.slice(SYNC_PREFIX.length), cors, { json, fail, ensureSchema, checkAccountKey });
  }

  const action = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : "";
  if (!ACTIONS.has(action)) return fail("not-found", "Unbekannte Aktion.", 404, cors);
  if (request.method !== "POST") return fail("method-not-allowed", "Diese Aktion ist nur per POST verfügbar.", 405, cors);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return fail("payload-too-large", "Die Anfrage ist zu groß (Hintergrundbild verkleinern).", 413, cors);
  }

  let body;
  try { body = JSON.parse(await request.text()); } catch { return fail("invalid-params", "Ungültige Anfrage.", 400, cors); }
  const user = String(body?.user ?? "").trim().toLowerCase();
  const key = String(body?.key ?? "");
  const blob = typeof body?.blob === "string" ? body.blob : "";
  if (!USER_RX.test(user)) return fail("invalid-params", "Benutzername: 3–24 Zeichen, nur a–z, Ziffern, Punkt, Minus, Unterstrich.", 400, cors);
  if (!KEY_RX.test(key)) return fail("invalid-params", "Ungültiger Schlüssel.", 400, cors);
  if ((action === "register" || action === "save" || action === "rekey") && (!blob || blob.length > MAX_BLOB || !BLOB_RX.test(blob))) {
    return fail("invalid-params", "Design-Daten ungültig oder zu groß (Hintergrundbild verkleinern).", 400, cors);
  }

  await ensureSchema(env);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

  if (action === "register") {
    const taken = await env.DB.prepare("SELECT user FROM accounts WHERE user = ?1").bind(user).first();
    if (taken) return fail("conflict", "Diesen Benutzernamen gibt es schon – bitte anmelden.", 409, cors);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM accounts").first();
    if ((count?.n ?? 0) >= MAX_ACCOUNTS) return fail("limit", "Zurzeit sind keine weiteren Konten möglich.", 503, cors);
    const salt = randomB64(16);
    const hash = await hashKey(key, salt);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO accounts (user, auth_salt, auth_hash, blob, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)")
      .bind(user, salt, hash, blob, now).run();
    return json({ ok: true, user, updatedAt: now }, 200, cors);
  }

  if (await tooManyFails(env, user, ip)) return fail("rate-limited", "Zu viele Versuche – bitte in 15 Minuten wieder probieren.", 429, cors);
  const acc = await env.DB.prepare("SELECT user, auth_salt, auth_hash, blob, updated_at FROM accounts WHERE user = ?1").bind(user).first();
  // Same work for unknown names, so the answer time does not tell which names exist.
  const computed = await hashKey(key, acc?.auth_salt ?? "AAAAAAAAAAAAAAAAAAAAAA==");
  const ok = !!acc && sameBytes(computed, String(acc.auth_hash));
  if (!ok) {
    await noteFail(env, user, ip);
    return fail("unauthorized", "Benutzername oder Passwort falsch.", 401, cors);
  }
  await clearFails(env, user, ip);

  if (action === "login") return json({ ok: true, user, updatedAt: acc.updated_at }, 200, cors);
  if (action === "load") return json({ ok: true, user, blob: acc.blob, updatedAt: acc.updated_at }, 200, cors);
  if (action === "rekey") {
    // New user name and/or new password: the client has sealed the data with the new key; here only the login check changes.
    const newUser = String(body?.newUser ?? "").trim().toLowerCase();
    const newKey = String(body?.newKey ?? "");
    if (!USER_RX.test(newUser)) return fail("invalid-params", "Benutzername: 3–24 Zeichen, nur a–z, Ziffern, Punkt, Minus, Unterstrich.", 400, cors);
    if (!KEY_RX.test(newKey)) return fail("invalid-params", "Ungültiger Schlüssel.", 400, cors);
    if (newUser !== user && await env.DB.prepare("SELECT user FROM accounts WHERE user = ?1").bind(newUser).first()) {
      return fail("conflict", "Diesen Benutzernamen gibt es schon – bitte einen anderen wählen.", 409, cors);
    }
    const salt = randomB64(16);
    const hash = await hashKey(newKey, salt);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE accounts SET user = ?2, auth_salt = ?3, auth_hash = ?4, blob = ?5, updated_at = ?6 WHERE user = ?1").bind(user, newUser, salt, hash, blob, now).run();
    await env.DB.prepare("DELETE FROM login_fails WHERE user = ?1").bind(user).run();
    // What the PC and the devices synced was sealed with the old key: it is removed, the PC uploads it again with the new one.
    await deleteSyncData(env, user);
    return json({ ok: true, user: newUser, updatedAt: now }, 200, cors);
  }
  if (action === "save") {
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE accounts SET blob = ?2, updated_at = ?3 WHERE user = ?1").bind(user, blob, now).run();
    return json({ ok: true, user, updatedAt: now }, 200, cors);
  }
  await env.DB.prepare("DELETE FROM accounts WHERE user = ?1").bind(user).run();
  await env.DB.prepare("DELETE FROM login_fails WHERE user = ?1").bind(user).run();
  await deleteSyncData(env, user);
  return json({ ok: true, user }, 200, cors);
}

/** The same password check as "login" (rate limit, equal timing for unknown names). null = accepted, else the error answer. */
async function checkAccountKey(env, user, key, ip, cors) {
  if (await tooManyFails(env, user, ip)) return fail("rate-limited", "Zu viele Versuche – bitte in 15 Minuten wieder probieren.", 429, cors);
  const acc = await env.DB.prepare("SELECT auth_salt, auth_hash FROM accounts WHERE user = ?1").bind(user).first();
  const computed = await hashKey(key, acc?.auth_salt ?? "AAAAAAAAAAAAAAAAAAAAAA==");
  if (!acc || !sameBytes(computed, String(acc.auth_hash))) {
    await noteFail(env, user, ip);
    return fail("unauthorized", "Benutzername oder Passwort falsch.", 401, cors);
  }
  await clearFails(env, user, ip);
  return null;
}

/** Reachability without login – also proves that D1 answers, so a broken binding is not reported as "server down". */
async function healthResponse(env, cors) {
  const checkedAt = new Date().toISOString();
  if (!env.DB) {
    console.error("health: D1 binding DB is missing");
    return json({ ok: false, service: SERVICE, database: "unavailable", error: "database-unavailable", message: MSG_DB_MISSING, checkedAt }, 503, cors);
  }
  try {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    if (row?.ok !== 1) throw new Error("SELECT 1 returned no row");
    return json({ ok: true, service: SERVICE, database: "ok", link: env.PC_LINK ? "ok" : "unavailable", checkedAt }, 200, cors);
  } catch (e) {
    console.error("health: database check failed:", e?.message ?? String(e));
    return json({ ok: false, service: SERVICE, database: "unavailable", error: "database-unavailable", message: MSG_DB_MISSING, checkedAt }, 503, cors);
  }
}

// ------------------------------------------------------------------ storage

let schemaReady = null;
function ensureSchema(env) {
  schemaReady ??= env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS accounts (user TEXT PRIMARY KEY, auth_salt TEXT NOT NULL, auth_hash TEXT NOT NULL, blob TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS login_fails (user TEXT NOT NULL, ip TEXT NOT NULL, at TEXT NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS login_fails_lookup ON login_fails (user, ip, at)"),
  ]).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

async function tooManyFails(env, user, ip) {
  const since = new Date(Date.now() - FAIL_WINDOW_MS).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_fails WHERE user = ?1 AND ip = ?2 AND at > ?3").bind(user, ip, since).first();
  return (row?.n ?? 0) >= MAX_FAILS;
}
async function noteFail(env, user, ip) {
  await env.DB.prepare("INSERT INTO login_fails (user, ip, at) VALUES (?1, ?2, ?3)").bind(user, ip, new Date().toISOString()).run();
}
async function clearFails(env, user, ip) {
  await env.DB.prepare("DELETE FROM login_fails WHERE user = ?1 AND ip = ?2").bind(user, ip).run();
}

// ------------------------------------------------------------------ crypto / helpers

const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function randomB64(n) {
  let s = "";
  for (const b of crypto.getRandomValues(new Uint8Array(n))) s += String.fromCharCode(b);
  return btoa(s);
}
async function hashKey(keyHex, saltB64) {
  const material = await crypto.subtle.importKey("raw", hexToBytes(keyHex), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material, 256);
  return toHex(bits);
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** CORS is not the auth boundary (every call needs the account key); it only lets the allowed app origins read answers. */
function corsHeaders(request, env) {
  const base = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const allowed = String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.includes("*")) return { ...base, "Access-Control-Allow-Origin": "*" };
  const origin = request.headers.get("origin") ?? "";
  const self = new URL(request.url).origin;
  if (origin && (allowed.includes(origin) || origin === self)) {
    return { ...base, "Access-Control-Allow-Origin": origin };
  }
  return base;
}
function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}
function fail(error, message, status, cors) {
  return json({ ok: false, error, message }, status, cors);
}
