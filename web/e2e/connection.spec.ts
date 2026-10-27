// Verbindungs-Tests 1–20 (Master-Prompt „Dauerhafte Multi-Device-Verbindung“). Eigener Begleiter und eigenes Relay,
// damit sie gezielt neu gestartet und abgeschaltet werden können. „PC“ = Begleiter-Fenster (admin), Geräte = echte
// Chromium-Kontexte mit iPhone/iPad-Profil (eigener Speicher je Kontext, wie getrennte Geräte).
import { expect, test, devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACCESS_HASH } from "../src/lib/access";
import { HOSTED_SITE } from "./env";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const ROOT = new URL("../..", import.meta.url).pathname;
const PORT = 18797, RELAY_PORT = 18798;
const PC = `http://127.0.0.1:${PORT}`;        // the PC's own window (loopback)
const LAN = `http://127.0.0.2:${PORT}`;       // the PC's Wi-Fi address as phones see it
const RELAY = `http://127.0.0.1:${RELAY_PORT}`;
const SECRET = "conn-relay-secret-0123456789abcdef";
const SESSION_SECONDS = 8;

let work = "", data = "", game = "", marker = "";
let companion: ChildProcess | null = null, relay: ChildProcess | null = null;
let pc: Page;

const up = async (url: string) => { try { return (await fetch(url)).ok; } catch { return false; } };
async function waitUp(url: string, ms = 30000) { const end = Date.now() + ms; while (Date.now() < end) { if (await up(url)) return; await new Promise((r) => setTimeout(r, 200)); } throw new Error("nicht erreichbar: " + url); }
async function waitDown(url: string) { await expect.poll(() => up(url), { timeout: 15000 }).toBe(false); }
const dotnet = () => process.env.DOTNET ?? (existsSync("/opt/dotnet/dotnet") ? "/opt/dotnet/dotnet" : "dotnet");

async function startCompanion() {
  try { (await import("node:fs")).rmSync(join(work, "admin.txt")); } catch { /* first start */ }
  companion = spawn(dotnet(), [join(ROOT, "companion/src/Companion.Headless/bin/Debug/net8.0/pgl-companion-headless.dll"), "--data", data], {
    env: { ...process.env, PGL_WEB_DIR: join(ROOT, "web/dist"), PGL_ADMIN_TOKEN_FILE: join(work, "admin.txt"), PGL_TEST_LAN_HOST: "127.0.0.2", PGL_TEST_ROUTER_NAME: "gaming-pc.fritz.box", PGL_SESSION_LIFETIME_SECONDS: String(SESSION_SECONDS) },
    stdio: "ignore", detached: true,
  });
  companion.unref();
  await waitUp(`${PC}/healthz`);
  await expect.poll(() => existsSync(join(work, "admin.txt")) && readFileSync(join(work, "admin.txt"), "utf8").trim().length > 10, { timeout: 15000 }).toBe(true);
}
async function stopCompanion() { if (companion?.pid) { try { process.kill(companion.pid, "SIGTERM"); } catch { /* gone */ } } companion = null; await waitDown(`${PC}/healthz`); }
async function startRelay() {
  relay = spawn(process.execPath, [join(ROOT, "relay/dist/src/main.js")], { env: { ...process.env, PGL_RELAY_CONFIG: join(work, "relay.json") }, stdio: "ignore", detached: true });
  relay.unref();
  await waitUp(`${RELAY}/healthz`);
}
async function stopRelay() { if (relay?.pid) { try { process.kill(relay.pid, "SIGTERM"); } catch { /* gone */ } } relay = null; await waitDown(`${RELAY}/healthz`); }
async function relayHasPc() { const end = Date.now() + 30000; while (Date.now() < end) { try { if ((await (await fetch(`${RELAY}/healthz`)).json()).companionsOnline > 0) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 300)); } throw new Error("PC nicht am Relay"); }

async function device(browser: Browser, profile: keyof typeof devices | null, storageState?: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...(profile ? devices[profile] : { viewport: { width: 1280, height: 860 } }), locale: "de-DE", ...(storageState ? { storageState } : {}) });
  await ctx.addInitScript((hash) => { try { localStorage.setItem("pgl.access", hash); } catch { /* ignore */ } }, ACCESS_HASH);
  return { ctx, page: await ctx.newPage() };
}

async function newCode(): Promise<string> {
  await pc.goto(`${PC}/#/pair`);
  await pc.getByRole("button", { name: "Neuen Code erzeugen" }).click();
  await expect(pc.locator(".qr img")).toBeVisible();
  return (await pc.locator(".code-display").textContent())!.trim();
}
async function confirmOnPc() {
  await expect(pc.getByRole("dialog", { name: "Neue Kopplungsanfrage" })).toBeVisible({ timeout: 15000 });
  await pc.getByRole("button", { name: "Erlauben" }).click();
}
/** The link in the QR code: Wi-Fi address of the PC + one-time code. */
async function pairByQr(page: Page, base = LAN) {
  const code = await newCode();
  await page.goto(`${base}/#/pair?code=${code}`);
  await expect(page.locator("input.code-input")).toHaveValue(code);
  await page.getByRole("button", { name: "Koppeln" }).click();
  await confirmOnPc();
  await expect(page.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible({ timeout: 15000 });
  return code;
}
const pill = (p: Page) => p.locator(".conn-pill");
async function connected(p: Page, timeout = 20000) { await expect(pill(p).locator(".dot.ok")).toBeVisible({ timeout }); }

test.beforeAll(async ({ browser }) => {
  for (const f of ["companion/src/Companion.Headless/bin/Debug/net8.0/pgl-companion-headless.dll", "relay/dist/src/main.js", "web/dist/index.html"]) if (!existsSync(join(ROOT, f))) throw new Error("Nicht gebaut: " + f);
  work = mkdtempSync(join(tmpdir(), "pgl-conn-"));
  data = join(work, "data"); mkdirSync(data);
  writeFileSync(join(data, "settings.json"), JSON.stringify({
    port: PORT, lanAccess: true, pcName: "Gaming-PC", webAppUrl: HOSTED_SITE,
    relayEnabled: true, relayUrl: `ws://127.0.0.1:${RELAY_PORT}`, relayCompanionId: "conn-pc", relaySecretProtected: "plain:" + SECRET,
    pluginCatalogUrl: "", updateManifestUrl: "", steamEnabled: false, epicEnabled: false, eaEnabled: false, xboxEnabled: false, autoLinkDone: true,
  }));
  writeFileSync(join(work, "relay.json"), JSON.stringify({ port: RELAY_PORT, host: "127.0.0.1", webDir: join(ROOT, "web/dist"), downloadsDir: join(work, "dl"), companions: [{ id: "conn-pc", secretSha256: createHash("sha256").update(SECRET).digest("hex") }] }));
  game = join(work, "spiel.sh"); marker = join(work, "gestartet.txt");
  writeFileSync(game, `#!/bin/sh\necho "$(date +%s%N)" >> "${marker}"\n`); chmodSync(game, 0o755);
  await startRelay();
  await startCompanion();
  await relayHasPc();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "de-DE" });
  await ctx.addInitScript((hash) => localStorage.setItem("pgl.access", hash), ACCESS_HASH);
  pc = await ctx.newPage();
  await pc.goto(`${PC}/#admin=${readFileSync(join(work, "admin.txt"), "utf8").trim()}`);
  await expect(pc.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible();
  // A real executable that the tests start ("Programm freigeben" is PC-only).
  await pc.goto(`${PC}/#/games`);
  await pc.getByRole("button", { name: "Hinzufügen" }).first().click();
  await pc.getByRole("radio", { name: "Datei freigeben" }).click();
  await pc.getByPlaceholder(/Program Files/).fill(game);
  await pc.getByLabel("Anzeigename (optional)").fill("Testspiel");
  await pc.getByRole("button", { name: "Freigeben", exact: true }).click();
  await expect(pc.getByText("Testspiel")).toBeVisible();
});

test.afterAll(async () => {
  for (const p of [companion, relay]) if (p?.pid) { try { process.kill(p.pid, "SIGTERM"); } catch { /* gone */ } }
});

let iphone: { ctx: BrowserContext; page: Page };
let ipad: { ctx: BrowserContext; page: Page };
let usedCode = "";

test("1 – iPhone wird per QR-Code gekoppelt", async ({ browser }) => {
  iphone = await device(browser, "iPhone 13");
  usedCode = await pairByQr(iphone.page);
  await connected(iphone.page);
  await expect(pill(iphone.page)).toContainText("Lokal");
});

test("2 + 9 – iPhone öffnet die Website erneut und neu geladen: verbunden ohne neuen QR-Scan", async () => {
  await iphone.page.reload();
  await connected(iphone.page);
  const tab = await iphone.ctx.newPage(); // the website opened again (new tab, same device)
  await tab.goto(`${LAN}/`);
  await connected(tab);
  await expect(tab.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible();
  await tab.close();
});

test("3 + 4 – iPad als zweites Gerät, beide werden unabhängig verwaltet", async ({ browser }) => {
  ipad = await device(browser, "iPad (gen 7)");
  await pairByQr(ipad.page);
  await connected(ipad.page);
  await pc.goto(`${PC}/#/devices`);
  const rows = pc.locator(".list-item", { hasText: "Safari" });
  await expect(rows).toHaveCount(2);
  await expect(pc.getByText("2 von 20 Geräten")).toBeVisible();
  await expect(pc.locator(".card", { hasText: "Dieser PC" }).getByText("Online")).toBeVisible();
  // Rename only the iPad.
  const ipadRow = pc.locator(".list-item", { hasText: "iPad" });
  await ipadRow.getByRole("button", { name: "Bearbeiten" }).click();
  await pc.getByRole("dialog").getByLabel("Name").fill("iPad Wohnzimmer");
  await pc.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(pc.locator(".list-item", { hasText: "iPad Wohnzimmer" }).getByText("Online im WLAN")).toBeVisible();
  await expect(pc.locator(".list-item", { hasText: "iPhone" }).getByText("Online im WLAN")).toBeVisible();
});

let third: { ctx: BrowserContext; page: Page };
test("5 – drittes Gerät mit manuell eingegebenem Code (Gerätegrenze 20)", async ({ browser }) => {
  third = await device(browser, null);
  const code = await newCode();
  await third.page.goto(`${LAN}/#/pair`);
  await third.page.locator("input.code-input").fill(code.replace("-", "").toLowerCase()); // typed by hand
  await third.page.getByRole("button", { name: "Koppeln" }).click();
  await confirmOnPc();
  await connected(third.page);
  await pc.goto(`${PC}/#/devices`);
  await expect(pc.getByText("3 von 20 Geräten")).toBeVisible();
});

test("6 – entkoppeltes Gerät hat danach keinen Zugriff mehr", async () => {
  await pc.goto(`${PC}/#/devices`);
  const row = pc.locator(".list-item").filter({ hasNotText: "iPhone" }).filter({ hasNotText: "iPad" }).filter({ has: pc.getByRole("button", { name: "Entfernen" }) });
  await row.getByRole("button", { name: "Entfernen" }).click();
  await pc.getByRole("dialog").getByRole("button", { name: "Entfernen" }).click();
  await expect(pill(third.page)).toContainText("Nicht autorisiert", { timeout: 10000 });
  await third.page.reload();
  await expect(pill(third.page).locator(".dot.ok")).toHaveCount(0);
  expect(await third.page.evaluate(() => localStorage.getItem("pgl.cred"))).toBeNull();
  await pc.goto(`${PC}/#/devices`);
  await expect(pc.getByText("2 von 20 Geräten")).toBeVisible();
});

test("7 – verbrauchter und verworfener Kopplungscode wird abgelehnt", async ({ browser }) => {
  const d = await device(browser, "iPhone 13");
  await d.page.goto(`${LAN}/#/pair?code=${usedCode}`);
  await d.page.getByRole("button", { name: "Koppeln" }).click();
  await expect(d.page.getByText(/kein Kopplungscode aktiv|Code ist ungültig/)).toBeVisible();
  const code = await newCode();
  await pc.getByRole("button", { name: "Code verwerfen" }).click();
  await d.page.locator("input.code-input").fill(code);
  await d.page.getByRole("button", { name: "Koppeln" }).click();
  await expect(d.page.getByText(/kein Kopplungscode aktiv/)).toBeVisible();
  await d.ctx.close();
});

test("8 + 18 – nach Ablauf der Sitzung meldet sich das iPhone selbst neu an; Taste startet das Programm am PC", async () => {
  await iphone.page.goto(`${LAN}/#/games`);
  await expect(iphone.page.getByText("Testspiel")).toBeVisible();
  await iphone.page.waitForTimeout((SESSION_SECONDS + 2) * 1000); // session older than its lifetime
  const before = existsSync(marker) ? readFileSync(marker, "utf8").trim().split("\n").length : 0;
  await iphone.page.getByRole("button", { name: "Spielen" }).first().click();
  await expect(iphone.page.getByText("Testspiel wird gestartet")).toBeVisible();
  await expect.poll(() => (existsSync(marker) ? readFileSync(marker, "utf8").trim().split("\n").length : 0), { timeout: 10000 }).toBe(before + 1);
  await connected(iphone.page);
});

test("10 – Browser geschlossen und neu geöffnet: verbunden ohne neue Kopplung", async ({ browser }) => {
  const state = join(work, "iphone-state.json");
  await iphone.ctx.storageState({ path: state });
  await iphone.ctx.close();
  iphone = await device(browser, "iPhone 13", state);
  await iphone.page.goto(`${LAN}/`);
  await connected(iphone.page);
});

test("11 – Netz kurz weg (Verbindung hängt, keine Antworten): Herzschlag merkt es, danach automatisch wieder verbunden", async () => {
  // Chromium's offline switch keeps open WebSockets alive, so the outage is made real: the PC stops answering
  // (like Wi-Fi gone while the socket still looks open) – the app has to notice it by itself.
  process.kill(companion!.pid!, "SIGSTOP");
  await iphone.ctx.setOffline(true);
  try {
    await expect(pill(iphone.page).locator(".dot.ok")).toHaveCount(0, { timeout: 35000 });
    await expect(pill(iphone.page)).toContainText(/Wiederverbinden|Offline|Verbinde/);
  } finally {
    await iphone.ctx.setOffline(false);
    process.kill(companion!.pid!, "SIGCONT");
  }
  await connected(iphone.page, 30000);
  await connected(ipad.page, 30000);
});

test("12 + 14 – Begleiter (bzw. PC) neu gestartet: beide Geräte verbinden sich selbst wieder", async () => {
  await stopCompanion();
  await expect(pill(iphone.page)).toContainText(/Wiederverbinden|Offline/, { timeout: 15000 });
  await expect(pill(ipad.page).locator(".dot.ok")).toHaveCount(0, { timeout: 15000 });
  await startCompanion();
  await connected(iphone.page);
  await connected(ipad.page);
  // The PC window also reconnects (new admin token after a restart is only for the PC itself).
  await pc.goto("about:blank");
  await pc.goto(`${PC}/#admin=${readFileSync(join(work, "admin.txt"), "utf8").trim()}`);
  await connected(pc);
});

let remote: { ctx: BrowserContext; page: Page };
test("17 – anderes Netz über das Relay: koppeln, starten (Ende-zu-Ende)", async ({ browser }) => {
  await relayHasPc();
  remote = await device(browser, "iPhone 13");
  await pairByQr(remote.page, RELAY);
  await connected(remote.page);
  await expect(pill(remote.page)).toContainText("Über Relay");
  await remote.page.goto(`${RELAY}/#/games`);
  const before = readFileSync(marker, "utf8").trim().split("\n").length;
  await remote.page.getByRole("button", { name: "Spielen" }).first().click();
  await expect.poll(() => readFileSync(marker, "utf8").trim().split("\n").length, { timeout: 10000 }).toBe(before + 1);
});

test("20 + 13 – Relay nicht erreichbar: ehrlich offline, kontrollierte Versuche, nach Neustart wieder verbunden", async () => {
  await stopRelay();
  await expect(pill(remote.page).locator(".dot.ok")).toHaveCount(0, { timeout: 20000 });
  await expect(pill(remote.page)).toContainText(/Wiederverbinden|Offline/);
  // Controlled retries: the attempt number (shown in the status) grows slowly – no storm of connections.
  const attempt = async () => Number(((await pill(remote.page).getAttribute("title")) ?? "").match(/Versuch (\d+)/)?.[1] ?? 0);
  const a0 = await attempt();
  await remote.page.waitForTimeout(6000);
  const a1 = await attempt();
  expect(a1).toBeGreaterThan(a0);
  expect(a1 - a0).toBeLessThanOrEqual(15);
  await startRelay();
  await relayHasPc();
  await remote.page.goto(`${RELAY}/`);
  await connected(remote.page, 30000);
  await expect(pill(remote.page)).toContainText("Über Relay");
  // The local devices were never affected.
  await connected(iphone.page);
});

test("19 – unautorisiertes Gerät sendet einen Steuerbefehl: abgelehnt, nichts startet", async ({ browser }) => {
  const d = await device(browser, null);
  await d.page.goto(`${LAN}/`);
  const before = readFileSync(marker, "utf8").trim().split("\n").length;
  const answer = await d.page.evaluate(async (port) => new Promise<string>((res) => {
    const ws = new WebSocket(`ws://127.0.0.2:${port}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ v: 1, id: 1, m: "library.list", p: {} }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === 1) { const id = m.ok ? m.r.items?.[0]?.id : "itm_x"; ws.send(JSON.stringify({ v: 1, id: 2, m: "library.launch", p: { id } })); return; }
      if (m.id === 2) { res(m.ok ? "AUSGEFÜHRT" : m.e.code); ws.close(); }
    };
  }), PORT);
  expect(answer).toBe("unauthenticated");
  await d.page.waitForTimeout(500);
  expect(readFileSync(marker, "utf8").trim().split("\n").length).toBe(before);
  await d.ctx.close();
});

test("16 – VPN blockiert das Heimnetz: Diagnose erklärt es, nichts behauptet „verbunden“", async ({ browser }) => {
  // The website with a saved PC address in the home network that is not reachable (what a full-tunnel VPN does to 192.168.x/10.x).
  const v = await device(browser, "iPhone 13");
  await v.page.addInitScript(() => localStorage.setItem("pgl.server", JSON.stringify("ws://10.255.255.1:18797/ws")));
  await v.page.goto(`${HOSTED_SITE}/#/diagnostics`);
  await expect(v.page.locator('[data-check="4"]')).toContainText("VPN", { timeout: 30000 });
  await expect(v.page.locator('[data-check="4"] .badge')).toHaveText("Fehler");
  await expect(v.page.locator('[data-check="6"] .badge')).not.toHaveText("OK");
  await expect(pill(v.page).locator(".dot.ok")).toHaveCount(0);
  await v.ctx.close();
});

test("Diagnose: Verbindungs-Check mit 10 Prüfungen am gekoppelten iPhone", async () => {
  await iphone.page.goto(`${LAN}/#/diagnostics`);
  for (let i = 1; i <= 10; i++) await expect(iphone.page.locator(`[data-check="${i}"]`)).toBeVisible({ timeout: 20000 });
  for (const i of [2, 4, 5, 6, 7, 8, 9, 10]) await expect(iphone.page.locator(`[data-check="${i}"] .badge`)).toHaveText("OK");
  await expect(iphone.page.locator('[data-check="3"]')).toContainText("Nicht verwendet");
  await iphone.page.getByRole("button", { name: "Erneut prüfen" }).click();
  await expect(iphone.page.locator('[data-check="10"]')).toContainText("Recht „Starten“");
});

test("21 – PC am Kabel, Handy im WLAN: QR-Code mit der IP öffnet, danach zieht das Handy mit einem Tipp auf den festen Namen um", async () => {
  // The test browser resolves the router name like a FRITZ!Box would for a phone in the same network.
  const { chromium } = await import("@playwright/test");
  const b = await chromium.launch({
    args: ["--host-resolver-rules=MAP gaming-pc.fritz.box 127.0.0.1", "--no-proxy-server"],
    // A phone in the home network talks to the PC directly – never through this machine's proxy.
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k))) as Record<string, string>,
  });
  const phone = await device(b, "Pixel 7");
  // The companion looks for its fixed name a few seconds after starting.
  await expect.poll(async () => (await fetch(`${PC}/`)).headers.get("content-security-policy") ?? "", { timeout: 15000 }).toContain("gaming-pc.fritz.box");
  const code = await newCode();
  // The QR code shows the IP first (opens on every phone), the fixed name is offered as well.
  const chips = await pc.locator(".qr + .chips .chip").allTextContents();
  expect(chips.indexOf(`127.0.0.2:${PORT}`)).toBeGreaterThanOrEqual(0);
  expect(chips.indexOf(`127.0.0.2:${PORT}`)).toBeLessThan(chips.indexOf(`gaming-pc.fritz.box:${PORT}`));
  await phone.page.goto(`${LAN}/#/pair?code=${code}`);
  await phone.page.getByRole("button", { name: "Koppeln" }).click();
  await confirmOnPc();
  await expect(phone.page.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible({ timeout: 15000 });
  await expect(phone.page.getByText(`Feste Adresse gefunden: gaming-pc.fritz.box:${PORT}`)).toBeVisible({ timeout: 20000 });
  await phone.page.getByRole("button", { name: "Jetzt umziehen" }).click();
  await phone.page.waitForURL(new RegExp(`^http://gaming-pc\\.fritz\\.box:${PORT}/`), { timeout: 15000 });
  await expect(phone.page.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible({ timeout: 15000 });
  // The new address has its own access (no new pairing): signed in and connected.
  await expect.poll(() => phone.page.evaluate(() => localStorage.getItem("pgl.cred") !== null), { timeout: 20000 }).toBe(true);
  await connected(phone.page, 45000);
  // Under the fixed name there is nothing more to move to.
  await phone.page.waitForTimeout(3000);
  await expect(phone.page.getByText("Feste Adresse gefunden")).toHaveCount(0);
  await b.close();
});
