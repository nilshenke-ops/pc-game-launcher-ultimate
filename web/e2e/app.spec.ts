import { expect, test, devices, type Browser, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { COMPANION, HOSTED_SITE, RELAY, state } from "./env";
import { ACCESS_HASH } from "../src/lib/access";

// The tests build on each other (pairing → launching → revoking), so they run in order.
test.describe.configure({ mode: "serial" });

let pc: Page;

/** Every test device has already entered the access code once (the code screen itself is tested separately). */
async function newCtx(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((hash) => { try { localStorage.setItem("pgl.access", hash); } catch { /* ignore */ } }, ACCESS_HASH);
  return ctx;
}
let phone: Page;

async function adminPage(browser: Browser) {
  const ctx = await newCtx(browser, { viewport: { width: 1400, height: 900 }, locale: "de-DE" });
  const page = await ctx.newPage();
  await page.goto(`${COMPANION}/#admin=${state().adminToken}`);
  return page;
}

async function pair(device: Page, base: string) {
  await pc.goto(`${COMPANION}/#/pair`);
  await pc.getByRole("button", { name: "Neuen Code erzeugen" }).click();
  const code = (await pc.locator(".code-display").textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(pc.locator(".qr img")).toBeVisible();

  await device.goto(`${base}/#/pair?code=${code}`);
  await expect(device.getByRole("heading", { name: "Gerät koppeln" })).toBeVisible();
  await expect(device.locator("input.code-input")).toHaveValue(code);
  await device.getByRole("button", { name: "Koppeln" }).click();
  await expect(device.getByText("Bestätigung am PC ausstehend")).toBeVisible();

  await expect(pc.getByRole("dialog", { name: "Neue Kopplungsanfrage" })).toBeVisible();
  await pc.getByRole("button", { name: "Erlauben" }).click();
  await expect(device.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible({ timeout: 15000 });
}

test("Zugangscode: einmal pro Gerät, falscher Code wird abgelehnt", async ({ browser }) => {
  const page = await (await browser.newContext({ ...devices["iPhone 13"], locale: "de-DE" })).newPage();
  await page.goto(`${HOSTED_SITE}/`);
  await expect(page.getByRole("heading", { name: "Zugangscode" })).toBeVisible();
  await page.getByLabel("Zugangscode").fill("0000");
  await expect(page.getByText("Falscher Code.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zugangscode" })).toBeVisible();
  // The real code is not stored in the repository; it is passed in when the tests run.
  const code = process.env.PGL_ACCESS_CODE;
  if (code) {
    await page.getByLabel("Zugangscode").fill(code);
    await expect(page.getByText("Offline – kein PC verbunden").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Zugangscode" })).toHaveCount(0); // remembered on this device
  }
});

test("PC-Ansicht zeigt den echten Zustand", async ({ browser }) => {
  pc = await adminPage(browser);
  await expect(pc.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible();
  await expect(pc.getByText("E2E-Gaming-PC").first()).toBeVisible();
  await expect(pc.getByText("Lokal verbunden")).toBeVisible();
  await expect(pc.getByText("Relay: verbunden")).toBeVisible();
});

test("Ungekoppeltes Handy: Bereiche zeigen „Offline“, Aktionen fragen nach dem PC, falscher Code wird abgelehnt", async ({ browser }) => {
  const ctx = await newCtx(browser, { ...devices["iPhone 13"], locale: "de-DE" });
  phone = await ctx.newPage();
  await phone.goto(`${COMPANION}/#/games`);
  await expect(phone.getByText("Offline – kein PC verbunden")).toBeVisible();
  await expect(phone.getByText("Kein PC verbunden. Verbinde deinen PC, um diesen Bereich zu nutzen.")).toBeVisible();
  await expect(phone.getByText("E2E Testspiel")).toHaveCount(0); // no data without pairing, and no invented examples
  await expect(phone.getByText("Counter-Strike 2")).toHaveCount(0);
  await phone.getByRole("main").getByRole("link", { name: "PC verbinden" }).last().click();
  await expect(phone.getByRole("heading", { name: "Gerät koppeln" })).toBeVisible();
  await phone.locator("input.code-input").fill("ABCD-EFGH");
  await phone.getByRole("button", { name: "Koppeln" }).click();
  await expect(phone.getByText(/kein Kopplungscode aktiv|ungültig/)).toBeVisible();
});

test("Kopplung im WLAN: Code, Bestätigung am PC, Sitzung bleibt nach Neuladen", async () => {
  await pair(phone, COMPANION);
  await phone.reload();
  await expect(phone.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible();
  await pc.goto(`${COMPANION}/#/devices`);
  await expect(pc.getByText("iPhone · Safari").first()).toBeVisible();
  await expect(pc.getByText("Online im WLAN")).toBeVisible();
});

test("Programm am PC freigeben und vom Handy starten", async () => {
  const work = state().workDir;
  await pc.goto(`${COMPANION}/#/games`);
  await pc.getByRole("button", { name: "Hinzufügen" }).first().click();
  await pc.getByRole("radio", { name: "Datei freigeben" }).click();
  await pc.getByPlaceholder(/Program Files/).fill(join(work, "fake-game.sh"));
  await pc.getByLabel("Anzeigename (optional)").fill("E2E Testspiel");
  await pc.getByRole("button", { name: "Freigeben", exact: true }).click();
  await expect(pc.getByText("E2E Testspiel")).toBeVisible();

  await phone.goto(`${COMPANION}/#/games`);
  await phone.getByRole("button", { name: "Spielen" }).first().click();
  await expect(phone.getByText("E2E Testspiel wird gestartet")).toBeVisible();
  await expect.poll(() => existsSync(join(work, "game-started.txt")), { timeout: 10000 }).toBe(true);

  // Remote devices cannot register new executables.
  await phone.getByRole("button", { name: "Hinzufügen" }).first().click();
  await phone.getByRole("radio", { name: "Datei freigeben" }).click();
  await expect(phone.getByText("Nur direkt am PC möglich")).toBeVisible();
  await phone.keyboard.press("Escape");
});

test("Globale Suche findet das Spiel", async () => {
  await pc.goto(`${COMPANION}/#/`);
  await pc.keyboard.press("Control+k");
  await pc.getByRole("combobox", { name: "Suche" }).fill("testsp");
  await expect(pc.getByRole("option", { name: /E2E Testspiel/ })).toBeVisible();
  await pc.keyboard.press("Escape");
});

test("Design wird gespeichert und übersteht das Neuladen", async () => {
  await phone.goto(`${COMPANION}/#/settings?s=design`);
  await phone.getByRole("button", { name: "Emerald" }).click();
  const primary = () => phone.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  expect(await primary()).toBe("#34d399");
  await phone.reload();
  await expect(phone.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  expect(await primary()).toBe("#34d399");
});

test("Plugin: Datei prüfen, installieren, mit Berechtigung aktivieren, Widget läuft abgeschottet", async () => {
  const work = state().workDir;
  const importFile = async (name: string, title: RegExp) => {
    await pc.goto(`${COMPANION}/#/plugins?tab=dev`);
    await pc.locator('input[type="file"]').setInputFiles(join(work, name));
    await expect(pc.getByText(title)).toBeVisible();
    await pc.getByRole("button", { name: "Installieren (deaktiviert)" }).click();
    await expect(pc.getByText("Installiert (deaktiviert) – jetzt testen und aktivieren")).toBeVisible();
  };
  await importFile("de.pgl.spielzeit-heute-1.0.0.pglplugin", /Prüfung bestanden: Spielzeit heute 1\.0\.0/);
  await importFile("de.test.sandbox-1.0.0.pglplugin", /Prüfung bestanden: Sandbox-Test 1\.0\.0/);

  // Activation lists the permissions and needs explicit consent.
  const activate = async (name: string, permissionText?: string) => {
    await pc.goto(`${COMPANION}/#/plugins`);
    await pc.locator(".card", { hasText: name }).getByRole("button", { name: "Details" }).click();
    await pc.getByRole("button", { name: "Aktivieren" }).click();
    if (permissionText) await expect(pc.getByText(permissionText)).toBeVisible();
    await pc.getByRole("button", { name: "Erlauben und aktivieren" }).click();
    await expect(pc.getByText("Plugin aktiviert")).toBeVisible();
    await pc.getByRole("button", { name: /aufs Dashboard/ }).first().click();
    await pc.keyboard.press("Escape");
  };
  await activate("Spielzeit heute", "Das Plugin erhält: Spielverlauf und Spielzeit lesen. Du kannst einzelne Rechte später entziehen.");
  await activate("Sandbox-Test");

  await pc.goto(`${COMPANION}/#/`);
  const widget = pc.frameLocator('iframe[title="Spielzeit heute: Spielzeit heute"]');
  await expect(widget.locator("#total")).toHaveText(/^\d+ (min|h)/, { timeout: 15000 }); // real data from history.get
  const probe = pc.frameLocator('iframe[title="Sandbox-Test: Sandbox-Probe"]').locator("body");
  await expect(probe).toHaveAttribute("data-result", /.+/, { timeout: 15000 });
  const result = await probe.getAttribute("data-result");
  expect(result).toContain("storage:blocked");
  expect(result).toContain("parent:blocked");
  expect(result).toContain("fetch:blocked");
  expect(result).toContain("call:Berechtigung fehlt: library.read");
  expect(result).toContain("admin:blocked");
  expect(result).not.toContain(":open");
});

test("Zugriff über das Relay mit Ende-zu-Ende-Kopplung", async ({ browser }) => {
  const ctx = await newCtx(browser, { ...devices["Pixel 7"], locale: "de-DE" });
  const remote = await ctx.newPage();
  await pair(remote, RELAY);
  await remote.goto(`${RELAY}/#/games`);
  await expect(remote.getByText("E2E Testspiel")).toBeVisible();
  await pc.goto(`${COMPANION}/#/devices`);
  await expect(pc.getByText("Online über Relay")).toBeVisible();
});

test("Widerrufenes Gerät verliert sofort den Zugriff", async () => {
  await pc.goto(`${COMPANION}/#/devices`);
  const row = pc.locator(".list-item", { hasText: "iPhone · Safari" });
  await row.getByRole("button", { name: "Entfernen" }).click();
  await pc.getByRole("dialog").getByRole("button", { name: "Entfernen" }).click();
  await expect(phone.getByText("Kopplung wurde aufgehoben")).toBeVisible({ timeout: 10000 });
  await phone.reload();
  await expect(phone.getByText("Offline – kein PC verbunden").first()).toBeVisible();
  await phone.locator(".bottom-nav").getByRole("link", { name: "Verbinden" }).click();
  await expect(phone.getByRole("heading", { name: "Gerät koppeln" })).toBeVisible();
});

test("Download-Status ist ehrlich (Entwicklungsserver hat keine EXE)", async () => {
  await pc.goto(`${COMPANION}/#/help`);
  await expect(pc.getByText("Companion noch nicht gebaut")).toBeVisible();
  await expect(pc.getByRole("button", { name: "Begleiter herunterladen" })).toBeDisabled();
});

test("Feste Webseite: PC verbinden per Code + PC-Adresse und per QR-Link", async ({ browser }) => {
  // Opens without any PC information and shows "PC verbinden".
  const ctx = await newCtx(browser, { ...devices["iPad (gen 7)"], locale: "de-DE" });
  const tablet = await ctx.newPage();
  await tablet.goto(`${HOSTED_SITE}/`);
  await expect(tablet.getByText("Offline – kein PC verbunden").first()).toBeVisible();
  await expect(tablet.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible();
  // Design works without a PC.
  await tablet.goto(`${HOSTED_SITE}/#/settings?s=design`);
  await tablet.getByRole("button", { name: "Emerald" }).click();
  expect(await tablet.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim())).toBe("#34d399");
  // Add a sound without PC: stored on the iPad, marked "wartet auf PC".
  await tablet.goto(`${HOSTED_SITE}/#/soundboard`);
  await tablet.getByRole("button", { name: "Sounds hinzufügen" }).click();
  await tablet.locator('input[type="file"][accept^="audio"]').setInputFiles({ name: "e2e-offline-sound.wav", mimeType: "audio/wav", buffer: wav() });
  await expect(tablet.getByText("Gespeichert – wird übertragen, sobald der PC verbunden ist")).toBeVisible();
  await tablet.keyboard.press("Escape");
  await expect(tablet.getByText("Wartet auf PC (1)")).toBeVisible();
  await tablet.reload(); // survives closing the page
  await expect(tablet.getByText("Wartet auf PC (1)")).toBeVisible();
  await tablet.locator(".bottom-nav").getByRole("link", { name: "Verbinden" }).click();
  await expect(tablet.getByRole("heading", { name: "PC verbinden" })).toBeVisible();

  // On the PC: create a code; the PC shows code and address to type in, and the QR link points to the hosted site.
  await pc.goto(`${COMPANION}/#/pair`);
  await pc.getByRole("button", { name: "Neuen Code erzeugen" }).click();
  const code = (await pc.locator(".code-display").textContent())!.trim();
  const address = (await pc.getByText("PC-Adresse (zum Abschreiben)").locator("..").locator("code").textContent())!.trim();
  expect(address).toBe(COMPANION);
  // The QR code points to the hosted site (first link), with code and PC address as parameters.
  await expect(pc.locator(".qr + code, .qr ~ code").first()).toHaveText(`${HOSTED_SITE}/`);

  // Manual path: type code and PC address.
  await tablet.locator("input.code-input").fill(code);
  await tablet.getByLabel("PC-Adresse").fill(address);
  await tablet.getByRole("button", { name: "PC verbinden" }).click();
  await expect(pc.getByRole("dialog", { name: "Neue Kopplungsanfrage" })).toBeVisible({ timeout: 15000 });
  await pc.getByRole("button", { name: "Erlauben" }).click();
  await expect(tablet.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible({ timeout: 15000 });
  await tablet.reload();
  await tablet.locator(".bottom-nav, .sidebar").getByRole("link", { name: "Spiele" }).first().click();
  await expect(tablet.getByText("E2E Testspiel")).toBeVisible({ timeout: 15000 });
  // After pairing the waiting sound was uploaded automatically and is now a real sound on the PC.
  await tablet.locator(".bottom-nav").getByRole("link", { name: "Sounds" }).click();
  await expect(tablet.getByRole("button", { name: /e2e-offline-sound abspielen/ })).toBeVisible({ timeout: 15000 });
  await expect(tablet.getByText(/Wartet auf PC/)).toHaveCount(0);

  // QR path: the link fills in code and PC address automatically.
  const phone2 = await (await newCtx(browser, { ...devices["iPhone 13"], locale: "de-DE" })).newPage();
  await pc.goto(`${COMPANION}/#/pair`);
  await pc.getByRole("button", { name: "Neuen Code erzeugen" }).click();
  const code2 = (await pc.locator(".code-display").textContent())!.trim();
  await phone2.goto(`${HOSTED_SITE}/#/pair?code=${code2}&pc=${encodeURIComponent(address)}`);
  await expect(phone2.locator("input.code-input")).toHaveValue(code2);
  await expect(phone2.getByLabel("PC-Adresse")).toHaveValue(address);
  await phone2.getByRole("button", { name: "PC verbinden" }).click();
  await expect(pc.getByRole("dialog", { name: "Neue Kopplungsanfrage" })).toBeVisible({ timeout: 15000 });
  await pc.getByRole("button", { name: "Erlauben" }).click();
  await expect(phone2.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible({ timeout: 15000 });
});

test("PC aus: App öffnet trotzdem, Design änderbar, verbindet sich automatisch wieder", async ({ browser }) => {
  const ctx = await newCtx(browser, { ...devices["iPhone 13"], locale: "de-DE" });
  const ipad = await ctx.newPage();
  await pair(ipad, COMPANION);
  // The offline cache (service worker) must be active before the PC goes away.
  await ipad.reload();
  await expect.poll(() => ipad.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration())?.active), { timeout: 15000 }).toBe(true);
  await ipad.reload();

  // "Turn the PC off": stop the companion.
  const s = state();
  process.kill(s.pids[0], "SIGTERM");
  await expect.poll(async () => { try { await fetch(`${COMPANION}/healthz`); return "up"; } catch { return "down"; } }, { timeout: 15000 }).toBe("down");

  await ipad.reload();
  await expect(ipad.getByRole("heading", { name: "Warte auf deinen PC …" })).toBeVisible({ timeout: 15000 });
  await ipad.getByRole("link", { name: "Design & Layout anpassen" }).click();
  await ipad.getByRole("button", { name: "Synthwave" }).click();
  expect(await ipad.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim())).toBe("#f472b6");

  // "Turn the PC on" again: same data directory, so the iPad's pairing is still valid.
  const { spawn } = await import("node:child_process");
  const { existsSync } = await import("node:fs");
  const dotnet = process.env.DOTNET ?? (existsSync("/opt/dotnet/dotnet") ? "/opt/dotnet/dotnet" : "dotnet");
  const root = join(s.workDir, "..");
  void root;
  const dll = new URL("../../companion/src/Companion.Headless/bin/Debug/net8.0/pgl-companion-headless.dll", import.meta.url).pathname;
  const proc = spawn(dotnet, [dll, "--data", s.dataDir], { env: { ...process.env, PGL_TEST_LAN_HOST: "127.0.0.1", PGL_WEB_DIR: new URL("../dist", import.meta.url).pathname }, stdio: "ignore", detached: true });
  proc.unref();
  try {
    await ipad.goto(`${COMPANION}/#/games`).catch(() => {});
    await expect(ipad.getByText("E2E Testspiel")).toBeVisible({ timeout: 30000 });
  } finally {
    process.kill(proc.pid!, "SIGTERM");
  }
});

/** A real, tiny 16-bit mono WAV file (0.1 s of a 440 Hz tone). */
function wav() {
  const rate = 8000, n = 800, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
