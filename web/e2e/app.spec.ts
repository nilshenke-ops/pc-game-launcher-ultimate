import { expect, test, devices, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { COMPANION, HOSTED_SITE, OBS_PASSWORD, OBS_PORT, OBS_URL, RELAY, state } from "./env";
import { ACCESS_HASH } from "../src/lib/access";
import { NEW_WIDGET_PLUGINS } from "./plugins-list";

const ROOT_DIR = new URL("../..", import.meta.url).pathname;

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

test("Deck am Handy: aus eigenen Sachen erstellen, Taste startet das Spiel am PC, Ordner und Bearbeiten", async () => {
  const started = join(state().workDir, "game-started.txt");
  rmSync(started, { force: true });
  await phone.goto(`${COMPANION}/#/deck`);
  await phone.getByRole("button", { name: "Deck aus meinen Sachen erstellen" }).click();
  const key = phone.locator(".deck-key", { hasText: "E2E Testspiel" });
  await expect(key).toBeVisible();
  await key.click();
  await expect(phone.getByText("E2E Testspiel wird gestartet")).toBeVisible();
  await expect.poll(() => existsSync(started), { timeout: 10000 }).toBe(true);
  // Folder and back.
  await phone.locator(".deck-key", { hasText: "Profile" }).click();
  await expect(phone.locator(".deck-key", { hasText: "Allgemein" })).toBeVisible();
  await phone.locator(".deck-key", { hasText: "Zurück" }).click();
  await expect(key).toBeVisible();
  // Edit: a new key on an empty place, stored on the PC – the PC window shows the same deck.
  await phone.getByRole("button", { name: "Bearbeiten" }).click();
  await phone.locator(".deck-key.empty").first().click();
  await phone.getByRole("dialog").getByLabel("Aktion").selectOption("open");
  await phone.getByRole("dialog").getByLabel("Beschriftung").fill("Zu den Sounds");
  await phone.getByRole("dialog").getByLabel("Seite").selectOption("/soundboard");
  await phone.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await phone.getByRole("button", { name: "Bearbeiten beenden" }).click();
  await pc.goto(`${COMPANION}/#/deck`);
  await expect(pc.locator(".deck-key", { hasText: "Zu den Sounds" })).toBeVisible();
  await phone.locator(".deck-key", { hasText: "Zu den Sounds" }).click();
  await expect(phone).toHaveURL(/#\/soundboard/);
});

test("Backlog am Handy: Spiel aufnehmen, Status ändern, Zufallsauswahl, Export", async () => {
  await phone.goto(`${COMPANION}/#/backlog`);
  await expect(phone.getByText("Noch nichts im Backlog")).toBeVisible();
  await phone.getByRole("button", { name: "Spiele hinzufügen" }).first().click();
  await phone.getByRole("dialog").locator("label", { hasText: "E2E Testspiel" }).locator("input").check();
  await phone.getByRole("button", { name: "1 hinzufügen" }).click();
  await expect(phone.getByText("E2E Testspiel").first()).toBeVisible();
  await phone.getByRole("combobox", { name: "Status von E2E Testspiel" }).selectOption("next");
  await phone.getByRole("combobox", { name: "Priorität von E2E Testspiel" }).selectOption("3");
  // Saved on the PC: the PC window shows the same.
  await pc.goto(`${COMPANION}/#/backlog`);
  await expect(pc.getByRole("combobox", { name: "Status von E2E Testspiel" })).toHaveValue("next");
  await expect(pc.getByRole("combobox", { name: "Priorität von E2E Testspiel" })).toHaveValue("3");
  await phone.getByRole("button", { name: "Zufallsauswahl" }).click();
  await phone.getByRole("dialog").getByRole("button", { name: "Auswählen" }).click();
  await expect(phone.getByRole("dialog").getByText("E2E Testspiel")).toBeVisible();
  await phone.keyboard.press("Escape");
  const dl = phone.waitForEvent("download");
  await phone.getByRole("button", { name: "Export (JSON)" }).click();
  const file = JSON.parse(readFileSync((await (await dl).path())!, "utf8"));
  expect(file).toMatchObject({ format: "nexus-backlog", entries: [{ name: "E2E Testspiel", status: "next", priority: 3 }] });
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

test("Cartoon-Hintergrund am Handy: eigene Hochformat-Zeichnung, ohne PC wählbar", async ({ browser }) => {
  const code = process.env.PGL_ACCESS_CODE;
  test.skip(!code, "Zugangscode nicht gesetzt");
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "de-DE" });
  const p = await ctx.newPage();
  await p.goto(`${HOSTED_SITE}/`);
  await p.getByLabel("Zugangscode").fill(code!);
  await expect(p.getByText("Offline – kein PC verbunden").first()).toBeVisible();
  await p.goto(`${HOSTED_SITE}/#/settings?s=design`);
  await p.getByRole("radio", { name: "Cartoon Nacht" }).click();
  const bg = () => p.locator(".app-bg .img").evaluate((e) => getComputedStyle(e).backgroundImage);
  await expect.poll(bg).toContain("cartoon-night-phone.svg");
  // The drawing really loads.
  expect((await p.request.get(`${HOSTED_SITE}/backgrounds/cartoon-night-phone.svg`)).ok()).toBe(true);
  await p.reload();
  await expect.poll(bg).toContain("cartoon-night-phone.svg"); // kept on this device
  // Wide screen (tablet landscape / PC): the wide drawing.
  await p.setViewportSize({ width: 1200, height: 700 });
  await expect.poll(bg).toContain("cartoon-night.svg");
  await ctx.close();
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

test("Neue Plugins (2.11): jedes Widget installiert, aktiviert und zeigt echte Daten vom PC", async () => {
  test.setTimeout(600000); // 14 installs through the real UI (check, install, allow, place on the dashboard)
  const work = state().workDir;
  const meta: Record<string, [string, string]> = {};
  for (const folder of NEW_WIDGET_PLUGINS) {
    const m = JSON.parse(readFileSync(join(ROOT_DIR, "plugins/examples", folder, "plugin.json"), "utf8"));
    meta[folder] = [m.name, m.contributes.widgets[0].title];
    await pc.goto(`${COMPANION}/#/plugins?tab=dev`);
    await pc.locator('input[type="file"]').setInputFiles(join(work, `${m.id}-${m.version}.pglplugin`));
    await expect(pc.getByText(`Prüfung bestanden: ${m.name} ${m.version}`)).toBeVisible();
    await pc.getByRole("button", { name: "Installieren (deaktiviert)" }).click();
    await expect(pc.getByText("Installiert (deaktiviert) – jetzt testen und aktivieren")).toBeVisible();
    await pc.goto(`${COMPANION}/#/plugins`);
    await pc.locator(".card", { hasText: m.name }).getByRole("button", { name: "Details" }).click();
    await pc.getByRole("button", { name: "Aktivieren" }).click();
    const allow = pc.getByRole("button", { name: "Erlauben und aktivieren" });
    if (m.permissions.length) await allow.click(); else if (await allow.count()) await allow.click();
    await expect(pc.getByText("Plugin aktiviert")).toBeVisible();
    await pc.getByRole("button", { name: /aufs Dashboard/ }).first().click();
    await pc.keyboard.press("Escape");
  }
  await pc.goto(`${COMPANION}/#/`);
  const f = (folder: string) => { const [name, title] = meta[folder]; return pc.frameLocator(`iframe[title="${name}: ${title}"]`); };
  const show = async (folder: string) => { const [name, title] = meta[folder]; await pc.locator(`iframe[title="${name}: ${title}"]`).scrollIntoViewIfNeeded({ timeout: 20000 }); };
  const T = { timeout: 20000 };
  await show("wochen-statistik"); await expect(f("wochen-statistik").locator("#total")).toHaveText(/^\d+ (min|h)/, T);
  await expect(f("wochen-statistik").locator("#bars > div")).toHaveCount(7);
  await show("zufallsspiel"); await f("zufallsspiel").getByRole("button", { name: "Würfeln" }).click();
  await expect(f("zufallsspiel").locator("#start")).toBeEnabled(T); // the E2E library has games
  rmSync(join(work, "game-started.txt"), { force: true });
  await f("zufallsspiel").getByRole("button", { name: "Starten" }).click();
  await expect(f("zufallsspiel").locator("#err")).toHaveText("");
  await show("weiterspielen"); await expect(f("weiterspielen").locator("#list li, #info:not(:empty)").first()).toBeVisible(T);
  await show("tageslimit"); await expect(f("tageslimit").locator("#sub")).toHaveText(/^heute .* von 2 h 0 min$/, T);
  await show("spiel-serie"); await expect(f("spiel-serie").locator("#best")).toHaveText(/^\d+ Tage$/, T);
  await show("meilensteine"); await expect(f("meilensteine").locator("#list > div, #info:not(:empty)").first()).toBeVisible(T);
  await show("gpu-ampel"); await expect(f("gpu-ampel").locator("#name")).not.toHaveText("", T); // headless Linux: "Keine Grafikkarte erkannt" – honest
  await show("ram-waechter"); await expect(f("ram-waechter").locator("#pct")).toHaveText(/^\d+ %$/, T);
  await show("zufallssound"); await f("zufallssound").getByRole("button", { name: /Zufallssound/ }).click();
  await expect(f("zufallssound").locator("#err")).toHaveText(/Noch keine Sounds im Soundboard\./, T); // headless PC has no sounds – said, not faked
  await show("pomodoro"); await f("pomodoro").getByRole("button", { name: "Start" }).click();
  await expect(f("pomodoro").locator("#time")).not.toHaveText("25:00", { timeout: 4000 });
  await f("pomodoro").getByRole("button", { name: "Pause" }).click();
  await show("weltzeit"); await expect(f("weltzeit").locator("#zones li")).toHaveCount(3, T);
  await expect(f("weltzeit").locator("#zones li").first()).toContainText(/London\s*\S+ \d{2}:\d{2}/);
  await show("bibliothek-zahlen"); await expect(f("bibliothek-zahlen").locator("#games")).toHaveText(/^\d+$/, T);
  await show("speicherplatz"); await expect(f("speicherplatz").locator("#list")).toContainText(/frei|Keine Laufwerke/, T);
  await show("sitzungs-leistung"); await expect(f("sitzungs-leistung").locator("#list li, #info:not(:empty)").first()).toBeVisible(T);
  for (const folder of NEW_WIDGET_PLUGINS) await expect(f(folder).locator("body")).not.toContainText("Berechtigung fehlt");
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
  await pc.locator('input[type="file"]').setInputFiles(join(state().workDir, "de.pgl.game-overlay-1.2.1.pglplugin"));
  await expect(pc.getByText("Prüfung bestanden: Game-Overlay 1.2.1")).toBeVisible();
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

test("Widget-Baukasten: eigenes Widget bauen, frei verschieben, auf Dashboard, Overlay und als Desktop-Fenster", async () => {
  await pc.goto(`${COMPANION}/#/widgets`);
  await pc.getByRole("button", { name: "Neues Widget" }).first().click();
  await pc.locator(".ws-template", { hasText: "Uhr & Spielzeit" }).click();
  await pc.getByRole("textbox", { name: "Name des Widgets" }).fill("E2E Uhr");
  // Drag the play time element down/left; the position is kept in percent.
  const handle = pc.locator(".ws-canvas .ws-handle").nth(2);
  await handle.click();
  const before = Number(await pc.getByRole("spinbutton", { name: "Y %" }).inputValue());
  const box = (await handle.boundingBox())!;
  await pc.mouse.move(box.x + 10, box.y + 10); await pc.mouse.down(); await pc.mouse.move(box.x - 30, box.y - 40, { steps: 6 }); await pc.mouse.up();
  expect(Number(await pc.getByRole("spinbutton", { name: "Y %" }).inputValue())).toBeLessThan(before);
  // A text element with own text; arrow keys move it.
  await pc.locator(".ws-palette").getByRole("button", { name: "Text" }).click();
  await pc.getByRole("textbox", { name: "Text", exact: true }).fill("GG EZ");
  await pc.locator(".ws-handle.sel").press("ArrowRight");
  await pc.getByRole("button", { name: "Speichern" }).click();
  await expect(pc.getByText("Widget gespeichert")).toBeVisible();
  await pc.getByRole("button", { name: "← Widget-Einstellungen" }).click();
  await pc.getByRole("switch", { name: /Auf dem Dashboard/ }).check();
  await pc.getByRole("switch", { name: /Im Overlay/ }).click();
  await expect(pc.getByRole("switch", { name: /Im Overlay/ })).toBeChecked();
  // Not a Windows companion here: the desktop switch says so instead of pretending.
  await expect(pc.getByRole("switch", { name: /Auf dem Windows-Desktop/ })).toBeDisabled();
  await expect(pc.getByText("Dieser PC kann keine Desktop-Widgets anzeigen (nur der Windows-Begleiter).")).toBeVisible();
  await expect(pc.getByText(/Startmenü, Sperrbildschirm und die Windows-Widget-Leiste/)).toBeVisible();

  await pc.goto(`${COMPANION}/#/`);
  const onDash = pc.locator(".dash .cw", { hasText: "GG EZ" });
  await expect(onDash).toBeVisible();
  const id = await onDash.getAttribute("data-id");
  await pc.goto(`${COMPANION}/#/overlay`);
  await expect(pc.locator(".gb-panel", { hasText: "E2E Uhr" }).locator(".cw", { hasText: "GG EZ" })).toBeVisible();
  // The page the Windows desktop window shows: only the widget, no navigation.
  await pc.goto(`${COMPANION}/#/desktop-widget/${id}`);
  await expect(pc.locator(".dw-root .cw", { hasText: "GG EZ" })).toBeVisible();
  await expect(pc.locator(".sidebar")).toHaveCount(0);
  await pc.goto(`${COMPANION}/#/`);
});

test("Dialoge: Tastatur bleibt im Dialog, Fokus springt beim Tippen nicht zurück", async () => {
  await pc.goto(`${COMPANION}/#/quick`);
  await pc.getByRole("button", { name: "Neue Aktion" }).click();
  const dialog = pc.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 25; i++) await pc.keyboard.press("Tab");
  expect(await pc.evaluate(() => !!document.activeElement?.closest(".modal"))).toBe(true);
  for (let i = 0; i < 25; i++) await pc.keyboard.press("Shift+Tab");
  expect(await pc.evaluate(() => !!document.activeElement?.closest(".modal"))).toBe(true);
  // Typing in a later field while the app re-renders (live updates) must not jump back to the first field.
  const fields = dialog.locator("input.input");
  await fields.nth(1).click();
  await pc.evaluate(() => window.dispatchEvent(new Event("online"))); // triggers a reconnect check / re-render
  await pc.keyboard.type("abc");
  await pc.waitForTimeout(1000);
  expect(await pc.evaluate(() => document.activeElement === document.querySelectorAll(".modal input.input")[1])).toBe(true);
  await pc.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Netzwerkdiagnose mit eigenem Ziel und anpassbare Navigation", async () => {
  await pc.goto(`${COMPANION}/#/network`);
  await expect(pc.getByRole("heading", { name: "Netzwerkdiagnose" })).toBeVisible();
  await expect(pc.locator(".nd-tile-label", { hasText: "Paketverlust" })).toBeVisible();
  // Invalid address is refused with a reason; a host name is accepted and measured with the others.
  await pc.getByRole("textbox", { name: "Name", exact: true }).fill("Testserver");
  await pc.getByRole("textbox", { name: "Hostname oder IP-Adresse" }).fill("http://example.com/x");
  await pc.getByRole("button", { name: "Ziel hinzufügen" }).click();
  await expect(pc.getByText(/ist kein Hostname und keine IP-Adresse/)).toBeVisible();
  await pc.getByRole("textbox", { name: "Hostname oder IP-Adresse" }).fill("127.0.0.1");
  await pc.getByRole("button", { name: "Ziel hinzufügen" }).click();
  await expect(pc.getByRole("radio", { name: "Testserver" })).toBeVisible({ timeout: 10000 });
  await expect(pc.locator("table tr", { hasText: "Testserver" })).toBeVisible();
  await pc.getByRole("button", { name: "Testserver entfernen" }).click();
  await expect(pc.getByRole("button", { name: "Testserver entfernen" })).toHaveCount(0);

  // Navigation: categories like in the plan, hide a section, it is gone from the sidebar but still found by search.
  const sidebar = pc.locator(".sidebar");
  for (const g of ["Dashboard", "Steuerung", "Audio", "System", "Verbindung", "Erweiterungen", "Verwaltung"]) await expect(sidebar.getByRole("navigation", { name: g })).toBeVisible();
  await pc.goto(`${COMPANION}/#/settings?s=design`);
  await pc.getByRole("button", { name: "Programme ausblenden" }).click();
  await expect(sidebar.getByRole("link", { name: "Programme" })).toHaveCount(0);
  await expect(pc.getByRole("button", { name: "Einstellungen ausblenden" })).toBeDisabled();
  await pc.getByRole("button", { name: "Programme einblenden" }).click();
  await expect(sidebar.getByRole("link", { name: "Programme" })).toBeVisible();
  await pc.goto(`${COMPANION}/#/`);
});

test("GameQuest: Ziel anlegen, Match eintragen, Werte sind als automatisch/selbst eingetragen gekennzeichnet", async () => {
  await pc.goto(`${COMPANION}/#/quests`);
  await expect(pc.getByRole("heading", { name: "GameQuest" })).toBeVisible();
  await expect(pc.getByText("Level 1", { exact: true })).toBeVisible();
  await pc.getByRole("button", { name: "Neues Ziel" }).first().click();
  const dlg = pc.getByRole("dialog", { name: "Neues Ziel" });
  await dlg.getByRole("textbox", { name: "Name" }).fill("3 Siege am Tag");
  await dlg.getByRole("radio", { name: "Siege" }).click();
  await dlg.getByRole("radio", { name: "täglich" }).click();
  await dlg.getByRole("button", { name: "Speichern" }).click();
  const goal = pc.locator(".q-goal", { hasText: "3 Siege am Tag" });
  await expect(goal).toBeVisible();
  await expect(goal.getByText("selbst eingetragen")).toBeVisible();
  await expect(goal.getByText(/0 \/ 3 Siege/)).toBeVisible();

  const form = pc.locator(".card", { hasText: "Match eintragen" }).first();
  await form.getByRole("textbox", { name: "Name des Spiels" }).fill("Schach");
  await form.getByRole("textbox", { name: "Spielstand (optional)" }).fill("1:0");
  await form.getByRole("button", { name: "Match eintragen" }).click();
  await expect(goal.getByText(/1 \/ 3 Siege/)).toBeVisible();
  await expect(pc.locator("table tr", { hasText: "Schach" })).toContainText("100 %");
  await pc.getByRole("button", { name: "Match löschen" }).first().click();
  await expect(goal.getByText(/0 \/ 3 Siege/)).toBeVisible();
  await expect(pc.locator(".q-ach", { hasText: "Sieger" }).getByText("selbst eingetragen")).toBeVisible();
  await expect(pc.locator(".q-ach", { hasText: "Erste Runde" }).getByText("automatisch erkannt")).toBeVisible();
});

test("Deal Radar: ohne Einschalten keine Anfrage, Eintrag von Hand, Zielpreis wird geprüft", async () => {
  await pc.goto(`${COMPANION}/#/deals`);
  await expect(pc.getByRole("heading", { name: "Deal Radar" })).toBeVisible();
  await expect(pc.getByText("Die Preisabfrage ist aus – deshalb gibt es noch keine Preise.")).toBeVisible();
  await pc.locator(".deal-settings summary", { hasText: "Einstellungen" }).click();
  await expect(pc.getByRole("switch", { name: /Preise im Steam-Shop abfragen/ })).not.toBeChecked();
  await expect(pc.getByRole("button", { name: "Jetzt prüfen" })).toBeDisabled();
  await pc.getByText("Nicht gefunden? Genauer suchen").click();
  await expect(pc.getByRole("button", { name: "Suchen", exact: true })).toBeDisabled();
  await pc.getByRole("button", { name: "Von Hand eintragen" }).click();
  const dlg = pc.getByRole("dialog", { name: "Spiel von Hand eintragen" });
  await dlg.getByRole("textbox", { name: "Spiel", exact: true }).fill("Hades II");
  await dlg.getByRole("textbox", { name: /Steam-App-ID/ }).fill("abc");
  await expect(dlg.getByText("Nur Ziffern")).toBeVisible();
  await dlg.getByRole("textbox", { name: /Steam-App-ID/ }).fill("1145350");
  await dlg.getByRole("textbox", { name: "Zielpreis" }).fill("19,99");
  await dlg.getByRole("button", { name: "Speichern" }).click();
  const tile = pc.getByRole("button", { name: "Hades II – Details und Preisverlauf" });
  await expect(tile).toBeVisible();
  await expect(tile.locator(".deal-row b")).toHaveText(["–", "–"]); // no price without a check – nothing invented
  await tile.click();
  const detail = pc.getByRole("dialog", { name: "Hades II" });
  await expect(detail.getByText(/Zielpreis 19,99/)).toBeVisible();
  await expect(detail.getByText("Preisabfrage ist aus.")).toBeVisible();
  await detail.getByRole("button", { name: "Bearbeiten" }).click();
  await pc.getByRole("dialog", { name: "Eintrag bearbeiten" }).getByRole("button", { name: "Entfernen" }).click();
  await pc.getByRole("dialog", { name: "Von der Wunschliste entfernen?" }).getByRole("button", { name: "Entfernen" }).click();
  await expect(tile).toHaveCount(0);
  await expect(pc.getByRole("dialog")).toHaveCount(0);
});

test("Tastenbelegung: Profil für ein Spiel, Taste auf der Tastatur antippen, Kombination, gespeichert auf dem PC", async () => {
  await pc.goto(`${COMPANION}/#/input`);
  await expect(pc.getByRole("heading", { name: "Tastatur & Maus belegen" })).toBeVisible();
  await pc.getByRole("button", { name: "Neues Profil" }).click();
  const dlg = pc.getByRole("dialog", { name: "Neues Profil" });
  await dlg.getByRole("textbox", { name: "Name", exact: true }).fill("Shooter");
  await dlg.getByRole("textbox", { name: "Programmname" }).fill("cs2.exe");
  await dlg.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await expect(dlg.getByText("cs2", { exact: true })).toBeVisible();
  await dlg.getByRole("button", { name: "Caps Lock", exact: true }).click();
  await dlg.getByRole("combobox", { name: "Neue Taste" }).selectOption("LCtrl");
  await dlg.getByRole("button", { name: "Seitentaste hinten (4)" }).click();
  await dlg.getByRole("combobox", { name: "Neue Taste" }).selectOption("M");
  await dlg.getByRole("button", { name: "Strg", exact: true }).click();
  await expect(dlg.getByText("Ergebnis: Strg + M")).toBeVisible();
  await dlg.getByRole("button", { name: "Speichern" }).click();
  await expect(pc.getByText("Nur in: cs2 · 2 Belegungen")).toBeVisible();
  await expect(pc.getByText(/Caps Lock → Strg links · Seitentaste hinten \(4\) → Strg \+ M/)).toBeVisible();
  await pc.getByRole("button", { name: "Löschen" }).click();
  await pc.getByRole("dialog", { name: "Profil löschen?" }).getByRole("button", { name: "Löschen" }).click();
  await expect(pc.getByText("Noch keine Belegung")).toBeVisible();
});

test("KI-Assistent: lokal, ohne Internet – beantwortet App-Fragen, schlägt Aktionen als Knopf vor, Suche leitet weiter", async () => {
  await pc.goto(`${COMPANION}/#/assistant`);
  await expect(pc.getByRole("heading", { name: "KI-Assistent" })).toBeVisible();
  const input = pc.getByRole("textbox", { name: "Nachricht an den Assistenten" });
  await input.fill("Wie richte ich Discord mit dem Soundboard ein?");
  await input.press("Enter");
  const last = pc.locator(".as-turn.bot").last();
  await expect(last).toContainText("CABLE Input");
  await expect(last).toContainText("Quelle: Wissen: Discord einrichten");
  await input.fill("Öffne Deal Radar");
  await input.press("Enter");
  await pc.locator(".as-turn.bot").last().getByRole("button", { name: "Deal Radar öffnen" }).click();
  await expect(pc.getByRole("heading", { name: "Deal Radar" })).toBeVisible();
  // The conversation is still there after coming back.
  await pc.goto(`${COMPANION}/#/assistant`);
  await expect(pc.locator(".as-turn.me")).toHaveCount(2);
  // A command becomes a button – nothing runs before tapping.
  await input.fill("Stopp alle Sounds");
  await input.press("Enter");
  const stop = pc.locator(".as-turn.bot").last().getByRole("button", { name: "Alle Sounds stoppen" });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(pc.getByText("Alle Sounds gestoppt")).toBeVisible();
  // From the search: anything typed can be asked.
  await pc.keyboard.press("Control+k");
  await pc.getByPlaceholder("Spiele, Sounds, Einstellungen, Befehle …").fill("Wie geht es meinem PC");
  await pc.getByText("Assistent fragen: „Wie geht es meinem PC“").click();
  await expect(pc.locator(".as-turn.bot").last()).toContainText("CPU");
  // Set-up on the PC: key field only here; local mode is the default.
  await pc.getByRole("button", { name: "Einrichten", exact: true }).click();
  const dlg = pc.getByRole("dialog", { name: "Assistent einrichten" });
  await expect(dlg.getByRole("radio", { name: "Lokal (0 €)" })).toHaveAttribute("aria-checked", "true");
  await dlg.getByRole("radio", { name: "Lokale KI (0 €)" }).click();
  await expect(dlg.getByText("Lokale KI (Ollama) – kostenlos")).toBeVisible();
  await dlg.getByRole("radio", { name: "Lokal (0 €)" }).click();
  await dlg.getByRole("radio", { name: "Claude (kostenpflichtig)" }).click();
  await expect(dlg.getByText("Claude kostet pro Anfrage Geld")).toBeVisible();
  await expect(dlg.getByLabel("Anthropic-API-Schlüssel")).toBeVisible();
  // Without a key the mode stays free.
  await dlg.getByRole("button", { name: "Fertig" }).click();
  await expect(pc.locator(".page-head .badge")).toHaveText("Lokal · 0 €");
  await pc.getByRole("button", { name: "Einrichten", exact: true }).click();
  await dlg.getByRole("button", { name: "Fertig" }).click();
  await pc.getByRole("button", { name: "Neues Gespräch" }).click();
  await expect(pc.locator(".as-turn")).toHaveCount(0);
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

test("Remote Desktop: erst am PC erlauben und Recht geben, dann kommt das Tippen am richtigen Punkt an, am PC beenden", async () => {
  await phone.goto(`${COMPANION}/#/remote`);
  await expect(phone.getByText("Am PC ausgeschaltet")).toBeVisible();
  await expect(phone.getByRole("button", { name: "Verbinden", exact: true })).toBeDisabled();
  await pc.goto(`${COMPANION}/#/remote`);
  await pc.getByRole("switch", { name: /Remote Desktop erlauben/ }).click();
  await expect(phone.getByText("Diesem Gerät fehlt das Recht")).toBeVisible({ timeout: 10000 });
  // The right is given only at the PC.
  await pc.goto(`${COMPANION}/#/devices`);
  await pc.locator(".list-item", { hasText: "iPhone · Safari" }).getByRole("button", { name: "Bearbeiten" }).click();
  await pc.getByRole("dialog").getByRole("checkbox", { name: /^Fernsteuern/ }).check();
  await pc.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(phone.getByText("ansehen und steuern")).toBeVisible({ timeout: 10000 });
  await expect(phone.getByText("Testbild (Entwicklung)")).toBeVisible(); // never presented as a real screen
  await phone.getByRole("button", { name: "Verbinden", exact: true }).click();
  await phone.waitForFunction(() => { const c = document.querySelector<HTMLCanvasElement>(".rd-canvas"); return !!c && c.width > 0 && !document.querySelector(".rd-overlay"); }, null, { timeout: 10000 });
  // Tap at 40 % / 30 % of the picture → the PC draws its click mark exactly there.
  const box = (await phone.locator(".rd-canvas").boundingBox())!;
  const [cw, ch] = await phone.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>(".rd-canvas")!; return [c.width, c.height]; });
  const sc = Math.min(box.width / cw, box.height / ch);
  await phone.touchscreen.tap(box.x + (box.width - cw * sc) / 2 + 0.4 * cw * sc, box.y + (box.height - ch * sc) / 2 + 0.3 * ch * sc);
  await expect.poll(() => phone.evaluate(() => { const c = document.querySelector<HTMLCanvasElement>(".rd-canvas")!; const d = c.getContext("2d")!.getImageData(Math.round(0.4 * c.width) + 8, Math.round(0.3 * c.height), 1, 1).data; return d[0] > 200 && d[2] < 60; }), { timeout: 8000 }).toBe(true);
  // The PC sees the session and ends it.
  await pc.goto(`${COMPANION}/#/remote`);
  await expect(pc.getByText("Aktive Sitzung: iPhone · Safari")).toBeVisible();
  await pc.getByRole("button", { name: "Sitzung beenden" }).click();
  await expect(phone.getByText("Verbindung sicher beendet")).toBeVisible({ timeout: 10000 });
  await expect(phone.getByText("Am PC beendet.")).toBeVisible();
  await pc.getByRole("switch", { name: /Remote Desktop erlauben/ }).click();
});

test("Datenschutztaste: zeigt ehrlich, was wirkt, pausiert andere Geräte und verdeckt Inhalte", async () => {
  await pc.goto(`${COMPANION}/#/`);
  await phone.goto(`${COMPANION}/#/games`);
  await expect(phone.getByText("E2E Testspiel").first()).toBeVisible();
  await pc.getByRole("button", { name: "Datenschutz- und Notfalltaste" }).click();
  const dlg = pc.getByRole("dialog");
  await dlg.getByRole("button", { name: "Schritte einstellen" }).click();
  await dlg.getByRole("switch", { name: "Andere Geräte pausieren" }).click();
  await expect(dlg.getByRole("switch", { name: "Andere Geräte pausieren" })).toBeChecked();
  await dlg.getByRole("button", { name: "Fertig" }).click();
  await dlg.getByRole("button", { name: "Jetzt einschalten" }).click();
  await expect(dlg.getByText("Datenschutzmodus ist an")).toBeVisible();
  // Without the Windows companion the sound/mic steps say "not possible" – never "done".
  await expect(dlg.locator(".check-row", { hasText: "Soundboard stoppen" })).toContainText("Nicht möglich");
  await expect(dlg.locator(".check-row", { hasText: "Andere Geräte pausieren" })).toContainText("Wirkt");
  await expect(pc.locator("body")).toHaveClass(/privacy-on/);
  await expect(phone.getByText("Vom PC pausiert (Datenschutzmodus)")).toBeVisible({ timeout: 10000 });
  await dlg.getByRole("button", { name: "Ausschalten" }).click();
  await expect(pc.locator("body")).not.toHaveClass(/privacy-on/);
  await dlg.getByRole("button", { name: "Schließen" }).last().click();
  await expect(dlg).toBeHidden();
  // The phone stayed paired and signs in again by itself.
  await expect(phone.getByText("Vom PC pausiert (Datenschutzmodus)")).toBeHidden({ timeout: 15000 });
  await phone.reload();
  await expect(phone.getByText("E2E Testspiel").first()).toBeVisible();
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
  await tablet.getByText("Vorschläge: Medientasten, 60-%-Tastatur und Gaming-Maus").click();
  await tablet.getByRole("button", { name: "Maus-Seitentaste hinten (4)", exact: true }).click();
  await tablet.getByRole("combobox", { name: "Aktion" }).selectOption("stopAllSounds");
  await tablet.getByRole("button", { name: "Speichern" }).click();
  await expect(tablet.getByText("Maus-Seitentaste hinten (4)").first()).toBeVisible();
  await expect(tablet.getByText("Wartet auf PC").first()).toBeVisible();
  // Plugin file without PC: checked on the tablet, kept until the PC is connected.
  await tablet.goto(`${HOSTED_SITE}/#/plugins?tab=dev`);
  await tablet.locator('input[type="file"]').setInputFiles(join(state().workDir, "de.pgl.cpu-mini-1.0.1.pglplugin"));
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
  // Own widget built on the tablet without the PC: placed on the dashboard and in the overlay at once.
  await tablet.goto(`${HOSTED_SITE}/#/widgets`);
  await tablet.getByRole("button", { name: "Neues Widget" }).first().click();
  await tablet.locator(".ws-template", { hasText: "Leistung" }).click();
  await tablet.getByRole("textbox", { name: "Name des Widgets" }).fill("Tablet-Widget");
  await tablet.getByRole("button", { name: "Speichern" }).click();
  await expect(tablet.getByText("Gespeichert – wird beim Verbinden auf den PC übertragen")).toBeVisible();
  await tablet.getByRole("switch", { name: /Auf dem Dashboard/ }).check();
  await tablet.getByRole("switch", { name: /Im Overlay/ }).click();
  await expect(tablet.getByRole("switch", { name: /Im Overlay/ })).toBeChecked();
  await tablet.reload();
  await expect(tablet.locator(".ws-item", { hasText: "Tablet-Widget" })).toBeVisible(); // kept on the tablet
  // Deck built on the tablet without the PC: shown right away (2.8 kept it only in the queue), with a real logo.
  await tablet.goto(`${HOSTED_SITE}/#/deck`);
  await tablet.getByRole("button", { name: "Leeres Deck" }).click();
  await tablet.locator(".deck-key.empty").first().click();
  const keyDialog = tablet.getByRole("dialog");
  await keyDialog.getByLabel("Aktion").selectOption("open");
  await keyDialog.getByLabel("Beschriftung").fill("Tablet-Taste");
  await keyDialog.getByLabel("Seite").selectOption("/soundboard");
  await keyDialog.getByRole("radio", { name: "Logo" }).click();
  await keyDialog.getByRole("button", { name: "Discord" }).click();
  await keyDialog.getByRole("button", { name: "Speichern" }).click();
  await tablet.getByRole("button", { name: "Bearbeiten beenden" }).click();
  await tablet.reload();
  await expect(tablet.locator(".deck-key", { hasText: "Tablet-Taste" }).locator('svg[aria-label="Discord"]')).toBeVisible();
  // Calendar event and own status without the PC (2.14): shown at once, kept after reload, sent after pairing.
  await tablet.goto(`${HOSTED_SITE}/#/calendar`);
  await tablet.getByRole("button", { name: "Neuer Termin" }).click();
  await tablet.getByRole("dialog").getByLabel("Titel").fill("Tablet-Raid");
  await tablet.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(tablet.getByText("Tablet-Raid").first()).toBeVisible();
  await tablet.goto(`${HOSTED_SITE}/#/`);
  await tablet.locator(".activity-now").click();
  await tablet.getByRole("dialog").getByRole("button", { name: "Nicht stören" }).click();
  await tablet.getByRole("dialog").getByLabel("Text (optional)").fill("Tablet-Status");
  await tablet.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await tablet.reload();
  await expect(tablet.locator(".activity-now")).toContainText("Nicht stören · Tablet-Status");
  await expect(tablet.locator(".cw, .card", { hasText: "Termine" }).getByText("Tablet-Raid")).toBeVisible(); // home widget, from the device's copy
  // A file chosen without the PC waits on the tablet (2.15) and goes to the PC's exchange folder after pairing.
  await tablet.goto(`${HOSTED_SITE}/#/files`);
  await tablet.locator('input[type="file"]').setInputFiles({ name: "tablet-config.ini", mimeType: "text/plain", buffer: Buffer.from("[video]\nfps=240\n") });
  await expect(tablet.getByText("wartet auf PC").first()).toBeVisible();
  await tablet.reload();
  await expect(tablet.locator(".list-item", { hasText: "tablet-config.ini" })).toBeVisible(); // survives closing the page
  // The assistant sets the app up without the PC: the request becomes a button, applied on tap, undoable.
  await tablet.goto(`${HOSTED_SITE}/#/assistant`);
  const say = tablet.getByRole("textbox", { name: "Nachricht an den Assistenten" });
  await say.fill("Pack den Backlog in die Leiste");
  await say.press("Enter");
  await tablet.locator(".as-turn.bot").last().getByRole("button", { name: "statt „Sounds“" }).click();
  await expect(tablet.locator(".bottom-nav").getByRole("link", { name: "Backlog" })).toBeVisible();
  await tablet.locator(".as-turn.bot").last().getByRole("button", { name: "Rückgängig" }).click();
  await expect(tablet.locator(".bottom-nav").getByRole("link", { name: "Sounds" })).toBeVisible();
  await say.fill("Leiste schlicht wie früher");
  await say.press("Enter");
  await tablet.locator(".as-turn.bot").last().getByRole("button", { name: "Symbole schlicht" }).click();
  await expect.poll(() => tablet.evaluate(() => document.documentElement.hasAttribute("data-nav-plain"))).toBe(true);
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
  // A plugin file brings new code/rights: it is not sent by itself after pairing, only after a confirmation.
  await expect(tablet.getByText(/Bringt neue Plugin-Dateien oder Rechte auf den PC – erst nach Bestätigung/)).toBeVisible();
  await tablet.getByRole("button", { name: "Bestätigen" }).click();
  await expect(tablet.getByText(/Diesem Gerät fehlt die Berechtigung „admin“/)).toBeVisible({ timeout: 15000 });
  await tablet.getByRole("button", { name: "Verwerfen" }).click();
  await expect(tablet.getByText("Alles übertragen.")).toBeVisible();
  await tablet.keyboard.press("Escape");
  await tablet.goto(`${HOSTED_SITE}/#/`);
  await expect(tablet.locator(".dash .cw", { hasText: "PC-Leistung" })).toBeVisible(); // placed on the dashboard before pairing
  await pc.goto(`${COMPANION}/#/hotkeys`);
  await expect(pc.getByText("Maus-Seitentaste hinten (4)")).toBeVisible();
  await expect(pc.locator(".list-item", { hasText: "Ctrl + Alt + 7" })).toContainText("Replay speichern");
  await pc.goto(`${COMPANION}/#/overlay`);
  await expect(pc.locator(".gb-panel-title", { hasText: "Laufende Sounds" })).toBeVisible(); // chosen on the tablet
  await expect(pc.locator(".gb-panel", { hasText: "Tablet-Widget" }).locator(".cw", { hasText: "PC-Leistung" })).toBeVisible(); // built on the tablet
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
  // The deck from the tablet is on the PC, with its logo key.
  await pc.goto(`${COMPANION}/#/deck`);
  await pc.getByLabel("Deck wählen").selectOption({ label: "Neues Deck" }); // waits until the PC's decks are loaded (two now)
  await expect(pc.locator(".deck-key", { hasText: "Tablet-Taste" }).locator('svg[aria-label="Discord"]')).toBeVisible();
  // Calendar event and status from the tablet are on the PC.
  await pc.goto(`${COMPANION}/#/calendar`);
  await expect(pc.getByText("Tablet-Raid").first()).toBeVisible();
  await expect.poll(() => { try { return readFileSync(join(state().dataDir, "activity.json"), "utf8"); } catch { return ""; } }).toContain("Tablet-Status");
  await expect.poll(() => { try { return readFileSync(join(state().dataDir, "transfer", "tablet-config.ini"), "utf8"); } catch { return ""; } }, { timeout: 15000 }).toBe("[video]\nfps=240\n");

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

test("Sammlungen ohne PC: Journal und Wiki speichern im Browser, gleichen nach dem Koppeln mit dem PC ab", async ({ browser }) => {
  const ctx = await newCtx(browser, { ...devices["iPhone 13"], locale: "de-DE" });
  const tab = await ctx.newPage();
  await tab.goto(`${COMPANION}/#/journal`);
  await tab.getByRole("button", { name: "Neuer Eintrag" }).first().click();
  const dlg = tab.getByRole("dialog");
  await dlg.getByLabel("Was hast du gemacht?").fill("Netherfestung gefunden");
  await expect(dlg.getByRole("button", { name: "Speichern" })).toBeDisabled(); // a game is required
  await dlg.getByPlaceholder("Name des Spiels").fill("Minecraft");
  await dlg.getByLabel("Was kommt als Nächstes?").fill("Lohen jagen");
  await dlg.getByRole("button", { name: "Speichern" }).click();
  await tab.reload();
  await expect(tab.getByText("Lohen jagen").first()).toBeVisible();
  await expect(tab.getByText("1 Änderung nur hier – geht zum PC, sobald er an ist")).toBeVisible();

  await tab.goto(`${COMPANION}/#/wiki`);
  await tab.getByRole("button", { name: "Neue Seite" }).first().click();
  await tab.getByLabel("Titel").fill("Creeper");
  await tab.getByLabel("Text").fill("Gegen [[Rüstung]] hilft wenig.");
  await expect(tab.locator(".j-save-state")).toHaveText(/^\s*Gespeichert/, { timeout: 5000 });
  await tab.getByRole("button", { name: "Fertig" }).click();
  await tab.getByRole("button", { name: "Rüstung" }).click(); // missing page → created
  await expect(tab.getByLabel("Titel")).toHaveValue("Rüstung");
  await tab.getByRole("button", { name: "Fertig" }).click();
  await expect(tab.locator(".j-link-chip", { hasText: "Creeper" })).toBeVisible(); // backlink

  await pair(tab, COMPANION);
  await tab.goto(`${COMPANION}/#/wiki`);
  await expect(tab.getByText("Mit dem PC abgeglichen")).toBeVisible({ timeout: 15000 });
  await pc.goto(`${COMPANION}/#/wiki`);
  await expect(pc.getByRole("button", { name: /Creeper/ })).toBeVisible({ timeout: 10000 });
  // A change on the PC reaches the device without reloading.
  await pc.goto(`${COMPANION}/#/journal?tab=memory`);
  await pc.getByRole("button", { name: "Verlauf ansehen" }).click();
  await pc.getByRole("button", { name: "Bearbeiten" }).first().click();
  await pc.getByRole("dialog").getByLabel("Was kommt als Nächstes?").fill("Wither besiegen");
  await pc.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await tab.goto(`${COMPANION}/#/journal?tab=memory`);
  await expect(tab.getByText("Wither besiegen").first()).toBeVisible({ timeout: 10000 });
  await ctx.close();
});

test("Was spiele ich?: Bingo erkennt Reihen, Link teilen und als eigene Karte übernehmen; Challenges speichern", async ({ browser }) => {
  const ctx = await newCtx(browser, { viewport: { width: 1200, height: 900 }, locale: "de-DE", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.goto(`${COMPANION}/#/play?tab=bingo`);
  await page.getByRole("button", { name: "Neue Karte" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("radio", { name: "3×3" }).click();
  await dlg.getByLabel("Vorlage").selectOption("");
  await dlg.getByLabel("Eigene Aufgaben (eine pro Zeile)").fill("a\nb\nc");
  await expect(dlg.getByRole("button", { name: "Karte mischen" })).toBeDisabled(); // 8 tasks needed
  await dlg.getByLabel("Vorlage").selectOption("general");
  await dlg.getByRole("button", { name: "Karte mischen" }).click();
  await expect(page.locator(".bingo-cell")).toHaveCount(9);
  await expect(page.locator(".bingo-cell.free")).toHaveCount(1);
  for (const i of [0, 3, 6]) await page.locator(".bingo-cell").nth(i).click();
  await expect(page.getByText("Fertig: Spalte 1")).toBeVisible();
  await expect(page.locator(".bingo-cell.line")).toHaveCount(3);
  await page.getByRole("button", { name: "Link teilen" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("share=");
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const other = await newCtx(browser, { ...devices["iPhone 13"], locale: "de-DE" });
  const friend = await other.newPage();
  await friend.goto(link);
  await expect(friend.getByText("Geteilte Karte")).toBeVisible();
  await expect(friend.locator(".bingo-cell")).toHaveCount(9);
  await friend.getByRole("button", { name: "Als eigene Karte speichern" }).click();
  await friend.reload();
  await friend.getByRole("tab", { name: "Bingo" }).click();
  await expect(friend.locator(".j-hit", { hasText: "Mein Bingo" })).toContainText("0 von 8 erledigt"); // ticks are not shared
  await friend.goto(`${COMPANION}/#/play?tab=bingo&share=kaputt`);
  await expect(friend.getByText("Link ist ungültig oder beschädigt")).toBeVisible();

  await page.getByRole("tab", { name: "Challenges" }).click();
  await page.getByRole("button", { name: "Vorschläge erzeugen" }).click();
  await expect(page.locator(".j-conflict")).toHaveCount(3);
  await page.locator(".j-conflict").first().getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("1 offen · 0 geschafft")).toBeVisible();
  await page.locator(".card", { hasText: "Meine Challenges" }).locator("input[type=checkbox]").first().click();
  await expect(page.getByText("0 offen · 1 geschafft")).toBeVisible();
  await ctx.close(); await other.close();
});

test("Welten & Bauen: Welt mit Koordinaten prüft Eingaben, rechnet Nether um, Bauprojekt zählt Aufgaben, Löschen entfernt Verknüpfung", async ({ browser }) => {
  const ctx = await newCtx(browser, { ...devices["iPhone 13"], locale: "de-DE" });
  const p = await ctx.newPage();
  const dlg = () => p.getByRole("dialog").last();
  await p.goto(`${COMPANION}/#/worlds`);
  await p.getByRole("button", { name: "Neu" }).click();
  await dlg().getByLabel("Name der Welt *").fill("E2E-Welt");
  await dlg().getByRole("button", { name: "Zeile hinzufügen" }).click();
  const row = dlg().locator(".rows-edit").first();
  await row.getByLabel("Name", { exact: true }).fill("Basis");
  await row.getByLabel("X", { exact: true }).fill("803");
  await row.getByLabel("Z", { exact: true }).fill("1.5");
  await dlg().getByRole("button", { name: "Speichern" }).click();
  await expect(row).toContainText("„Z“ muss eine ganze Zahl sein.");
  await row.getByLabel("Z", { exact: true }).fill("-1601");
  await dlg().getByRole("button", { name: "Speichern" }).click();
  await dlg().getByLabel("X", { exact: true }).fill("803");
  await dlg().getByLabel("Z", { exact: true }).fill("-1601");
  await expect(dlg().getByText("X 100 · Y 64 · Z -201")).toBeVisible();
  await dlg().getByRole("button", { name: "Schließen" }).click();

  await p.getByRole("tab", { name: "Bauprojekte" }).click();
  await p.getByRole("button", { name: "Neu" }).click();
  await dlg().getByRole("button", { name: "Haus" }).click();
  await dlg().getByLabel("Projekt *").fill("E2E-Haus");
  await dlg().getByLabel("Welt").selectOption({ label: "E2E-Welt" });
  await dlg().getByRole("button", { name: "Speichern" }).click();
  await dlg().locator("label.checkbox", { hasText: "Fundament" }).locator("input").click();
  await expect(dlg().getByText("1 von 5 Aufgaben")).toBeVisible();
  await dlg().getByRole("button", { name: "Schließen" }).click();

  await p.getByRole("tab", { name: "Minecraft-Welten" }).click();
  await p.locator(".j-page-card", { hasText: "E2E-Welt" }).click();
  await dlg().getByRole("button", { name: "Löschen" }).click();
  await p.getByRole("dialog").last().getByRole("button", { name: "Löschen" }).last().click();
  await p.getByRole("tab", { name: "Bauprojekte" }).click();
  await expect(p.locator(".j-page-card", { hasText: "E2E-Haus" })).not.toContainText("E2E-Welt");
  await p.reload();
  await expect(p.locator(".j-page-card", { hasText: "E2E-Haus" })).toContainText("1 von 5 Aufgaben");
  await ctx.close();
});

test("Freunde: Abstimmung per Link (Antwort zählt, zurückgezogener Link nicht), Turnier mit Freilosen, Gruppen-Finder ohne erfundenes Crossplay", async ({ browser }) => {
  const host = await newCtx(browser, { viewport: { width: 1200, height: 900 }, locale: "de-DE", permissions: ["clipboard-read", "clipboard-write"] });
  const friendCtx = await newCtx(browser, { ...devices["iPhone 13"], locale: "de-DE", timezoneId: "America/New_York", permissions: ["clipboard-read", "clipboard-write"] });
  for (const c of [host, friendCtx]) await c.addInitScript(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
  const p = await host.newPage(), f = await friendCtx.newPage();
  const dlg = () => p.getByRole("dialog").last();
  const clip = (pg: Page) => pg.evaluate(() => navigator.clipboard.readText());
  await p.goto(`${COMPANION}/#/friends`);
  for (const [name, games] of [["Ich", [["Minecraft", "PC"], ["Fortnite", "PC"]]], ["Mia", [["Minecraft", "PC"], ["Fortnite", "PlayStation"]]]] as const) {
    await p.getByRole("button", { name: "Neu" }).click();
    await dlg().getByLabel("Spielername *").fill(name);
    for (const [g, pl] of games) { await dlg().getByRole("button", { name: "Zeile hinzufügen" }).click(); const r = dlg().locator(".rows-edit").last(); await r.getByLabel("Spiel", { exact: true }).fill(g); await r.getByLabel("Plattform", { exact: true }).fill(pl); }
    await dlg().getByRole("button", { name: "Speichern" }).click();
    await dlg().getByRole("button", { name: "Schließen" }).click();
  }
  await p.getByRole("tab", { name: "Was spielen wir?" }).click();
  await p.getByRole("button", { name: "Ich", exact: true }).click();
  await p.getByRole("button", { name: "Mia", exact: true }).click();
  await expect(p.locator(".j-conflict", { hasText: "Minecraft" })).toContainText("Alle auf PC");
  await expect(p.locator(".j-conflict", { hasText: "Fortnite" })).toContainText("Crossplay unbekannt");

  await p.getByRole("tab", { name: "Abstimmungen" }).click();
  await p.getByRole("button", { name: "Neue Abstimmung" }).click();
  await dlg().getByLabel("Option 1").fill("Minecraft");
  await dlg().getByLabel("Option 2").fill("Fortnite");
  await dlg().getByRole("button", { name: "Speichern" }).click();
  await dlg().getByRole("button", { name: "Einladungs-Link" }).click();
  await expect.poll(() => clip(p)).toContain("&l=");
  await f.goto(await clip(p));
  await f.getByLabel("Dein Name").fill("Mia");
  await f.getByLabel("Fortnite").check();
  await f.getByRole("button", { name: "Antwort-Link senden" }).click();
  await expect.poll(() => clip(f)).toContain("&l=");
  const reply = await clip(f);
  await p.keyboard.press("Escape");
  await p.goto(reply);
  await expect(p.getByText("Stimme von Mia gezählt")).toBeVisible();
  await p.getByRole("button", { name: "OK", exact: true }).click();
  await p.locator(".j-hit", { hasText: "Was spielen wir?" }).click();
  await dlg().getByRole("button", { name: "Link zurückziehen" }).click();
  await p.getByRole("dialog").last().getByRole("button", { name: "Zurückziehen" }).click();
  await p.keyboard.press("Escape");
  await p.goto(reply);
  await expect(p.getByText("Der Link gehört zu einer zurückgezogenen oder fremden Einladung.")).toBeVisible();
  await p.getByRole("button", { name: "OK", exact: true }).click();

  await p.getByRole("tab", { name: "Turniere" }).click();
  await p.getByRole("button", { name: "Neues Turnier" }).click();
  await dlg().getByLabel("Teilnehmer (einer pro Zeile)").fill("A\nB\nA");
  await expect(dlg().getByText("Jeder Name darf nur einmal vorkommen.")).toBeVisible();
  await dlg().getByLabel("Teilnehmer (einer pro Zeile)").fill("A\nB\nC\nD\nE");
  await dlg().getByRole("button", { name: "Anlegen" }).click();
  await expect(p.locator(".bracket-match.bye")).toHaveCount(3);
  for (let i = 0; i < 4; i++) {
    await p.locator(".bracket-match.ready").first().click();
    await dlg().locator("input").nth(0).fill("1");
    await dlg().locator("input").nth(1).fill("1");
    await expect(dlg().getByRole("button", { name: "Speichern" })).toBeDisabled(); // no draw in knockout
    await dlg().locator("input").nth(0).fill("2");
    await dlg().getByRole("button", { name: "Speichern" }).click();
  }
  await expect(p.locator(".banner", { hasText: "Sieger" })).toBeVisible();
  await host.close(); await friendCtx.close();
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
    // The open app reconnects by itself, without reloading: at most 1 s between tries while it is on screen.
    await expect.poll(async () => { try { return (await fetch(`${COMPANION}/healthz`)).ok; } catch { return false; } }, { timeout: 30000 }).toBe(true);
    const up = Date.now();
    await expect(ipad.locator(".connect-item .dot.ok, .conn-pill .dot.ok").first()).toBeVisible({ timeout: 10000 });
    expect(Date.now() - up).toBeLessThan(2500);
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
