// Automatic cloud sync, end to end with the REAL parts: the Cloudflare Worker (workerd + a real D1 database kept on disk), a second headless
// companion ("the PC") and two browsers ("iPad" and "iPad 2" – neither is paired with the PC, they only know the account).
//
//  1 start the PC · 2 change things at the PC · 3 check the upload (sealed, decrypted here with the account key) · 4 open the same account on an iPad ·
//  5 everything is current there · 6 switch the PC off · 7 the cloud data is still there (a second iPad) · 8 change things offline ·
//  9 the cloud is down and comes back (D1 on disk) · 10 the PC starts again and takes over – nothing lost, nothing doubled.
//
// Needs a wrangler binary: PGL_WRANGLER=/path/to/node_modules/.bin/wrangler (skipped without it – the normal suite does not need Cloudflare tools).
import { expect, test, devices, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import WebSocket from "ws";
import { HOSTED_SITE } from "./env";
import { ACCESS_HASH } from "../src/lib/access";

const WRANGLER = process.env.PGL_WRANGLER;
test.skip(!WRANGLER, "PGL_WRANGLER fehlt (Pfad zu wrangler) – der Cloud-Test braucht den echten Worker mit D1");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const WORKER_PORT = 18799, PC_PORT = 18795;
const API = `http://127.0.0.1:${WORKER_PORT}`, PC = `http://127.0.0.1:${PC_PORT}`;
const USER = "e2e" + Math.floor(Math.random() * 1e6), PASSWORD = "e2e-cloud-passwort-1";
const work = mkdtempSync(join(tmpdir(), "pgl-cloud-"));
const dataDir = join(work, "pc-data"), d1Dir = join(work, "d1");
let worker: ChildProcess | null = null, pc: ChildProcess | null = null;
let keys: { auth: string; enc: string };

// ------------------------------------------------------------------ the account keys, exactly like the website derives them

function deriveKeys(user: string, password: string) {
  const bits = pbkdf2Sync(Buffer.from(password), Buffer.from("nexus-design-v1:" + user.toLowerCase()), 250_000, 64, "sha256");
  return { auth: bits.subarray(0, 32).toString("hex"), enc: bits.subarray(32).toString("base64") };
}
function open(enc: string, blob: string): string {
  const all = Buffer.from(blob.slice(3), "base64"), key = Buffer.from(enc, "base64");
  const d = createDecipheriv("aes-256-gcm", key, all.subarray(0, 12));
  d.setAuthTag(all.subarray(all.length - 16));
  const plain = Buffer.concat([d.update(all.subarray(12, all.length - 16)), d.final()]);
  return blob.startsWith("g1.") ? gunzipSync(plain).toString("utf8") : plain.toString("utf8");
}

// ------------------------------------------------------------------ the cloud (as an outside checker, with its own device token)

async function cloud(action: string, body: object) {
  const r = await fetch(`${API}/api/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}
let checkerToken = "";
async function pullAll() {
  if (!checkerToken) checkerToken = (await cloud("sync/token", { user: USER, key: keys.auth, device: "checker" })).body.token;
  const r = await cloud("sync/pull", { user: USER, token: checkerToken, seq: -1, have: {} });
  const items: Record<string, any> = {}, raw: Record<string, string> = {};
  for (const it of r.body.items ?? []) if (it.parts) { raw[it.item] = it.parts.join(""); items[it.item] = JSON.parse(open(keys.enc, raw[it.item])); }
  return { items, raw, ops: (r.body.ops ?? []) as { id: string; blob: string; device: string }[], pcAt: r.body.pcAt as string | null, pcName: r.body.pcName as string | null };
}
const libraryOf = async () => (await pullAll()).items["library.list"]?.items as { id: string; name: string; favorite: boolean; categories: string[]; rating: number }[] | undefined;

// ------------------------------------------------------------------ the real worker and the PC

async function waitFor(url: string, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if ((await fetch(url)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 300)); }
  throw new Error("Timeout: " + url);
}
async function startWorker() {
  const cfg = join(work, "wrangler.json");
  writeFileSync(cfg, JSON.stringify({ name: "nexus-e2e", main: join(ROOT, "cloud-account-worker/src/index.js"), compatibility_date: "2026-11-01", vars: { ALLOWED_ORIGINS: "*" },
    d1_databases: [{ binding: "DB", database_name: "nexus-e2e", database_id: "00000000-0000-0000-0000-000000000000" }] }));
  worker = spawn(WRANGLER!, ["dev", "-c", cfg, "--local", "--port", String(WORKER_PORT), "--ip", "127.0.0.1", "--persist-to", d1Dir], { cwd: work, stdio: "ignore", detached: true });
  await waitFor(`${API}/api/account/health`);
}
function stopWorker() { if (worker?.pid) { try { process.kill(-worker.pid, "SIGKILL"); } catch { /* gone */ } } worker = null; }

async function startPc() {
  const dll = join(ROOT, "companion/src/Companion.Headless/bin/Debug/net8.0/pgl-companion-headless.dll");
  const dotnet = process.env.DOTNET ?? (existsSync("/opt/dotnet/dotnet") ? "/opt/dotnet/dotnet" : "dotnet");
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(join(dataDir, "settings.json"))) writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ port: PC_PORT, lanAccess: false, pcName: "CLOUD-TEST-PC", webAppUrl: HOSTED_SITE, pluginCatalogUrl: "", updateManifestUrl: "" }));
  pc = spawn(dotnet, [dll, "--data", dataDir], { env: { ...process.env, PGL_WEB_DIR: join(ROOT, "web/dist"), PGL_ADMIN_TOKEN_FILE: join(work, "admin.txt") }, stdio: "ignore", detached: true });
  await waitFor(`${PC}/healthz`);
}
function stopPc() { if (pc?.pid) { try { process.kill(-pc.pid, "SIGTERM"); } catch { /* gone */ } } pc = null; }
async function pcGone() { const end = Date.now() + 20_000; while (Date.now() < end) { try { await fetch(`${PC}/healthz`); } catch { return; } await new Promise((r) => setTimeout(r, 300)); } throw new Error("PC läuft noch"); }

async function rpc<T = any>(method: string, params: object = {}): Promise<T> {
  const ws = new WebSocket(PC.replace(/^http/, "ws") + "/ws");
  await new Promise<void>((res, rej) => { ws.once("open", () => res()); ws.once("error", rej); });
  let id = 0;
  const call = (m: string, p: object) => new Promise<{ ok: boolean; r?: any; e?: { message: string } }>((res, rej) => {
    const n = ++id, t = setTimeout(() => rej(new Error(`${m}: keine Antwort`)), 20_000);
    const on = (raw: WebSocket.RawData) => { const msg = JSON.parse(String(raw)); if (msg.id !== n) return; clearTimeout(t); ws.off("message", on); res(msg); };
    ws.on("message", on); ws.send(JSON.stringify({ v: 1, id: n, m, p }));
  });
  try {
    await call("hello", {});
    const login = await call("auth.login", { adminToken: readFileSync(join(work, "admin.txt"), "utf8").trim() });
    if (!login.ok) throw new Error("Anmeldung: " + login.e?.message);
    const r = await call(method, params);
    if (!r.ok) throw new Error(`${method}: ${r.e?.message}`);
    return r.r as T;
  } finally { ws.close(); }
}

// ------------------------------------------------------------------ the two iPads: only the account, no PC

async function ipad(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ ...devices["iPad (gen 7)"], locale: "de-DE" });
  await ctx.addInitScript(([hash, api, session]) => {
    try {
      localStorage.setItem("pgl.access", hash as string);
      localStorage.setItem("pgl.cloud.endpoint", api as string);
      localStorage.setItem("pgl.designAccount", JSON.stringify(session));
      // the page's entrance animations move cards for half a second
      const css = ".content > *, .content .stack > *, .content .grid > * { animation: none !important; }";
      document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); }, { once: true });
    } catch { /* ignore */ }
  }, [ACCESS_HASH, API, { user: USER, auth: keys.auth, enc: keys.enc, savedAt: Date.now(), cloud: true }]);
  return ctx.newPage();
}
const row = (p: Page, name: string) => p.getByRole("button", { name: `${name} starten` });
const favButton = (p: Page, name: string) => p.locator("article", { hasText: name }).locator("button[aria-pressed]");

test.beforeAll(async () => {
  keys = deriveKeys(USER, PASSWORD);
  await startWorker();
  // the account exists in the cloud (the website's "register" call with an encrypted blob)
  const reg = await cloud("account/register", { user: USER, key: keys.auth, blob: "QUJD" });
  expect(reg.status).toBe(200);
  await startPc();
});
test.afterAll(() => { stopPc(); stopWorker(); });

test("1–3 PC läuft, Änderungen am PC, Übertragung in die Cloud – verschlüsselt, nur mit dem Konto-Schlüssel lesbar", async () => {
  // Two games on the PC.
  for (const [file, name] of [["alpha.sh", "Cloud Testspiel"], ["beta.sh", "Cloud Zweitspiel"]]) {
    writeFileSync(join(work, file), "#!/bin/sh\nexit 0\n"); chmodSync(join(work, file), 0o755);
    await rpc("library.addPath", { path: join(work, file), kind: "game", name });
  }
  // The PC takes the account over (what the website does by itself when signed in and the PC is connected).
  const st = await rpc("cloud.link", { api: API, user: USER, auth: keys.auth, enc: keys.enc });
  expect(st.linked).toBe(true);
  await expect.poll(async () => (await libraryOf())?.map((i) => i.name).sort(), { timeout: 30_000 }).toEqual(["Cloud Testspiel", "Cloud Zweitspiel"]);
  const all = await pullAll();
  expect(all.pcName).toBe("CLOUD-TEST-PC");
  expect(Object.keys(all.items)).toEqual(expect.arrayContaining(["library.list", "settings.get", "state.get", "profiles.list"]));
  // Only ciphertext in the cloud: no game name anywhere in what D1 holds.
  expect(all.raw["library.list"]).not.toContain("Cloud");
  expect(() => open(deriveKeys(USER, "falsches-passwort").enc, all.raw["library.list"])).toThrow();
  // A change at the PC reaches the cloud by itself (a few seconds, no button).
  const items = (await rpc("library.list")).items as { id: string; name: string }[];
  const alpha = items.find((i) => i.name === "Cloud Testspiel")!;
  await rpc("library.update", { id: alpha.id, favorite: true, categories: ["Indie"], rating: 4 });
  await expect.poll(async () => (await libraryOf())?.find((i) => i.name === "Cloud Testspiel"), { timeout: 20_000 }).toMatchObject({ favorite: true, categories: ["Indie"], rating: 4 });
});

test("Handy mit Admin-Recht verbindet den PC mit dem Konto (versiegelt) – ohne Admin-Recht passiert nichts", async ({ browser }) => {
  // The PC forgets the account; the phone (signed in with the account, paired with this PC) hands it over again.
  await rpc("cloud.unlink");
  expect((await rpc("cloud.status")).linked).toBe(false);
  const phone = await ipad(browser);
  const { code } = await rpc("pairing.create");
  await phone.goto(`${HOSTED_SITE}/#/pair?code=${code}&pc=127.0.0.1:${PC_PORT}`);
  await phone.getByRole("button", { name: "PC verbinden", exact: true }).last().click();
  await expect.poll(async () => (await rpc("pairing.pending")).pending.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const req = (await rpc("pairing.pending")).pending[0];
  await rpc("pairing.decide", { requestId: req.requestId, approve: true, permissions: ["view", "launch"] });
  await expect(phone.getByText("Gaming-Zentrale").first()).toBeVisible({ timeout: 20_000 });
  const dev = (await rpc("devices.list")).devices[0];
  // Without the admin right the PC is NOT connected (the account keys would travel to it).
  await rpc("devices.setPermissions", { id: dev.id, permissions: ["view", "launch"] });
  await phone.waitForTimeout(4000);
  expect((await rpc("cloud.status")).linked).toBe(false);
  // With it, the phone seals the keys for the PC and the PC takes the account over by itself.
  await rpc("devices.setPermissions", { id: dev.id, permissions: ["view", "launch", "manage", "admin"] });
  await expect.poll(async () => (await rpc("cloud.status")).linked, { timeout: 40_000 }).toBe(true);
  expect((await rpc("cloud.status")).user).toBe(USER);
  await expect.poll(async () => (await pullAll()).pcAt, { timeout: 30_000 }).not.toBeNull();
  // "Prüfen & reparieren": the PC is unlinked again, one button links it, uploads and says so line by line.
  await rpc("cloud.unlink");
  await phone.goto(`${HOSTED_SITE}/#/cloud`);
  const card = phone.locator(".card", { hasText: "Automatische Synchronisierung" });
  await card.getByRole("button", { name: "Prüfen & reparieren" }).click();
  await expect(card.getByText(/Der PC wurde jetzt mit dem Konto verbunden|Der PC ist mit dem Konto/)).toBeVisible({ timeout: 40_000 });
  await expect(card.getByText(/Der PC hat gerade hochgeladen/)).toBeVisible({ timeout: 40_000 });
  expect((await rpc("cloud.status")).linked).toBe(true);
  await phone.context().close();
});

test("4–5 Dasselbe Konto am iPad (nie mit dem PC gekoppelt): alles ist aktuell da, ohne dass der PC erreichbar sein muss", async ({ browser }) => {
  const p = await ipad(browser);
  await p.goto(`${HOSTED_SITE}/#/games`);
  await expect(p.getByText("Cloud Testspiel").first()).toBeVisible({ timeout: 30_000 });
  await expect(p.getByText("Cloud Zweitspiel").first()).toBeVisible();
  await expect(favButton(p, "Cloud Testspiel")).toHaveAttribute("aria-pressed", "true");     // favourite from the PC
  await expect(favButton(p, "Cloud Zweitspiel")).toHaveAttribute("aria-pressed", "false");
  // The home page too (it showed only the default tiles before): the PC's games, not "Steam / Xbox App / Game Pass".
  await p.goto(`${HOSTED_SITE}/#/`);
  await expect(p.getByText("Deine Spiele").first()).toBeVisible({ timeout: 20_000 });
  await expect(p.getByText("Cloud Testspiel").first()).toBeVisible({ timeout: 20_000 });
  // The status says it in words.
  await p.goto(`${HOSTED_SITE}/#/cloud`);
  const card = p.locator(".card", { hasText: "Automatische Synchronisierung" });
  await expect(card.getByText("Cloud verbunden")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("PC nicht verbunden")).toBeVisible();
  await expect(card.getByText("Synchronisierung abgeschlossen")).toBeVisible();
  await expect(card.getByText(/CLOUD-TEST-PC.*zuletzt/)).toBeVisible();
  await p.context().close();
});

test("6–7 PC aus: die Cloud-Daten sind weiter da – auf einem zweiten iPad, das den Stand zum ersten Mal sieht", async ({ browser }) => {
  stopPc(); await pcGone();
  const p = await ipad(browser);
  await p.goto(`${HOSTED_SITE}/#/games`);
  await expect(p.getByText("Cloud Testspiel").first()).toBeVisible({ timeout: 30_000 });
  await expect(favButton(p, "Cloud Testspiel")).toHaveAttribute("aria-pressed", "true");
  // Nothing that runs on the PC is offered as if it worked: starting needs the PC and says so.
  await p.locator("article", { hasText: "Cloud Zweitspiel" }).getByRole("button", { name: "Spielen" }).click();
  await expect(p.getByRole("dialog", { name: "Erst PC verbinden" })).toBeVisible();
  await p.getByRole("button", { name: "Weiter umsehen" }).click();
  await p.context().close();
});

test("8–10 Offline ändern, Cloud kurz weg, Cloud zurück, PC startet: alles wird übernommen – ohne Verlust und ohne Doppeltes", async ({ browser }) => {
  const p = await ipad(browser);
  await p.goto(`${HOSTED_SITE}/#/games`);
  await expect(p.getByText("Cloud Zweitspiel").first()).toBeVisible({ timeout: 30_000 });
  // 8: PC is off; the iPad changes things – shown at once, sent to the cloud as sealed changes.
  await favButton(p, "Cloud Zweitspiel").click();
  await expect(favButton(p, "Cloud Zweitspiel")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await pullAll()).ops.length, { timeout: 30_000 }).toBe(1);
  const op = JSON.parse(open(keys.enc, (await pullAll()).ops[0].blob));
  expect(op).toMatchObject({ method: "library.update", params: { favorite: true }, base: { favorite: false } });

  // 9: the cloud goes away; the iPad changes again (favourite off for the first game) – it stays on the iPad as "pending".
  stopWorker();
  await favButton(p, "Cloud Testspiel").click();
  await expect(favButton(p, "Cloud Testspiel")).toHaveAttribute("aria-pressed", "false");
  await p.goto(`${HOSTED_SITE}/#/cloud`);
  const card = p.locator(".card", { hasText: "Automatische Synchronisierung" });
  await expect(card.getByText("Cloud nicht erreichbar")).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(/1 Änderung\(en\) ausstehend/)).toBeVisible();
  // the cloud is back, with everything it stored before (D1 on disk) …
  await startWorker();
  checkerToken = "";
  expect((await libraryOf())?.length).toBe(2);
  // … and the waiting change is sent by itself.
  await expect(card.getByText("Cloud verbunden")).toBeVisible({ timeout: 40_000 });
  await expect.poll(async () => (await pullAll()).ops.length, { timeout: 40_000 }).toBe(2);
  await expect(card.getByText(/ausstehend/)).toHaveCount(0);

  // 10: the PC starts: it takes over both changes once, and the cloud copy shows the result.
  await startPc();
  await expect.poll(async () => (await rpc("library.list")).items.map((i: any) => [i.name, i.favorite]).sort().toString(), { timeout: 40_000 })
    .toBe([["Cloud Testspiel", false], ["Cloud Zweitspiel", true]].toString());
  await expect.poll(async () => (await pullAll()).ops.length, { timeout: 30_000 }).toBe(0);                // acknowledged: gone from the cloud
  await expect.poll(async () => (await libraryOf())?.map((l) => [l.name, l.favorite]).sort().toString(), { timeout: 30_000 })
    .toBe([["Cloud Testspiel", false], ["Cloud Zweitspiel", true]].toString());
  const lib = await rpc("library.list");
  expect(lib.items).toHaveLength(2);                                                                            // nothing doubled
  expect((await rpc("cloud.status")).state).toMatch(/ok|syncing/);
  // The iPad shows the same – from the cloud, still without a PC connection.
  await p.goto(`${HOSTED_SITE}/#/games`);
  await expect(favButton(p, "Cloud Zweitspiel")).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(favButton(p, "Cloud Testspiel")).toHaveAttribute("aria-pressed", "false");
  await p.context().close();
});

test("Soundboard: ein Link, am iPad ohne PC hinzugefügt, geht über die Cloud – der PC übernimmt ihn von selbst", async ({ browser }) => {
  const p = await ipad(browser);
  await p.goto(`${HOSTED_SITE}/#/soundboard`);
  await p.getByRole("button", { name: "Sounds hinzufügen" }).first().click();
  await p.getByRole("radio", { name: /Link \/ MyInstants/ }).click();
  await p.getByPlaceholder(/myinstants/).fill("https://127.0.0.1:1/test-sound.mp3");
  await p.getByRole("button", { name: "Importieren" }).click();
  await expect(p.getByText(/In der Cloud gespeichert/)).toBeVisible({ timeout: 30_000 });
  // the PC (running) takes the link over from the cloud by itself: the change leaves the cloud and the PC notes what it did
  await expect.poll(async () => (await rpc("cloud.status")).conflicts.join(" "), { timeout: 90_000, intervals: [3000] }).toContain("Sound-Link");
  await expect.poll(async () => (await pullAll()).ops.length, { timeout: 30_000, intervals: [2000] }).toBe(0);
  await p.reload();
  await expect(p.getByText(/In der Cloud gespeichert/)).toHaveCount(0, { timeout: 30_000 });      // taken over: the waiting entry is gone
  await p.context().close();
});

test("Benutzername und Passwort ändern (rekey): neues Login gilt, altes nicht mehr, Sync-Daten des alten Logins sind weg, Name nicht doppelt", async () => {
  const a = "rk" + Math.floor(Math.random() * 1e6), b = a + "x", other = "rk" + Math.floor(Math.random() * 1e6) + "o";
  const ka = deriveKeys(a, "passwort-eins"), kb = deriveKeys(b, "passwort-zwei"), ko = deriveKeys(other, "irgendwas-123");
  expect((await cloud("account/register", { user: a, key: ka.auth, blob: "QUJD" })).status).toBe(200);
  expect((await cloud("account/register", { user: other, key: ko.auth, blob: "QUJD" })).status).toBe(200);
  const tok = (await cloud("sync/token", { user: a, key: ka.auth, device: "t" })).body.token as string;
  expect((await cloud("sync/push", { user: a, token: tok, items: [{ item: "library.list", ver: "abcdefgh", parts: ["QUJD"] }] })).status).toBe(200);
  // a taken name is refused and nothing changes
  const taken = await cloud("account/rekey", { user: a, key: ka.auth, newUser: other, newKey: kb.auth, blob: "REVG" });
  expect(taken.status).toBe(409);
  expect((await cloud("account/login", { user: a, key: ka.auth })).status).toBe(200);
  // wrong current password is refused
  expect((await cloud("account/rekey", { user: a, key: kb.auth, newUser: b, newKey: kb.auth, blob: "REVG" })).status).toBe(401);
  // the change: new name + new password
  const ok = await cloud("account/rekey", { user: a, key: ka.auth, newUser: b, newKey: kb.auth, blob: "REVG" });
  expect(ok.status).toBe(200);
  expect(ok.body.user).toBe(b);
  expect((await cloud("account/login", { user: b, key: kb.auth })).status).toBe(200);
  expect((await cloud("account/login", { user: a, key: ka.auth })).status).toBe(401);
  expect((await cloud("account/login", { user: b, key: ka.auth })).status).toBe(401);
  expect((await cloud("account/load", { user: b, key: kb.auth })).body.blob).toBe("REVG");           // the data sealed with the new key
  // what was synced with the old login is gone, the old device token no longer works
  expect((await cloud("sync/pull", { user: a, token: tok, seq: -1, have: {} })).status).toBe(401);
  const tok2 = (await cloud("sync/token", { user: b, key: kb.auth, device: "t" })).body.token as string;
  const pulled = await cloud("sync/pull", { user: b, token: tok2, seq: -1, have: {} });
  expect(pulled.status).toBe(200);
  expect(pulled.body.items ?? []).toHaveLength(0);
  // password only (same name)
  const kc = deriveKeys(b, "passwort-drei");
  expect((await cloud("account/rekey", { user: b, key: kb.auth, newUser: b, newKey: kc.auth, blob: "REVG" })).status).toBe(200);
  expect((await cloud("account/login", { user: b, key: kc.auth })).status).toBe(200);
  expect((await cloud("account/login", { user: b, key: kb.auth })).status).toBe(401);
});

test("Profil: Benutzername und Passwort sehen, Geheimcode setzen, Passwort ändern – am iPad, mit dem echten Dienst", async ({ browser }) => {
  const p = await ipad(browser);
  await p.goto(`${HOSTED_SITE}/#/settings?s=account`);             // its own item in the settings
  await expect(p.getByRole("button", { name: /Konto & Anmeldedaten/ })).toBeVisible({ timeout: 20_000 });
  await expect(p.locator(".card", { hasText: "Zugangsdaten" })).toBeVisible({ timeout: 20_000 });
  await p.goto(`${HOSTED_SITE}/#/profile`);
  const card = p.locator(".card", { hasText: "Zugangsdaten" });
  await expect(card.getByText(USER, { exact: true })).toBeVisible({ timeout: 20_000 });
  // an older sign-in: the password is typed once (checked against the account), then it can be shown
  await expect(card.getByText(/kennt dein Passwort noch nicht/)).toBeVisible();
  await card.getByPlaceholder("Passwort", { exact: true }).fill("falsches-passwort");
  await card.getByRole("button", { name: "Merken" }).click();
  await expect(card.getByText("Das Passwort stimmt nicht.")).toBeVisible({ timeout: 20_000 });
  await card.getByPlaceholder("Passwort", { exact: true }).fill(PASSWORD);
  await card.getByRole("button", { name: "Merken" }).click();
  await card.getByRole("button", { name: "Anzeigen" }).click();
  await expect(card.getByText(PASSWORD, { exact: true })).toBeVisible();
  // the optional extra code: off at first, then set – the view is locked until the code is typed
  await expect(card.getByText("Aktuell ohne Code")).toBeVisible();
  await card.getByRole("button", { name: "Geheimcode festlegen" }).click();
  await card.getByLabel("Neuer Geheimcode").fill("4711");
  await card.getByRole("button", { name: "Geheimcode speichern" }).click();
  await expect(card.getByText("Der Geheimcode ist gesetzt")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText(PASSWORD, { exact: true })).toHaveCount(0);
  await card.getByPlaceholder("Geheimcode", { exact: true }).fill("0000");
  await card.getByRole("button", { name: "Mit Geheimcode anzeigen" }).click();
  await expect(card.getByText("Der Geheimcode ist falsch.")).toBeVisible({ timeout: 20_000 });
  await card.getByPlaceholder("Geheimcode", { exact: true }).fill("4711");
  await card.getByRole("button", { name: "Mit Geheimcode anzeigen" }).click();
  await expect(card.getByText(PASSWORD, { exact: true })).toBeVisible({ timeout: 20_000 });
  // change the password – no old password needed (the device is signed in)
  const NEW = "neues-passwort-99";
  await card.locator(".field", { hasText: "Passwort" }).first().getByRole("button", { name: "Ändern" }).click();
  await card.getByLabel("Neues Passwort", { exact: true }).fill(NEW);
  await card.getByLabel("Neues Passwort wiederholen").fill(NEW);
  await card.getByRole("button", { name: "Passwort ändern", exact: true }).click();
  await expect(p.getByText("Passwort geändert.")).toBeVisible({ timeout: 40_000 });
  const nk = deriveKeys(USER, NEW);
  expect((await cloud("account/login", { user: USER, key: nk.auth })).status).toBe(200);
  expect((await cloud("account/login", { user: USER, key: keys.auth })).status).toBe(401);
  await p.context().close();
});


test("Konto nur am PC: in den Einstellungen sichtbar und per Knopf in die Cloud übernehmen (gleicher Name, gleiches Passwort)", async ({ browser }) => {
  const user = "pcacc" + Math.floor(Math.random() * 1e6), password = "pc-konto-passwort";
  const k = deriveKeys(user, password);
  const ctx = await browser.newContext({ ...devices["iPad (gen 7)"], locale: "de-DE" });
  await ctx.addInitScript(([hash, api, session]) => {
    try { localStorage.setItem("pgl.access", hash as string); localStorage.setItem("pgl.cloud.endpoint", api as string); localStorage.setItem("pgl.designAccount", JSON.stringify(session)); } catch { /* ignore */ }
  }, [ACCESS_HASH, API, { user, auth: k.auth, enc: k.enc, savedAt: Date.now() }]);       // no "cloud": true = an account at the PC
  const p = await ctx.newPage();
  await p.goto(`${HOSTED_SITE}/#/settings?s=account`);
  const card = p.locator(".card", { hasText: "Zugangsdaten" });
  await expect(card.getByText(user, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("Dieses Konto liegt nur am PC")).toBeVisible();
  // the name and the password are shown for an account at the PC as well
  await card.getByPlaceholder("Passwort", { exact: true }).fill("falsches-passwort");
  await card.getByRole("button", { name: "Merken" }).click();
  await expect(card.getByText("Das Passwort stimmt nicht.")).toBeVisible({ timeout: 20_000 });
  await card.getByPlaceholder("Passwort", { exact: true }).fill(password);
  await card.getByRole("button", { name: "Merken" }).click();
  await card.getByRole("button", { name: "Anzeigen" }).click();
  await expect(card.getByText(password, { exact: true })).toBeVisible();
  // and it can move into the cloud
  const box = card.locator(".card-inner input[type=password]");
  await box.fill("falsches-passwort");
  await card.getByRole("button", { name: "In die Cloud übernehmen" }).click();
  await expect(card.getByText("Das Passwort stimmt nicht.").last()).toBeVisible({ timeout: 20_000 });
  await box.fill(password);
  await card.getByRole("button", { name: "In die Cloud übernehmen" }).click();
  await expect(card.getByRole("button", { name: "Ändern" }).first()).toBeVisible({ timeout: 30_000 });   // the cloud card: now the name can be changed
  expect((await cloud("account/login", { user, key: k.auth })).status).toBe(200);                      // the account exists in the cloud now
  await ctx.close();
});
