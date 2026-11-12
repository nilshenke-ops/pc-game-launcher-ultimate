// Automatic sync between the PC (companion), the cloud (D1) and every device of the same account.
//
//   POST /api/sync/token  { user, key, device }                 -> { token }   (key = the account's login key, checked like "login")
//   POST /api/sync/push   { user, token, items: [{ item, ver, parts: [blob…] }], pc? }  -> { seq }
//   POST /api/sync/pull   { user, token, seq?, have?: { item: ver } }               -> { seq, unchanged } | { seq, pcAt, pcName, items, ops }
//   POST /api/sync/op     { user, token, ops: [{ id, blob, at }] }                  -> { seq, stored }
//   POST /api/sync/ack    { user, token, ids: [id…] }                               -> { seq }
//   POST /api/sync/revoke { user, token }                                           -> { ok }
//   POST /api/sync/wake | wakeinfo                                                  -> see wake.js (the FRITZ!Box wakes the PC)
//
// Everything stored here is encrypted on the PC or in the browser with the account's own key – the server sees only ciphertext,
// item names ("library.list" …) and times. The PC is the source of its data: it pushes the latest state of each item whenever it
// changes; devices pull what differs from what they have. Changes made on a device while the PC is off are "ops": stored here until
// the PC takes them over (ack), visible to every device of the account in the meantime. A long random token per device (only its
// SHA-256 is stored) authenticates every sync call – the expensive password check runs once, when the token is made.

import { handleWake } from "./wake.js";

const USER_RX = /^[a-z0-9._-]{3,24}$/;
const KEY_RX = /^[0-9a-f]{64}$/;
const TOKEN_RX = /^[0-9a-f]{64}$/;
const ITEM_RX = /^[a-z][a-z0-9.]{1,40}$/;
const VER_RX = /^[A-Za-z0-9_-]{6,64}$/;
const OP_ID_RX = /^[A-Za-z0-9_-]{8,64}$/;
const BLOB_RX = /^[A-Za-z0-9+/=.]+$/;
const MAX_PART = 1_000_000;          // one D1 row stays well below the 2 MB row limit
const MAX_PARTS = 12;
const MAX_ITEMS_PER_PUSH = 40;
const MAX_OP_BLOB = 300_000;
const MAX_OPS_PER_CALL = 50;
const MAX_PENDING_OPS = 2000;
const MAX_TOKENS = 30;
const MAX_SYNC_BODY = 16_000_000;

let syncSchemaReady = null;
export function ensureSyncSchema(env) {
  syncSchemaReady ??= env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_tokens (hash TEXT PRIMARY KEY, user TEXT NOT NULL, device TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS sync_tokens_user ON sync_tokens (user)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_state (user TEXT PRIMARY KEY, seq INTEGER NOT NULL DEFAULT 0, pc_at TEXT, pc_name TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_items (user TEXT NOT NULL, item TEXT NOT NULL, part INTEGER NOT NULL, parts INTEGER NOT NULL, ver TEXT NOT NULL, blob TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user, item, part))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sync_ops (user TEXT NOT NULL, id TEXT NOT NULL, blob TEXT NOT NULL, at TEXT NOT NULL, device TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user, id))"),
  ]).catch((e) => { syncSchemaReady = null; throw e; });
  return syncSchemaReady;
}

/** Removes everything the sync stored for an account (called when the account is deleted). */
export async function deleteSyncData(env, user) {
  await ensureSyncSchema(env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sync_tokens WHERE user = ?1").bind(user),
    env.DB.prepare("DELETE FROM sync_state WHERE user = ?1").bind(user),
    env.DB.prepare("DELETE FROM sync_items WHERE user = ?1").bind(user),
    env.DB.prepare("DELETE FROM sync_ops WHERE user = ?1").bind(user),
  ]);
}

/**
 * @param deps { json, fail, checkAccountKey(env, user, key, ip) -> Response|null (null = ok) }
 */
export async function handleSync(request, env, action, cors, deps) {
  const { json, fail } = deps;
  if (request.method !== "POST") return fail("method-not-allowed", "Diese Aktion ist nur per POST verfügbar.", 405, cors);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_SYNC_BODY) return fail("payload-too-large", "Die Anfrage ist zu groß.", 413, cors);
  let body;
  try { body = JSON.parse(await request.text()); } catch { return fail("invalid-params", "Ungültige Anfrage.", 400, cors); }
  const user = String(body?.user ?? "").trim().toLowerCase();
  if (!USER_RX.test(user)) return fail("invalid-params", "Ungültiger Benutzername.", 400, cors);
  await deps.ensureSchema(env);
  await ensureSyncSchema(env);
  const now = new Date().toISOString();

  if (action === "token") {
    const key = String(body?.key ?? "");
    if (!KEY_RX.test(key)) return fail("invalid-params", "Ungültiger Schlüssel.", 400, cors);
    const denied = await deps.checkAccountKey(env, user, key, request.headers.get("cf-connecting-ip") ?? "unknown", cors);
    if (denied) return denied;
    const device = clean(body?.device, 40) || "Gerät";
    const token = randomHex(32);
    const hash = await sha256Hex(token);
    await env.DB.prepare("INSERT INTO sync_tokens (hash, user, device, created_at, used_at) VALUES (?1, ?2, ?3, ?4, ?4)").bind(hash, user, device, now).run();
    // Only the newest tokens stay valid – an account cannot pile up tokens forever.
    await env.DB.prepare("DELETE FROM sync_tokens WHERE user = ?1 AND hash NOT IN (SELECT hash FROM sync_tokens WHERE user = ?1 ORDER BY used_at DESC, created_at DESC LIMIT ?2)").bind(user, MAX_TOKENS).run();
    return json({ ok: true, token }, 200, cors);
  }

  // Every other action: the device token.
  const token = String(body?.token ?? "");
  if (!TOKEN_RX.test(token)) return fail("unauthorized", "Bitte erneut anmelden.", 401, cors);
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT user, device, used_at FROM sync_tokens WHERE hash = ?1").bind(hash).first();
  if (!row || row.user !== user) return fail("unauthorized", "Bitte erneut anmelden.", 401, cors);
  // Last use is noted at most once an hour (fewer writes).
  if (Date.parse(row.used_at) < Date.now() - 3_600_000) await env.DB.prepare("UPDATE sync_tokens SET used_at = ?2 WHERE hash = ?1").bind(hash, now).run();

  if (action === "wake" || action === "wakeinfo") return handleWake(env, action, user, body, cors, { json, fail }, deps.fetcher);

  if (action === "revoke") {
    await env.DB.prepare("DELETE FROM sync_tokens WHERE hash = ?1").bind(hash).run();
    return json({ ok: true }, 200, cors);
  }

  if (action === "push") {
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items || items.length === 0 || items.length > MAX_ITEMS_PER_PUSH) return fail("invalid-params", "Keine oder zu viele Einträge.", 400, cors);
    for (const it of items) {
      if (!ITEM_RX.test(String(it?.item ?? "")) || !VER_RX.test(String(it?.ver ?? ""))) return fail("invalid-params", "Ungültiger Eintrag.", 400, cors);
      if (!Array.isArray(it.parts) || it.parts.length === 0 || it.parts.length > MAX_PARTS) return fail("invalid-params", "Eintrag zu groß.", 400, cors);
      for (const p of it.parts) if (typeof p !== "string" || !p || p.length > MAX_PART || !BLOB_RX.test(p)) return fail("invalid-params", "Eintrag ungültig oder zu groß.", 400, cors);
    }
    const seq = await bump(env, user);
    const stmts = [];
    for (const it of items) {
      it.parts.forEach((p, i) => stmts.push(env.DB.prepare(
        "INSERT INTO sync_items (user, item, part, parts, ver, blob, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) " +
        "ON CONFLICT (user, item, part) DO UPDATE SET parts = ?4, ver = ?5, blob = ?6, updated_at = ?7").bind(user, it.item, i, it.parts.length, it.ver, p, now)));
      stmts.push(env.DB.prepare("DELETE FROM sync_items WHERE user = ?1 AND item = ?2 AND part >= ?3").bind(user, it.item, it.parts.length));
    }
    // The PC says it is alive with every push (the devices show "PC zuletzt synchronisiert …").
    if (body?.pc !== undefined) stmts.push(env.DB.prepare("UPDATE sync_state SET pc_at = ?2, pc_name = ?3 WHERE user = ?1").bind(user, now, clean(body.pc, 60) || null));
    await env.DB.batch(stmts);   // one transaction: a device never sees half of an item
    return json({ ok: true, seq, at: now }, 200, cors);
  }

  if (action === "pull") {
    const state = await env.DB.prepare("SELECT seq, pc_at, pc_name FROM sync_state WHERE user = ?1").bind(user).first();
    const seq = state?.seq ?? 0;
    if (Number.isInteger(body?.seq) && body.seq === seq) return json({ ok: true, seq, unchanged: true, pcAt: state?.pc_at ?? null, pcName: state?.pc_name ?? null }, 200, cors);
    const have = body?.have && typeof body.have === "object" ? body.have : {};
    const meta = await env.DB.prepare("SELECT item, ver, parts, MAX(updated_at) AS updated_at FROM sync_items WHERE user = ?1 GROUP BY item, ver, parts").bind(user).all();
    const out = [];
    for (const m of meta.results ?? []) {
      if (have[m.item] === m.ver) { out.push({ item: m.item, ver: m.ver, updatedAt: m.updated_at }); continue; }
      const rows = await env.DB.prepare("SELECT part, blob FROM sync_items WHERE user = ?1 AND item = ?2 AND ver = ?3 ORDER BY part").bind(user, m.item, m.ver).all();
      const parts = (rows.results ?? []).map((r) => r.blob);
      if (parts.length === m.parts) out.push({ item: m.item, ver: m.ver, updatedAt: m.updated_at, parts });
    }
    const ops = await env.DB.prepare("SELECT id, blob, at, device FROM sync_ops WHERE user = ?1 ORDER BY at, id LIMIT 500").bind(user).all();
    return json({ ok: true, seq, pcAt: state?.pc_at ?? null, pcName: state?.pc_name ?? null, items: out, ops: ops.results ?? [] }, 200, cors);
  }

  if (action === "op") {
    const ops = Array.isArray(body?.ops) ? body.ops : null;
    if (!ops || ops.length === 0 || ops.length > MAX_OPS_PER_CALL) return fail("invalid-params", "Keine oder zu viele Änderungen.", 400, cors);
    for (const o of ops) {
      if (!OP_ID_RX.test(String(o?.id ?? "")) || typeof o.blob !== "string" || !o.blob || o.blob.length > MAX_OP_BLOB || !BLOB_RX.test(o.blob)) return fail("invalid-params", "Ungültige Änderung.", 400, cors);
      if (!Number.isFinite(Date.parse(String(o.at ?? "")))) return fail("invalid-params", "Ungültige Zeit.", 400, cors);
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM sync_ops WHERE user = ?1").bind(user).first();
    if ((count?.n ?? 0) + ops.length > MAX_PENDING_OPS) return fail("limit", "Zu viele offene Änderungen – bitte den PC einmal starten.", 429, cors);
    // Same id twice (a retry after a lost answer) is stored once.
    const res = await env.DB.batch(ops.map((o) => env.DB.prepare("INSERT OR IGNORE INTO sync_ops (user, id, blob, at, device, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(user, o.id, o.blob, new Date(Date.parse(o.at)).toISOString(), row.device, now)));
    const stored = res.reduce((n, r) => n + (r?.meta?.changes ?? 0), 0);
    const seq = stored > 0 ? await bump(env, user) : ((await env.DB.prepare("SELECT seq FROM sync_state WHERE user = ?1").bind(user).first())?.seq ?? 0);
    return json({ ok: true, seq, stored }, 200, cors);
  }

  if (action === "ack") {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => OP_ID_RX.test(String(x))) : [];
    if (ids.length === 0 || ids.length > 500) return fail("invalid-params", "Keine gültigen Änderungen.", 400, cors);
    await env.DB.batch(ids.map((id) => env.DB.prepare("DELETE FROM sync_ops WHERE user = ?1 AND id = ?2").bind(user, id)));
    const seq = await bump(env, user);
    return json({ ok: true, seq }, 200, cors);
  }

  return fail("not-found", "Unbekannte Aktion.", 404, cors);
}

/** Next change number of the account – every push, new change and taken-over change raises it, so "pull" can answer "nothing new" with one read. */
async function bump(env, user) {
  const r = await env.DB.prepare("INSERT INTO sync_state (user, seq) VALUES (?1, 1) ON CONFLICT (user) DO UPDATE SET seq = seq + 1 RETURNING seq").bind(user).first();
  return r?.seq ?? 0;
}

const clean = (v, n) => (typeof v === "string" ? v : "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, n);
function randomHex(n) { return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
