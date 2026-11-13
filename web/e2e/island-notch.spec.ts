// The island's newer areas (3.55): tab strip on top, overview, quick controls, system tiles and the download notice – against the real
// headless companion (its controls live in memory there: PGL_TEST_CONTROLS=1, so nothing on the test machine changes).
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
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
  await expect(panel.locator(".isl3-stat")).toHaveCount(6);
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
