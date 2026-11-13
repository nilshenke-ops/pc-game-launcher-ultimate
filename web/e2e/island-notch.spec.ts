// The island's newer areas (3.55): tab strip on top, overview, quick controls, system tiles and the download notice – against the real
// headless companion (its controls live in memory there: PGL_TEST_CONTROLS=1, so nothing on the test machine changes).
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMPANION, state } from "./env";
import { adminRpc } from "./rpc";

const SHOTS = process.env.PGL_SHOTS;
async function island(page: Page) {
  await page.addInitScript((tok) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; w.__PGL_EMBEDDED__ = true; w.__PGL_ISLAND__ = true; }, state().adminToken);
  await page.setViewportSize({ width: 620, height: 380 });
  await page.goto(`${COMPANION}/#/island`);
  await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click();
  const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
  await expect(panel).toBeVisible();
  return panel;
}
const shot = async (page: Page, name: string) => { if (SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: join(SHOTS, name + ".png") }); } };

test("Insel: Symbolleiste oben, Übersicht mit Kalenderwoche und Fokus-Timer, System-Kacheln", async ({ browser }) => {
  const ctx = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE" });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
  const panel = await island(page);
  // the tabs sit in the header and every area opens
  for (const name of ["Home", "Übersicht", "JARVIS", "Meldungen", "Apps", "Regler", "System"]) await expect(panel.getByRole("tab", { name, exact: true })).toBeVisible();
  await panel.getByRole("tab", { name: "Übersicht" }).click();
  await expect(panel.getByText(/^KW \d{1,2}$/)).toBeVisible();
  await expect(panel.locator(".isl3-week .today")).toHaveCount(1);
  await expect(panel.locator(".isl3-sysrow")).toHaveCount(3);
  // focus timer: longer, start, it runs, stop
  const focus = panel.getByRole("region", { name: "Fokus-Timer" });
  await focus.getByRole("button", { name: "Länger" }).click();
  await expect(focus.locator(".isl3-ring")).toHaveText("30:00");
  await focus.getByRole("button", { name: "Fokus starten" }).click();
  await expect(focus.locator(".isl3-ring")).toHaveText(/^(30:00|29:5\d)$/);
  await shot(page, "dash");
  await focus.getByRole("button", { name: "Stopp" }).click();
  await expect(focus.locator(".isl3-ring")).toHaveText("30:00");
  await panel.getByRole("tab", { name: "System" }).click();
  await expect(panel.locator(".isl3-stat")).toHaveCount(7);
  // network: the companion measures twice, then the speeds stand there
  await expect(panel.locator(".isl3-net")).toContainText(/\d+ (kB|MB)\/s/, { timeout: 10_000 });
  await expect(panel.locator(".isl3-stat").filter({ hasText: "Akku" })).toContainText("87 %");
  await shot(page, "system");
  await panel.getByRole("tab", { name: "Home" }).click(); await shot(page, "home");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Insel-Regler: Lautstärke, Stumm, Helligkeit und Energiemodus kommen am PC an", async ({ browser }) => {
  await adminRpc("controls.set", { volume: 42, muted: false, brightness: 100, powerMode: "balanced" });
  const ctx = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE" });
  const page = await ctx.newPage();
  const panel = await island(page);
  await panel.getByRole("tab", { name: "Regler" }).click();
  const vol = panel.getByLabel("Lautstärke am PC"), bright = panel.getByLabel("Helligkeit");
  await expect(vol).toHaveValue("42");
  await expect(bright).toHaveValue("100");
  await shot(page, "controls");
  await vol.fill("68");
  await expect.poll(async () => (await adminRpc<{ volume: number }>("controls.get")).volume, { timeout: 8000 }).toBe(68);
  await bright.fill("55");
  await expect.poll(async () => (await adminRpc<{ brightness: number }>("controls.get")).brightness, { timeout: 8000 }).toBe(55);
  await panel.getByRole("button", { name: /Stumm/ }).click();
  await expect.poll(async () => (await adminRpc<{ muted: boolean }>("controls.get")).muted, { timeout: 8000 }).toBe(true);
  await expect(panel.getByRole("button", { name: /Stumm/ })).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("radio", { name: "Leistung" }).click();
  await expect.poll(async () => (await adminRpc<{ powerMode: string }>("controls.get")).powerMode, { timeout: 8000 }).toBe("performance");
  await expect(panel.getByRole("radio", { name: "Leistung" })).toHaveAttribute("aria-checked", "true");
  // the header shows the PC's battery
  await expect(panel.getByLabel("Akku des PCs: 87 Prozent")).toBeVisible();
  await adminRpc("controls.set", { volume: 42, muted: false, brightness: 100, powerMode: "balanced" });
  await ctx.close();
});

test("Fertiger Download erscheint als Meldung (nur der Dateiname), ein halb geladener nicht", async ({ browser }) => {
  const dir = join(state().dataDir, "downloads");
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ locale: "de-DE" });
  const page = await ctx.newPage();
  const panel = await island(page);
  writeFileSync(join(dir, "halb.zip.crdownload"), "x".repeat(2000));
  writeFileSync(join(dir, "nexus-testdatei.zip"), "x".repeat(5000));
  await expect.poll(async () => JSON.stringify((await adminRpc<{ items: { title: string }[] }>("notifications.list")).items.map((n) => n.title)), { timeout: 20_000 }).toContain("Download fertig: nexus-testdatei.zip");
  expect(JSON.stringify((await adminRpc<{ items: { title: string }[] }>("notifications.list")).items)).not.toContain("halb.zip");
  await panel.getByRole("tab", { name: "Meldungen" }).click();
  await expect(panel.getByText("Download fertig: nexus-testdatei.zip")).toBeVisible({ timeout: 10_000 });
  await panel.getByRole("button", { name: "Alle löschen" }).click();
  await expect(panel.getByText("Keine offenen Meldungen.")).toBeVisible();
  await ctx.close();
});

test("Mikrofon am PC stummschalten; die Insel zeigt, wenn ein Programm Mikrofon oder Kamera benutzt", async ({ browser }) => {
  await adminRpc("controls.micMute", { muted: false });
  const ctx = await browser.newContext({ locale: "de-DE" });
  const page = await ctx.newPage();
  const panel = await island(page);
  // the test companion says a program uses the microphone while it is not muted: the orange dot is in the header
  await expect(panel.getByRole("img", { name: "Mikrofon in Benutzung: Testprogramm" })).toBeVisible();
  await panel.getByRole("tab", { name: "Regler" }).click();
  const mic = panel.getByRole("button", { name: /^Mikrofon/ });
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await expect(mic).toContainText("benutzt: Testprogramm");
  await mic.click();
  await expect.poll(async () => (await adminRpc<{ micMuted: boolean }>("controls.sensors")).micMuted, { timeout: 8000 }).toBe(true);
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("img", { name: /Mikrofon in Benutzung/ })).toHaveCount(0, { timeout: 8000 });
  await mic.click();
  await expect.poll(async () => (await adminRpc<{ micMuted: boolean }>("controls.sensors")).micMuted, { timeout: 8000 }).toBe(false);
  await ctx.close();
});

test("Liedtext: erst nach Zustimmung, dann läuft die aktuelle Zeile mit dem Lied mit", async ({ browser }) => {
  const media = join(state().dataDir, "media.txt");
  writeFileSync(media, "Testlied\nTestband\n200000\n");
  const ctx = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE" });
  const page = await ctx.newPage();
  const asked: string[] = [];
  // lrclib.net answered by the test (no outside network): timed lines, the second one is sung right now
  await page.route("https://lrclib.net/api/**", (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ instrumental: false, plainLyrics: "Erste Zeile\nZweite Zeile", syncedLyrics: "[00:00.00] Erste Zeile\n[00:00.50] Zweite Zeile\n[03:00.00] Letzte Zeile" }) });
  });
  try {
    const panel = await island(page);
    await panel.getByRole("tab", { name: "Musik" }).click();
    await expect(panel.locator(".isl2-music .isl2-big")).toHaveText("Testlied", { timeout: 10_000 });
    await panel.getByRole("button", { name: "Liedtext" }).click();
    // nothing leaves the device before it is switched on
    await expect(panel.getByText(/Titel und Interpret des laufenden Lieds/)).toBeVisible();
    expect(asked).toEqual([]);
    await panel.getByRole("button", { name: "Liedtexte einschalten" }).click();
    const lines = panel.getByRole("list", { name: "Liedtext" });
    await expect(lines.locator("li[aria-current=true]")).toHaveText("Zweite Zeile", { timeout: 10_000 });
    expect(asked[0]).toContain("track_name=Testlied");
    expect(asked[0]).toContain("artist_name=Testband");
    await expect(panel.getByText("Quelle: lrclib.net")).toBeVisible();
    await shot(page, "lyrics");
    await panel.getByRole("button", { name: "Liedtexte ausschalten" }).click();
    await expect(panel.getByRole("button", { name: "Liedtexte einschalten" })).toBeVisible();
  } finally {
    rmSync(media, { force: true });
    await ctx.close();
  }
});

test("Download-Meldungen lassen sich in der Insel ausschalten und wieder einschalten", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "de-DE" });
  const page = await ctx.newPage();
  const panel = await island(page);
  await panel.getByRole("tab", { name: "Meldungen" }).click();
  const sw = panel.getByRole("checkbox", { name: "Fertige Downloads melden" });
  await expect(sw).toBeChecked();
  await sw.click();
  await expect.poll(async () => (await adminRpc<{ settings: { downloadNotices: boolean } }>("settings.get")).settings.downloadNotices, { timeout: 8000 }).toBe(false);
  await expect(sw).not.toBeChecked();
  await sw.click();
  await expect.poll(async () => (await adminRpc<{ settings: { downloadNotices: boolean } }>("settings.get")).settings.downloadNotices, { timeout: 8000 }).toBe(true);
  await ctx.close();
});

type LayoutResp = { look: { layout: { home: { type: string; opts?: Record<string, unknown> }[]; dash: { id: string; type: string; opts?: Record<string, unknown> }[]; tabs?: string[] } | null } };
const resetLayout = () => adminRpc("island.configure", { look: { resetLayout: true } });

test("Übersicht bearbeiten: Kachel hinzufügen, einstellen, verschieben und entfernen – am PC gespeichert", async ({ browser }) => {
  await resetLayout();
  const ctx = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE" });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
  try {
    const panel = await island(page);
    await panel.getByRole("tab", { name: "Übersicht" }).click();
    await panel.getByRole("button", { name: "Übersicht bearbeiten" }).click();
    await expect(panel.getByRole("toolbar", { name: "Bearbeiten" })).toContainText("Übersicht bearbeiten");
    await panel.getByRole("button", { name: "Kachel hinzufügen" }).click();
    await panel.getByRole("dialog", { name: "Kachel hinzufügen" }).getByRole("listitem", { name: "Uhr hinzufügen" }).click();
    await expect(panel.getByRole("region", { name: "Uhr" })).toBeVisible();
    await shot(page, "edit");
    await panel.getByRole("button", { name: "Uhr einstellen" }).click();
    const sheet = panel.getByRole("dialog", { name: "Uhr einstellen" });
    await sheet.getByLabel("Zeitzone").selectOption("Asia/Tokyo");
    await shot(page, "tile-settings");
    await expect.poll(async () => JSON.stringify((await adminRpc<LayoutResp>("island.get")).look.layout?.dash), { timeout: 8000 }).toContain("Asia/Tokyo");
    await sheet.getByRole("button", { name: "Schließen" }).click();
    await expect(panel.getByRole("region", { name: "Uhr" })).toContainText("Tokio");
    await panel.getByRole("button", { name: "Uhr nach vorne" }).click();
    await expect.poll(async () => (await adminRpc<LayoutResp>("island.get")).look.layout?.dash.map((x) => x.type).join(","), { timeout: 8000 }).toBe("calendar,focus,weather,clock,system");
    await panel.getByRole("button", { name: "Uhr entfernen" }).click();
    await expect(panel.getByRole("region", { name: "Uhr" })).toHaveCount(0);
    await panel.getByRole("button", { name: "Fertig" }).click();
    await expect(panel.getByRole("toolbar", { name: "Bearbeiten" })).toHaveCount(0);
    // the areas: hide "Audio", it leaves the strip; show it again
    await panel.getByRole("button", { name: "Mehr" }).click();
    await panel.getByRole("menuitem", { name: "Bereiche anpassen" }).click();
    const areas = panel.getByRole("dialog", { name: "Bereiche in der Leiste" });
    await areas.getByRole("button", { name: "Audio ausblenden" }).click();
    await expect(panel.getByRole("tab", { name: "Audio", exact: true })).toHaveCount(0);
    await areas.getByRole("button", { name: "Audio einblenden" }).click();
    await expect(panel.getByRole("tab", { name: "Audio", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await resetLayout(); await ctx.close(); }
});

test("Insel anpassen von außen: in den Einstellungen eine Kachel auf die Startseite legen", async ({ browser }) => {
  await resetLayout();
  const ctx = await browser.newContext({ locale: "de-DE" });
  const page = await ctx.newPage();
  try {
    await page.addInitScript((tok) => { (window as unknown as Record<string, unknown>).__PGL_ADMIN__ = tok; }, state().adminToken);
    await page.goto(`${COMPANION}/#/overlay-settings`);
    const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Insel anpassen" }) });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByLabel("Kachel für Startseite").selectOption("note");
    await card.getByRole("button", { name: "Hinzufügen" }).first().click();
    await expect.poll(async () => (await adminRpc<LayoutResp>("island.get")).look.layout?.home.map((x) => x.type).join(","), { timeout: 8000 }).toContain("note");
    await card.getByRole("button", { name: "Notiz einstellen" }).click();
    await card.getByLabel("Text").fill("Einkaufen");
    await expect.poll(async () => JSON.stringify((await adminRpc<LayoutResp>("island.get")).look.layout?.home), { timeout: 8000 }).toContain("Einkaufen");
  } finally { await resetLayout(); await ctx.close(); }
});

test("Audio: großer Stumm-Knopf schaltet das Mikrofon am PC, ehrlicher Hinweis ohne Geräteliste", async ({ browser }) => {
  await adminRpc("controls.micMute", { muted: false });
  const ctx = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE" });
  const page = await ctx.newPage();
  try {
    const panel = await island(page);
    await panel.getByRole("tab", { name: "Audio", exact: true }).click();
    const big = panel.getByRole("button", { name: "Mikrofon stummschalten" });
    await expect(big).toHaveAttribute("aria-pressed", "false");
    await expect(panel.getByText("Geräte zeigt nur der Windows-Begleiter.").first()).toBeVisible();
    await big.click();
    await expect.poll(async () => (await adminRpc<{ micMuted: boolean }>("controls.sensors")).micMuted, { timeout: 8000 }).toBe(true);
    await expect(panel.getByRole("button", { name: "Mikrofon einschalten" })).toHaveAttribute("aria-pressed", "true");
    await shot(page, "audio");
    await panel.getByRole("button", { name: "Mikrofon einschalten" }).click();
    await expect.poll(async () => (await adminRpc<{ micMuted: boolean }>("controls.sensors")).micMuted, { timeout: 8000 }).toBe(false);
    await expect(panel.getByRole("button", { name: "Kamera prüfen" })).toBeVisible();
  } finally { await ctx.close(); }
});

test("Am Handy weiterhören: pausiert am PC und öffnet das Lied auf dem Handy", async ({ browser }) => {
  const media = join(state().dataDir, "media.txt");
  writeFileSync(media, "Testlied\nTestband\n200000\n");
  const ctx = await browser.newContext({ locale: "de-DE", hasTouch: true, isMobile: true, viewport: { width: 412, height: 860 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await ctx.newPage();
  try {
    await page.addInitScript(() => { const w = window as unknown as { __opened: string[]; open: (u: string) => null }; w.__opened = []; w.open = (u: string) => { w.__opened.push(u); return null; }; });
    await page.addInitScript((tok) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; w.__PGL_EMBEDDED__ = true; w.__PGL_ISLAND__ = true; }, state().adminToken);
    await page.goto(`${COMPANION}/#/island`);
    await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click();
    const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
    await panel.getByRole("tab", { name: "Musik" }).click();
    await expect(panel.locator(".isl2-music .isl2-big")).toHaveText("Testlied", { timeout: 10_000 });
    await shot(page, "phone-music");
    await panel.getByRole("button", { name: "Am Handy weiterhören" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.join(" "))).toContain("music.youtube.com/search?q=Testlied%20Testband");
    for (const name of ["Home", "Übersicht", "JARVIS", "Fokus", "Regler", "Audio", "System", "PC"]) { await panel.getByRole("tab", { name, exact: true }).click(); await shot(page, `phone-${name}`); }
  } finally { rmSync(media, { force: true }); await ctx.close(); }
});
