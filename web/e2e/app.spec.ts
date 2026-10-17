import { expect, test, devices, type Browser, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { COMPANION, RELAY, state } from "./env";

// The tests build on each other (pairing → launching → revoking), so they run in order.
test.describe.configure({ mode: "serial" });

let pc: Page;
let phone: Page;

async function adminPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "de-DE" });
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

test("PC-Ansicht zeigt den echten Zustand", async ({ browser }) => {
  pc = await adminPage(browser);
  await expect(pc.getByRole("heading", { name: "Gaming-Zentrale" })).toBeVisible();
  await expect(pc.getByText("E2E-Gaming-PC").first()).toBeVisible();
  await expect(pc.getByText("Lokal verbunden")).toBeVisible();
  await expect(pc.getByText("Relay: verbunden")).toBeVisible();
});

test("Ungekoppeltes Handy sieht nur die Kopplung, falscher Code wird abgelehnt", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "de-DE" });
  phone = await ctx.newPage();
  await phone.goto(`${COMPANION}/#/games`);
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

test("Zugriff über das Relay mit Ende-zu-Ende-Kopplung", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "de-DE" });
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
  await expect(phone.getByRole("heading", { name: "Gerät koppeln" })).toBeVisible();
});

test("Download-Status ist ehrlich (Entwicklungsserver hat keine EXE)", async () => {
  await pc.goto(`${COMPANION}/#/help`);
  await expect(pc.getByText("Companion noch nicht gebaut")).toBeVisible();
  await expect(pc.getByRole("button", { name: "Begleiter herunterladen" })).toBeDisabled();
});

test("PC aus: App öffnet trotzdem, Design änderbar, verbindet sich automatisch wieder", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "de-DE" });
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
  const proc = spawn(dotnet, [dll, "--data", s.dataDir], { env: { ...process.env, PGL_WEB_DIR: new URL("../dist", import.meta.url).pathname }, stdio: "ignore", detached: true });
  proc.unref();
  try {
    await ipad.goto(`${COMPANION}/#/games`).catch(() => {});
    await expect(ipad.getByText("E2E Testspiel")).toBeVisible({ timeout: 30000 });
  } finally {
    process.kill(proc.pid!, "SIGTERM");
  }
});
