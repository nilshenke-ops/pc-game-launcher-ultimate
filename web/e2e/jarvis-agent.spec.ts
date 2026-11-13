// JARVIS 3.0 control centre (3.59) against the real headless companion: a request becomes a plan, nothing runs before the
// confirmation, only ticked steps run, the results and the history are real, and the history can be deleted.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { COMPANION, state } from "./env";
import { adminRpc } from "./rpc";

const SHOTS = process.env.PGL_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: join(SHOTS, name + ".png"), fullPage: false }); } };

async function open(page: Page, path = "/assistant") {
  await page.addInitScript((tok) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; w.__PGL_EMBEDDED__ = true; }, state().adminToken);
  await page.goto(`${COMPANION}/#${path}`);
}
async function ask(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: /Nachricht|Frage|JARVIS/ }).first();
  await box.fill(text);
  await box.press("Enter");
}

test("Plan: erst ansehen, dann nur die gewählten Schritte ausführen; Ergebnisse sind echt", async ({ browser }) => {
  const ctx = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE", viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
  await open(page);
  const before = (await adminRpc<{ activeProfileId: string }>("profiles.list")).activeProfileId;
  await ask(page, "Bereite meinen PC für eine Gaming-Session vor");
  const card = page.getByLabel("JARVIS-Auftrag").last();
  await expect(card).toBeVisible({ timeout: 20000 });
  await expect(card.getByText("Wartet auf deine Bestätigung")).toBeVisible();
  const steps = card.getByRole("list", { name: "Schritte" }).getByRole("listitem");
  await expect(steps.filter({ hasText: "PC-Zustand prüfen" })).toHaveCount(1);
  await expect(steps.filter({ hasText: "Audio prüfen" })).toHaveCount(1);
  await shot(page, "jarvis-plan");
  // Only the PC check: everything else is switched off.
  for (const name of ["Hintergrundprogramme anzeigen", "Audio prüfen", "Verbindung prüfen"]) await card.getByRole("checkbox", { name }).uncheck();
  for (const box of await card.getByRole("checkbox").all()) if ((await box.getAttribute("aria-label")) !== "PC-Zustand prüfen" && await box.isChecked()) await box.uncheck();
  await card.getByRole("button", { name: /Ausführen \(1 Schritte\)/ }).click();
  await expect(card.getByText(/^(Erledigt|Teilweise fehlgeschlagen)$/)).toBeVisible({ timeout: 30000 });
  const pcStep = steps.filter({ hasText: "PC-Zustand prüfen" });
  await expect(pcStep).toContainText(/FPS misst der PC nicht|keine Messwerte/); // honest about what is not measured
  await expect(steps.filter({ hasText: "Audio prüfen" })).toContainText("übersprungen");
  const after = (await adminRpc<{ activeProfileId: string }>("profiles.list")).activeProfileId;
  expect(after).toBe(before); // nothing outside the ticked step changed
  await shot(page, "jarvis-plan-done");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Diagnose: „Warum ruckelt mein Spiel?“ nennt gemessene Werte mit Quelle; eine Spielfrage bleibt eine Frage", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  await open(page);
  await ask(page, "Warum ruckelt mein Spiel?");
  const card = page.getByLabel("JARVIS-Auftrag").last();
  await expect(card).toBeVisible({ timeout: 20000 });
  const findings = card.getByRole("list", { name: "Befund" });
  await expect(findings.getByText("Gemessene Werte")).toBeVisible();
  await expect(findings.getByText(/Quelle: PC-Messung \(jetzt\)/).first()).toBeVisible();
  // a question about a game is not a PC diagnosis
  expect((await adminRpc<{ task?: unknown }>("jarvis.plan", { text: "Warum ist Elden Ring so schwer?" })).task).toBeUndefined();
  await ctx.close();
});

test("Verlauf: Aufträge stehen im Reiter, sind durchsuchbar und löschbar", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  await adminRpc("jarvis.plan", { text: "Warum ist meine GPU-Auslastung so hoch? Passwort: geheim42" });
  await open(page, "/assistant?tab=tasks");
  const hist = page.getByLabel("JARVIS-Verlauf");
  await expect(hist.getByText(/GPU-Auslastung/).first()).toBeVisible({ timeout: 15000 });
  await expect(hist.getByText("geheim42")).toHaveCount(0); // never in the history
  await hist.getByRole("textbox", { name: "Verlauf durchsuchen" }).fill("minecraft-gibt-es-nicht");
  await expect(hist.getByText("Noch keine Aufträge")).toBeVisible();
  await hist.getByRole("textbox", { name: "Verlauf durchsuchen" }).fill("");
  await shot(page, "jarvis-history");
  page.once("dialog", (d) => void d.accept());
  await hist.getByRole("button", { name: "Alles löschen" }).click();
  const dlg = page.getByRole("dialog");
  if (await dlg.getByRole("button", { name: "Löschen" }).isVisible().catch(() => false)) await dlg.getByRole("button", { name: "Löschen" }).click();
  await expect.poll(async () => (await adminRpc<{ total: number }>("jarvis.history")).total).toBe(0);
  await ctx.close();
});
