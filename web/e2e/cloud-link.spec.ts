// The account's cloud link, end to end with the REAL parts: the Cloudflare Worker with its Durable Object (workerd, D1 on disk), a headless
// companion ("the PC", linked to the account) and browsers that only know the account – never paired, no PC address, the hosted website.
//
//  1 the PC runs: the phone finds it by itself through the cloud and gets its own access · 2 the PC goes off: "PC offline", account and cloud data stay ·
//  3 the PC starts again: connected again by itself, no reload, no QR code · 4 the browser is restarted · 5 the cloud is down and comes back ·
//  6 a second device · 7 a wrong account gets nothing; the switch at the PC ends it.
//
// Needs a wrangler binary: PGL_WRANGLER=/path/to/node_modules/.bin/wrangler (skipped without it).
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
const WORKER_PORT = 18797, PC_PORT = 18796;
const API = `http://127.0.0.1:${WORKER_PORT}`, PC = `http://127.0.0.1:${PC_PORT}`;
const USER = "lnk" + Math.floor(Math.random() * 1e6), PASSWORD = "e2e-cloud-passwort-1";
const work = mkdtempSync(join(tmpdir(), "pgl-link-"));
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
    d1_databases: [{ binding: "DB", database_name: "nexus-e2e", database_id: "00000000-0000-0000-0000-000000000000" }],
    durable_objects: { bindings: [{ name: "PC_LINK", class_name: "PcLink" }] }, migrations: [{ tag: "v1", new_sqlite_classes: ["PcLink"] }] }));
  worker = spawn(WRANGLER!, ["dev", "-c", cfg, "--local", "--port", String(WORKER_PORT), "--ip", "127.0.0.1", "--persist-to", d1Dir], { cwd: work, stdio: "ignore", detached: true });
  await waitFor(`${API}/api/account/health`);
}
function stopWorker() { if (worker?.pid) { try { process.kill(-worker.pid, "SIGKILL"); } catch { /* gone */ } } worker = null; }

async function startPc() {
  const dll = join(ROOT, "companion/src/Companion.Headless/bin/Debug/net8.0/pgl-companion-headless.dll");
  const dotnet = process.env.DOTNET ?? (existsSync("/opt/dotnet/dotnet") ? "/opt/dotnet/dotnet" : "dotnet");
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(join(dataDir, "settings.json"))) writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ port: PC_PORT, lanAccess: false, pcName: "LINK-TEST-PC", webAppUrl: HOSTED_SITE, pluginCatalogUrl: "", updateManifestUrl: "" }));
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

const OFFLINE = "Cloud verbunden · PC offline";
const devicesAtPc = async () => (await rpc("devices.list")).devices as { id: string; name: string; online: boolean; transport: string | null; permissions: string[] }[];
const onlineAtPc = async () => (await devicesAtPc()).filter((d) => d.online).length;
async function phonePage(browser: Browser) { const p = await ipad(browser); await p.goto(`${HOSTED_SITE}/#/games`); return p; }

test.beforeAll(async () => {
  keys = deriveKeys(USER, PASSWORD);
  await startWorker();
  expect((await cloud("account/register", { user: USER, key: keys.auth, blob: "QUJD" })).status).toBe(200);
  await startPc();
  writeFileSync(join(work, "alpha.sh"), "#!/bin/sh\nexit 0\n"); chmodSync(join(work, "alpha.sh"), 0o755);
  await rpc("library.addPath", { path: join(work, "alpha.sh"), kind: "game", name: "Link Testspiel" });
  // The PC is linked to the account (what the PC app does by itself when the account is signed in there).
  expect((await rpc("cloud.link", { api: API, user: USER, auth: keys.auth, enc: keys.enc })).linked).toBe(true);
  await expect.poll(async () => (await rpc("cloud.status")).link?.state, { timeout: 20_000 }).toBe("connected");
});
test.afterAll(() => { stopPc(); stopWorker(); });

let phone: Page;

test("1 PC läuft: Handy nur mit Konto findet den PC über die Cloud und bekommt einen eigenen Zugang – ohne QR-Code", async ({ browser }) => {
  expect(await devicesAtPc()).toHaveLength(0);
  phone = await phonePage(browser);
  await expect.poll(onlineAtPc, { timeout: 30_000 }).toBe(1);
  const [dev] = await devicesAtPc();
  expect(dev.transport).toBe("relay");                                   // through the cloud link, not a direct address
  expect(dev.name).toContain("Konto");
  expect(dev.permissions.sort()).toEqual(["launch", "manage", "soundboard", "view"]);   // standard rights, no admin
  await expect(phone.getByRole("button", { name: "Link Testspiel starten" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(phone.getByText(OFFLINE)).toBeHidden();
  // A real command through the link: the game starts at the PC.
  await phone.getByRole("button", { name: "Link Testspiel starten" }).first().click();
  await expect.poll(async () => JSON.stringify((await rpc("history.get")) ?? {}), { timeout: 15_000 }).toContain("Link Testspiel");
});

test("2 PC geht aus: Anzeige „PC offline“, Konto und Cloud-Daten bleiben – 3 PC startet: von selbst wieder verbunden", async () => {
  stopPc(); await pcGone();
  await expect(phone.getByText(OFFLINE)).toBeVisible({ timeout: 20_000 });
  await expect(phone.getByRole("button", { name: "Link Testspiel starten" }).first()).toBeVisible();   // the cloud copy
  // nothing is retried while waiting: the page keeps one connection to the cloud and no retry counter runs
  await phone.waitForTimeout(3000);
  await expect(phone.getByText(OFFLINE)).toBeVisible();
  await startPc();
  await expect.poll(onlineAtPc, { timeout: 40_000 }).toBe(1);                              // no reload, no tap
  await expect(phone.getByText(OFFLINE)).toBeHidden({ timeout: 15_000 });
  expect(await devicesAtPc()).toHaveLength(1);                                             // the same access, not a second one
});

test("4 Browser neu gestartet: gleiche Anmeldung, gleicher Zugang, sofort wieder verbunden", async () => {
  const ctx = phone.context();
  await phone.close();
  await expect.poll(onlineAtPc, { timeout: 15_000 }).toBe(0);
  phone = await ctx.newPage();
  await phone.goto(`${HOSTED_SITE}/#/games`);
  await expect.poll(onlineAtPc, { timeout: 30_000 }).toBe(1);
  expect(await devicesAtPc()).toHaveLength(1);
  // every page opens by its link, also a second time (reload)
  for (const route of ["/control", "/devices", "/soundboard", "/games"]) {
    await phone.goto(`${HOSTED_SITE}/#${route}`); await phone.reload();
    await expect(phone.getByText("Dieser Bereich konnte nicht geladen werden")).toHaveCount(0);
    await expect.poll(onlineAtPc, { timeout: 30_000 }).toBe(1);
  }
});

test("5 Cloud fällt kurz aus und kommt zurück: PC und Handy verbinden sich von selbst wieder", async () => {
  stopWorker();
  await expect.poll(onlineAtPc, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => (await rpc("cloud.status")).link?.state, { timeout: 30_000 }).not.toBe("connected");
  await startWorker();
  await expect.poll(async () => (await rpc("cloud.status")).link?.state, { timeout: 90_000 }).toBe("connected");
  await expect.poll(onlineAtPc, { timeout: 90_000 }).toBe(1);
  expect(await devicesAtPc()).toHaveLength(1);
});

test("6 zweites Gerät im selben Konto: eigener Zugang, beide verbunden", async ({ browser }) => {
  const second = await phonePage(browser);
  await expect.poll(onlineAtPc, { timeout: 30_000 }).toBe(2);
  expect(await devicesAtPc()).toHaveLength(2);
  await second.context().close();
  await expect.poll(onlineAtPc, { timeout: 15_000 }).toBe(1);
});

test("7 falsches Konto bekommt nichts; entfernt am PC = sofort getrennt; Schalter am PC aus = Cloud-Verbindung endet", async () => {
  // A stranger who knows the account NAME and reaches the link with a made-up token is refused by the cloud.
  const bad = new WebSocket(`ws://127.0.0.1:${WORKER_PORT}/api/link/ws?user=${USER}`);
  const got: string[] = [];
  bad.on("message", (m) => got.push(String(m)));
  await new Promise<void>((res, rej) => { bad.once("open", () => res()); bad.once("error", rej); });
  bad.send(JSON.stringify({ type: "link-auth", token: "x".repeat(43) }));
  await expect.poll(() => got.join(), { timeout: 10_000 }).toContain("auth-failed");
  // With a valid cloud token but without the account's data key the PC gives no access (wrong proof).
  const tok = (await cloud("sync/token", { user: USER, key: keys.auth, device: "fremd" })).body.token as string;
  const ws = new WebSocket(`ws://127.0.0.1:${WORKER_PORT}/api/link/ws?user=${USER}`);
  const inbox: any[] = [];
  ws.on("message", (m) => { try { inbox.push(JSON.parse(String(m))); } catch { /* not json */ } });
  await new Promise<void>((res, rej) => { ws.once("open", () => res()); ws.once("error", rej); });
  ws.send(JSON.stringify({ type: "link-auth", token: tok }));
  await expect.poll(() => inbox.some((m) => m.state === "companion-online"), { timeout: 10_000 }).toBe(true);
  ws.send(JSON.stringify({ v: 1, id: 1, m: "hello", p: {} }));
  await expect.poll(() => inbox.some((m) => m.id === 1), { timeout: 10_000 }).toBe(true);
  ws.send(JSON.stringify({ v: 1, id: 2, m: "pairing.account", p: { user: USER, proof: "00".repeat(32), deviceName: "Fremd" } }));
  await expect.poll(() => inbox.find((m) => m.id === 2)?.e?.code, { timeout: 10_000 }).toBe("account-mismatch");
  ws.send(JSON.stringify({ v: 1, id: 3, m: "library.list", p: {} }));
  await expect.poll(() => inbox.find((m) => m.id === 3)?.ok, { timeout: 10_000 }).toBe(false);
  ws.close();
  expect(await devicesAtPc()).toHaveLength(2);
  // Removed at the PC: the phone is out at once.
  const mine = (await devicesAtPc()).find((d) => d.online)!;
  await rpc("devices.revoke", { id: mine.id });
  await expect.poll(onlineAtPc, { timeout: 15_000 }).toBe(0);
  // The switch at the PC: no cloud link, no account login any more.
  await rpc("settings.saveSecurity", { cloudLink: false });
  await expect.poll(async () => (await rpc("cloud.status")).link?.state, { timeout: 15_000 }).toBe("disabled");
  await phone.reload();
  await expect(phone.getByText(OFFLINE)).toBeVisible({ timeout: 30_000 });
  expect(await onlineAtPc()).toBe(0);
});
