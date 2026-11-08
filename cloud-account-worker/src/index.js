// Nexus cloud account: a tiny API on Cloudflare Workers + D1 that stores the *encrypted* account blob of one user.
// It is the always-reachable twin of the companion's DesignAccountService: the browser sends only a derived login key
// (never the password) and an AES-GCM ciphertext it alone can open. The server keeps a PBKDF2 hash of that login key.
//
//   POST /api/account/register { user, key, blob }   create the account (fails if the name is taken)
//   POST /api/account/login    { user, key }         verify the login key
//   POST /api/account/load     { user, key }         -> { blob, updatedAt }
//   POST /api/account/save     { user, key, blob }   replace the blob
//   POST /api/account/delete   { user, key }         delete the account
//
// All requests are JSON over POST, always answered with CORS headers for the allowed app origins.

const USER_RX = /^[a-z0-9._-]{3,24}$/;
const KEY_RX = /^[0-9a-f]{64}$/;
const BLOB_RX = /^[A-Za-z0-9+/=]+$/;
const MAX_BLOB = 900_000;
const MAX_ACCOUNTS = 5000;
const ITERATIONS = 100_000;
const MAX_FAILS = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/api/account/health") return json({ ok: true, service: "nexus-cloud-account" }, 200, cors);
    const action = url.pathname.replace(/^\/api\/account\//, "");
    if (request.method !== "POST" || !["register", "login", "load", "save", "delete"].includes(action)) {
      return fail("not-found", "Unbekannte Aktion.", 404, cors);
    }
    let body;
    try { body = JSON.parse(await request.text()); } catch { return fail("invalid-params", "Ungültige Anfrage.", 400, cors); }
    const user = String(body?.user ?? "").trim().toLowerCase();
    const key = String(body?.key ?? "");
    const blob = typeof body?.blob === "string" ? body.blob : "";
    if (!USER_RX.test(user)) return fail("invalid-params", "Benutzername: 3–24 Zeichen, nur a–z, Ziffern, Punkt, Minus, Unterstrich.", 400, cors);
    if (!KEY_RX.test(key)) return fail("invalid-params", "Ungültiger Schlüssel.", 400, cors);
    if ((action === "register" || action === "save") && (!blob || blob.length > MAX_BLOB || !BLOB_RX.test(blob))) {
      return fail("invalid-params", "Design-Daten ungültig oder zu groß (Hintergrundbild verkleinern).", 400, cors);
    }

    try {
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
      if (action === "save") {
        const now = new Date().toISOString();
        await env.DB.prepare("UPDATE accounts SET blob = ?2, updated_at = ?3 WHERE user = ?1").bind(user, blob, now).run();
        return json({ ok: true, user, updatedAt: now }, 200, cors);
      }
      await env.DB.prepare("DELETE FROM accounts WHERE user = ?1").bind(user).run();
      await env.DB.prepare("DELETE FROM login_fails WHERE user = ?1").bind(user).run();
      return json({ ok: true, user }, 200, cors);
    } catch (e) {
      // Never echo internals (they may contain SQL); the client shows a clear sentence anyway.
      console.error("account api", e?.message ?? e);
      return fail("error", "Der Cloud-Dienst hatte einen Fehler – bitte später erneut probieren.", 500, cors);
    }
  },
};

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

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = origin && (allowed.includes(origin) || allowed.includes("*"));
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}
function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": cors["Access-Control-Allow-Origin"] } });
}
function fail(error, message, status, cors) {
  return new Response(JSON.stringify({ ok: false, error, message }), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}
