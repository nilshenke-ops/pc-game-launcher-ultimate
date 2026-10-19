import { expect, test, devices, type Browser, type Page } from "@playwright/test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { COMPANION, HOSTED_SITE, OBS_PASSWORD, OBS_PORT, OBS_URL, RELAY, state } from "./env";
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
  // Games come from the PC: without pairing the list is empty with an explanation – no invented examples.
  await expect(phone.getByText("Noch kein PC verbunden")).toBeVisible();
  await expect(phone.getByText("E2E Testspiel")).toHaveCount(0);
  await expect(phone.getByText("Counter-Strike 2")).toHaveCount(0);
  await phone.getByRole("link", { name: "PC verbinden" }).first().click();
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

test("Weitere Beispiel-Plugins laufen mit echten Daten vom PC", async () => {
  const work = state().workDir;
  const plugins: [string, string, string][] = [
    ["de.pgl.favoriten-start-1.0.0.pglplugin", "Favoriten-Start", "Favoriten starten"],
    ["de.pgl.top-woche-1.0.0.pglplugin", "Top-Spiele der Woche", "Top-Spiele"],
    ["de.pgl.sound-pad-1.0.0.pglplugin", "Sound-Pad", "Sound-Pad"],
    ["de.pgl.profil-wechsler-1.0.0.pglplugin", "Profil-Wechsler", "Profil wechseln"],
    ["de.pgl.pc-check-1.0.0.pglplugin", "PC-Check", "PC-Check"],
    ["de.pgl.leistungs-verlauf-1.0.0.pglplugin", "Leistungs-Verlauf", "Leistungs-Verlauf"],
  ];
  for (const [file, name] of plugins) {
    await pc.goto(`${COMPANION}/#/plugins?tab=dev`);
    await pc.locator('input[type="file"]').setInputFiles(join(work, file));
    await expect(pc.getByText(`Prüfung bestanden: ${name} 1.0.0`)).toBeVisible();
    await pc.getByRole("button", { name: "Installieren (deaktiviert)" }).click();
    await expect(pc.getByText("Installiert (deaktiviert) – jetzt testen und aktivieren")).toBeVisible();
    await pc.goto(`${COMPANION}/#/plugins`);
    await pc.locator(".card", { hasText: name }).getByRole("button", { name: "Details" }).click();
    await pc.getByRole("button", { name: "Aktivieren" }).click();
    await pc.getByRole("button", { name: "Erlauben und aktivieren" }).click();
    await expect(pc.getByText("Plugin aktiviert")).toBeVisible();
    await pc.getByRole("button", { name: /aufs Dashboard/ }).first().click();
    await pc.keyboard.press("Escape");
  }
  // A favourite game appears as a launch button in the widget and really starts on the PC.
  await pc.goto(`${COMPANION}/#/games`);
  await pc.getByRole("button", { name: "Als Favorit markieren" }).first().click();
  await expect(pc.getByRole("button", { name: "Favorit entfernen" }).first()).toBeVisible();
  await pc.goto(`${COMPANION}/#/`);
  const frame = (name: string, title: string) => pc.frameLocator(`iframe[title="${name}: ${title}"]`);
  const fav = frame("Favoriten-Start", "Favoriten starten");
  rmSync(join(work, "game-started.txt"), { force: true });
  await fav.getByRole("button", { name: /E2E Testspiel/ }).click({ timeout: 15000 });
  await expect.poll(() => existsSync(join(work, "game-started.txt")), { timeout: 10000 }).toBe(true);
  await expect(fav.locator("#err")).toHaveText("");

  const top = frame("Top-Spiele der Woche", "Top-Spiele");
  await expect(top.locator("#range")).toHaveText("Letzte 7 Tage", { timeout: 15000 });
  await expect(top.locator("#total")).toHaveText(/^\d+ (min|h)/);
  // Headless PC has no sounds and no profiles: the widgets say so instead of showing fake entries.
  await expect(frame("Sound-Pad", "Sound-Pad").locator("#info")).toHaveText(/Noch keine (Favoriten|Sounds)/, { timeout: 15000 });
  await expect(frame("Profil-Wechsler", "Profil wechseln").locator("#active")).toHaveText(/Aktiv: |Kein Profil aktiv\./, { timeout: 15000 });
  const check = frame("PC-Check", "PC-Check");
  await check.getByRole("button", { name: "Prüfen" }).click();
  await expect(check.locator("#summary")).toHaveText(/\d+ Fehler, \d+ Warnungen|Alles in Ordnung/, { timeout: 20000 });
  const perf = pc.locator('iframe[title="Leistungs-Verlauf: Leistungs-Verlauf"]');
  await perf.scrollIntoViewIfNeeded();
  await expect(frame("Leistungs-Verlauf", "Leistungs-Verlauf").locator("#legend")).toHaveText(/CPU \d+ %/, { timeout: 20000 });
});

const obsState = async () => (await (await fetch(`http://127.0.0.1:${OBS_PORT}/state`)).json()) as { recording: boolean; replayBuffer: boolean; savedReplays: number; requests: string[] };

test("Overlay & Aufnahme: OBS verbinden, aufnehmen, Replay speichern, Tastenkürzel, Overlay-Plugin", async () => {
  await pc.goto(`${COMPANION}/#/overlay-settings`);
  await expect(pc.getByRole("heading", { name: "Overlay & Aufnahme" })).toBeVisible();
  // Without the Windows companion there is no overlay window – said so, no fake button.
  await expect(pc.getByText("Das Overlay gibt es nur im Windows-Begleiter.")).toBeVisible();
  await expect(pc.getByRole("button", { name: "Overlay jetzt zeigen" })).toHaveCount(0);

  // Wrong password first: OBS refuses, the reason is shown.
  await pc.getByLabel("OBS-WebSocket-Adresse").fill(OBS_URL);
  await pc.getByLabel("OBS-WebSocket-Passwort").fill("falsch");
  await pc.getByRole("button", { name: "Speichern und verbinden" }).click();
  await expect(pc.getByText(/OBS hat das Passwort abgelehnt/).first()).toBeVisible();
  await pc.getByLabel("OBS-WebSocket-Passwort").fill(OBS_PASSWORD);
  await pc.getByRole("button", { name: "Speichern und verbinden" }).click();
  await expect(pc.getByText("Mit OBS verbunden")).toBeVisible();
  await expect(pc.getByText(/Verbunden · obs-websocket 5\.5\.4/)).toBeVisible();

  // Recording and replay go through the companion to OBS.
  await pc.getByRole("button", { name: "Aufnahme starten" }).click();
  await expect.poll(async () => (await obsState()).recording).toBe(true);
  await expect(pc.getByRole("button", { name: "Aufnahme stoppen" })).toBeVisible();
  await expect(pc.getByRole("button", { name: "Replay speichern" })).toBeDisabled(); // replay buffer not running yet
  await pc.getByRole("button", { name: "Replay-Puffer starten" }).click();
  await expect(pc.getByRole("button", { name: "Replay speichern" })).toBeEnabled();
  await pc.getByRole("button", { name: "Replay speichern" }).click();
  await expect.poll(async () => (await obsState()).savedReplays).toBe(1);
  await pc.getByRole("button", { name: "Aufnahme stoppen" }).click();
  await expect.poll(async () => (await obsState()).recording).toBe(false);

  // Shortcuts are freely editable and become normal hotkeys.
  await pc.getByRole("textbox", { name: "Aufnahme starten/stoppen", exact: true }).fill("Ctrl+Alt+5");
  await pc.getByRole("button", { name: "Vorschläge einsetzen" }).click();
  await expect(pc.getByRole("textbox", { name: "Aufnahme starten/stoppen", exact: true })).toHaveValue("Ctrl+Alt+5"); // own choice is kept
  await expect(pc.getByRole("textbox", { name: "Overlay öffnen/schließen (groß, wie die Xbox Game Bar)", exact: true })).toHaveValue("Ctrl+Shift+G");
  await pc.getByRole("button", { name: "Tastenkürzel speichern" }).click();
  await expect(pc.getByText("Tastenkürzel gespeichert")).toBeVisible();
  await pc.goto(`${COMPANION}/#/hotkeys`);
  await expect(pc.locator(".list-item", { hasText: "Ctrl + Alt + 5" })).toContainText("Aufnahme starten/stoppen");
  await expect(pc.locator(".list-item", { hasText: "Ctrl + Shift + G" })).toContainText("Overlay ein/aus: Groß (wie Game Bar)");

  // The Game-Overlay plugin: installed, activated, its widget controls OBS – on the dashboard and on the overlay page.
  await pc.goto(`${COMPANION}/#/plugins?tab=dev`);
  await pc.locator('input[type="file"]').setInputFiles(join(state().workDir, "de.pgl.game-overlay-1.2.0.pglplugin"));
  await expect(pc.getByText("Prüfung bestanden: Game-Overlay 1.2.0")).toBeVisible();
  await pc.getByRole("button", { name: "Installieren (deaktiviert)" }).click();
  await pc.goto(`${COMPANION}/#/plugins`);
  await pc.locator(".card", { hasText: "Game-Overlay" }).getByRole("button", { name: "Details" }).click();
  await pc.getByRole("button", { name: "Aktivieren" }).click();
  await expect(pc.getByText(/Aufnahme und Replays in OBS steuern/).first()).toBeVisible();
  await pc.getByRole("button", { name: "Erlauben und aktivieren" }).click();
  await expect(pc.getByText("Plugin aktiviert")).toBeVisible();
  await pc.keyboard.press("Escape");
  await pc.goto(`${COMPANION}/#/overlay`);
  const w = pc.frameLocator('iframe[title="Game-Overlay: Game-Overlay"]');
  await expect(w.locator("#state")).toHaveText(/Bereit/, { timeout: 15000 });
  await expect(w.locator("#cpu")).toHaveText(/\d+ %/, { timeout: 15000 }); // live values from the PC
  // Widget and page use the same color scheme – otherwise the browser paints the widget white (unreadable light text).
  const outerScheme = await pc.locator('iframe[title="Game-Overlay: Game-Overlay"]').evaluate((e) => getComputedStyle(e).colorScheme);
  expect(await w.locator("html").evaluate((e) => getComputedStyle(e).colorScheme)).toBe(outerScheme);
  await w.getByRole("button", { name: "● Aufnahme starten" }).click();
  await expect.poll(async () => (await obsState()).recording).toBe(true);
  await expect(w.locator("#state")).toHaveText(/Aufnahme läuft/);
  await w.getByRole("button", { name: "■ Aufnahme stoppen" }).click();
  await expect.poll(async () => (await obsState()).recording).toBe(false);
  await w.getByRole("button", { name: "⟲ Replay speichern" }).click();
  await expect.poll(async () => (await obsState()).savedReplays).toBe(2);

  // Mixed: OBS keeps recording, replays become Discord clips.
  await pc.goto(`${COMPANION}/#/overlay-settings`);
  await pc.getByText("Pro Funktion ein anderes Programm").click();
  await pc.getByLabel("Programm für Replay speichern").selectOption("discord");
  await pc.getByRole("textbox", { name: "Replay speichern – Discord" }).fill("Ctrl+Shift+C");
  await pc.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await expect(pc.getByText("Gespeichert").first()).toBeVisible();
  await pc.goto(`${COMPANION}/#/overlay`);
  await expect(w.locator("#state")).toHaveText(/Aufnahme: OBS · Replay: Discord/, { timeout: 15000 });
  await w.getByRole("button", { name: "● Aufnahme starten" }).click();
  await expect.poll(async () => (await obsState()).recording).toBe(true); // still OBS
  await w.getByRole("button", { name: "■ Aufnahme stoppen" }).click();
  await expect.poll(async () => (await obsState()).recording).toBe(false);
  const saves = (await obsState()).savedReplays;
  await w.getByRole("button", { name: "⟲ Replay speichern" }).click();
  await expect(w.locator("#msg")).toHaveText(/nur im Windows-Begleiter/); // Discord would get the key – not OBS
  expect((await obsState()).savedReplays).toBe(saves);
  await pc.goto(`${COMPANION}/#/overlay-settings`);
  await pc.getByLabel("Programm für Replay speichern").selectOption("");
  await pc.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await expect(pc.getByText("Gespeichert").first()).toBeVisible();

  // Another recording program: NVIDIA. Its factory shortcuts are filled in; the launcher would press them.
  await pc.goto(`${COMPANION}/#/overlay-settings`);
  await pc.getByRole("button", { name: "NVIDIA App / GeForce Experience" }).click();
  const nvRecord = pc.getByRole("textbox", { name: "Aufnahme starten/stoppen – NVIDIA App / GeForce Experience" });
  await expect(nvRecord).toHaveValue("Alt+F9");
  await expect(pc.getByRole("textbox", { name: "Replay speichern – NVIDIA App / GeForce Experience" })).toHaveValue("Alt+F10");
  // Same key as the launcher's own record hotkey: warned, and refused when used (it would never reach NVIDIA).
  await nvRecord.fill("Ctrl+Alt+5");
  await pc.locator("select").filter({ hasText: "Eigenes Overlay des Launchers" }).selectOption("nvidia");
  await pc.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await expect(pc.getByText("Gleiche Taste wie in NVIDIA App / GeForce Experience").first()).toBeVisible();
  await pc.getByRole("button", { name: "Jetzt: Aufnahme starten/stoppen" }).click();
  await expect(pc.getByText(/Ctrl\+Alt\+5 ist auch ein Hotkey des Launchers/)).toBeVisible();
  await nvRecord.fill("Alt+F9");
  await pc.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await expect(pc.getByText("Gespeichert").first()).toBeVisible();
  // This PC has no Windows companion: said so instead of pretending the key was pressed. OBS gets nothing.
  const toggles = async () => (await obsState()).requests.filter((r) => r === "ToggleRecord").length;
  const before = await toggles();
  await pc.getByRole("button", { name: "Jetzt: Aufnahme starten/stoppen" }).click();
  await expect(pc.getByText("Tastenkürzel an andere Programme senden geht nur im Windows-Begleiter.").first()).toBeVisible();
  await pc.goto(`${COMPANION}/#/overlay`);
  await expect(w.locator("#title")).toHaveText("Aufnahme (NVIDIA)", { timeout: 15000 });
  await expect(w.getByRole("button", { name: "⟲ Replay speichern" })).toBeEnabled();
  expect(await toggles()).toBe(before);
  // Back to OBS for the following tests.
  await pc.goto(`${COMPANION}/#/overlay-settings`);
  await pc.getByRole("button", { name: "OBS Studio" }).click();
  await pc.locator("select").filter({ hasText: "Eigenes Overlay des Launchers" }).selectOption("own");
  await pc.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await expect(pc.getByText("Verbunden · obs-websocket 5.5.4")).toBeVisible();
  await pc.goto(`${COMPANION}/#/`);
});

test("Overlay wie die Game Bar: Widgets hinzufügen, entfernen, verschieben – bleibt gespeichert", async () => {
  await pc.goto(`${COMPANION}/#/overlay`);
  const panel = (title: string) => pc.locator(".gb-panel", { has: pc.locator(".gb-panel-title", { hasText: title }) });
  await expect(panel("PC-Auslastung")).toBeVisible();
  await expect(panel("Quick Actions")).toBeVisible();
  await expect(panel("Game-Overlay")).toBeVisible(); // plugin widget made for the overlay is there by default
  // Widget menu: remove one, add one of the website's functions.
  await pc.getByRole("button", { name: "Widgets" }).click();
  await pc.getByRole("checkbox", { name: "Quick Actions" }).uncheck();
  await pc.getByRole("checkbox", { name: "Benachrichtigungen" }).check();
  await pc.getByRole("button", { name: "Widgets" }).click();
  await expect(panel("Quick Actions")).toHaveCount(0);
  await expect(panel("Benachrichtigungen")).toBeVisible();
  // Drag at the title anywhere on the screen, resize at the corner.
  const head = await panel("PC-Auslastung").locator(".gb-panel-head").boundingBox();
  await pc.mouse.move(head!.x + 60, head!.y + 15); await pc.mouse.down(); await pc.mouse.move(760, 420, { steps: 10 }); await pc.mouse.up();
  const grip = await panel("Benachrichtigungen").locator(".gb-resize").boundingBox();
  await pc.mouse.move(grip!.x + 8, grip!.y + 8); await pc.mouse.down(); await pc.mouse.move(grip!.x + 108, grip!.y + 58, { steps: 6 }); await pc.mouse.up();
  const width = (await panel("Benachrichtigungen").boundingBox())!.width;
  // Hide with ✕, show again via the bar.
  await panel("Aufnahme").getByRole("button", { name: "Aufnahme ausblenden" }).click();
  await expect(panel("Aufnahme")).toHaveCount(0);
  await pc.getByRole("toolbar").getByRole("button", { name: "Aufnahme", exact: true }).click();
  await expect(panel("Aufnahme")).toBeVisible();
  await pc.waitForTimeout(1200); // saved shortly after the last change
  await pc.reload();
  await expect(panel("Benachrichtigungen")).toBeVisible();
  await expect(panel("Quick Actions")).toHaveCount(0);
  const moved = (await panel("PC-Auslastung").boundingBox())!;
  expect(moved.x).toBeGreaterThan(600);
  expect(moved.y).toBeGreaterThan(350);
  expect(Math.abs((await panel("Benachrichtigungen").boundingBox())!.width - width)).toBeLessThan(3);
  await expect(pc.locator(".gb-error")).toHaveCount(0);
  await pc.goto(`${COMPANION}/#/`);
});

test("Monitor: Netzwerk, Speicherplatz und Energie zeigen echte Zustände", async () => {
  await pc.goto(`${COMPANION}/#/monitor`);
  // Network: live pings run; every target shows a value or honestly "keine Antwort" (ICMP may be blocked).
  await expect(pc.getByText("Internet (Cloudflare)")).toBeVisible({ timeout: 10000 });
  await expect(pc.locator(".card", { hasText: "Netzwerk" }).getByText(/Verlust \d/).first()).toBeVisible({ timeout: 10000 });
  await expect(pc.locator(".card", { hasText: "Speicherplatz" }).getByText(/frei von/).first()).toBeVisible();
  // The headless companion has no power control – said so instead of offering buttons.
  await expect(pc.getByText("Energie-Aktionen sind nur im Windows-Begleiter verfügbar.")).toBeVisible();
  // Leaving the page stops the pings (subscription removed).
  await pc.goto(`${COMPANION}/#/`);
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

  // Quick action without PC that plays the sound which itself still waits on the tablet.
  await tablet.goto(`${HOSTED_SITE}/#/quick`);
  await tablet.getByRole("button", { name: "Neue Aktion" }).click();
  await tablet.getByLabel("Name").fill("Offline-Aktion");
  if (await tablet.getByRole("combobox", { name: "Aktion" }).count() === 0) await tablet.getByRole("button", { name: "Schritt hinzufügen" }).click();
  await tablet.getByRole("combobox", { name: "Aktion" }).first().selectOption("playSound");
  const target = tablet.getByRole("combobox", { name: "Ziel" }).first();
  const waitingSound = await target.locator("option", { hasText: /e2e-offline-sound.*wartet auf PC/ }).getAttribute("value");
  expect(waitingSound).toMatch(/^pending:/);
  await target.selectOption(waitingSound!);
  await tablet.getByRole("button", { name: "Speichern" }).click();
  await expect(tablet.getByText("Offline-Aktion")).toBeVisible();

  // Hotkey without PC: mouse side button (gaming mouse) → stop all sounds. Kept on the tablet, sent after pairing.
  await tablet.goto(`${HOSTED_SITE}/#/hotkeys`);
  await tablet.getByRole("button", { name: "Neuer Hotkey" }).click();
  await tablet.getByText("Vorschläge für 60-%-Tastatur und Gaming-Maus").click();
  await tablet.getByRole("button", { name: "Maus-Seitentaste hinten (4)", exact: true }).click();
  await tablet.getByRole("combobox", { name: "Aktion" }).selectOption("stopAllSounds");
  await tablet.getByRole("button", { name: "Speichern" }).click();
  await expect(tablet.getByText("Maus-Seitentaste hinten (4)").first()).toBeVisible();
  await expect(tablet.getByText("Wartet auf PC").first()).toBeVisible();
  // Plugin file without PC: checked on the tablet, kept until the PC is connected.
  await tablet.goto(`${HOSTED_SITE}/#/plugins?tab=dev`);
  await tablet.locator('input[type="file"]').setInputFiles(join(state().workDir, "de.pgl.cpu-mini-1.0.0.pglplugin"));
  await expect(tablet.getByText(/„CPU & RAM Mini“ vorgemerkt/)).toBeVisible();
  await expect(tablet.getByText("3 Änderungen warten auf den PC")).toBeVisible();
  await tablet.reload();
  await expect(tablet.getByText("3 Änderungen warten auf den PC")).toBeVisible(); // survives closing the page
  // Overlay shortcut and OBS option prepared on the tablet, before the PC was ever connected.
  await tablet.goto(`${HOSTED_SITE}/#/overlay-settings`);
  await expect(tablet.getByText(/PC nicht verbunden: Tastenkürzel, OBS-Verbindung/)).toBeVisible();
  await tablet.getByRole("textbox", { name: "Replay speichern (die letzten Sekunden)", exact: true }).fill("Ctrl+Alt+7");
  await tablet.getByRole("button", { name: "Tastenkürzel speichern" }).click();
  await expect(tablet.getByText("Tastenkürzel gespeichert")).toBeVisible();
  await tablet.getByRole("switch", { name: /Replay-Puffer automatisch/ }).check();
  await tablet.getByRole("button", { name: "Speichern", exact: true }).last().click(); // OBS card
  await expect(tablet.getByText("Gespeichert – wird beim Verbinden auf den PC übertragen")).toBeVisible();
  await tablet.getByRole("button", { name: "Xbox Game Bar" }).click();
  await expect(tablet.getByRole("textbox", { name: "Aufnahme starten/stoppen – Xbox Game Bar" })).toHaveValue("Alt+Win+R");
  await tablet.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await expect(tablet.getByText("6 Änderungen warten auf den PC")).toBeVisible();
  await tablet.reload();
  await expect(tablet.getByRole("button", { name: "Xbox Game Bar" })).toHaveAttribute("aria-pressed", "true");
  await expect(tablet.getByRole("textbox", { name: "Replay speichern (die letzten Sekunden)", exact: true })).toHaveValue("Ctrl+Alt+7");
  // Overlay widgets chosen on the tablet, too.
  await tablet.getByRole("button", { name: "+ Laufende Sounds" }).click();
  await expect(tablet.getByText("7 Änderungen warten auf den PC")).toBeVisible();
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
  await expect(tablet.getByText("E2E Testspiel").first()).toBeVisible({ timeout: 15000 });
  // After pairing the waiting sound was uploaded automatically and is now a real sound on the PC.
  await tablet.locator(".bottom-nav").getByRole("link", { name: "Sounds" }).click();
  await expect(tablet.getByRole("button", { name: /e2e-offline-sound abspielen/ })).toBeVisible({ timeout: 15000 });
  await expect(tablet.getByText(/Wartet auf PC/)).toHaveCount(0);
  // The offline hotkey reached the PC. The own plugin file needs admin rights (unverified code) – the tablet only has
  // the standard rights, so the PC refuses it and the reason stays visible instead of the change silently vanishing.
  await expect(tablet.getByText("1 Änderungen warten auf den PC")).toBeVisible({ timeout: 15000 });
  await tablet.getByRole("button", { name: "Anzeigen" }).click();
  await expect(tablet.getByText(/Diesem Gerät fehlt die Berechtigung „admin“/)).toBeVisible();
  await tablet.getByRole("button", { name: "Verwerfen" }).click();
  await expect(tablet.getByText("Alles übertragen.")).toBeVisible();
  await tablet.keyboard.press("Escape");
  await pc.goto(`${COMPANION}/#/hotkeys`);
  await expect(pc.getByText("Maus-Seitentaste hinten (4)")).toBeVisible();
  await expect(pc.locator(".list-item", { hasText: "Ctrl + Alt + 7" })).toContainText("Replay speichern");
  await pc.goto(`${COMPANION}/#/overlay`);
  await expect(pc.locator(".gb-panel-title", { hasText: "Laufende Sounds" })).toBeVisible(); // chosen on the tablet
  await pc.goto(`${COMPANION}/#/hotkeys`);
  await pc.goto(`${COMPANION}/#/overlay-settings`);
  await expect(pc.getByRole("button", { name: "Xbox Game Bar" })).toHaveAttribute("aria-pressed", "true"); // chosen on the tablet
  await pc.getByRole("button", { name: "OBS Studio" }).click();
  await pc.getByRole("button", { name: "Speichern", exact: true }).first().click();
  await expect(pc.getByRole("switch", { name: /Replay-Puffer automatisch/ })).toBeChecked();
  // The quick action now plays the uploaded sound (its waiting id was replaced by the PC's id).
  await pc.goto(`${COMPANION}/#/quick`);
  await expect(pc.locator(".card, .list-item", { hasText: "Offline-Aktion" }).first()).toContainText("e2e-offline-sound");
  await expect(pc.getByText("(fehlt)")).toHaveCount(0);
  await pc.goto(`${COMPANION}/#/plugins`);
  await expect(pc.locator(".card", { hasText: "CPU & RAM Mini" })).toHaveCount(0);

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
