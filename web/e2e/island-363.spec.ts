// Island 3.63 against the real headless companion: new areas (Werkzeuge, Weltzeit, Listen), new tiles, page views and sorting, the
// "…" menu and the editing windows that open big and scroll in the app (iPad size), timer and stopwatch in one colour family.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { COMPANION, state } from "./env";
import { adminRpc } from "./rpc";

const SHOTS = process.env.PGL_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: join(SHOTS, name + ".png") }); } };
type LayoutResp = { look: { effect: string; layout: { home: { type: string; opts?: Record<string, unknown> }[]; dash: { type: string }[]; tabs?: string[]; view?: Record<string, string> } | null } };
const layout = async () => (await adminRpc<LayoutResp>("island.get")).look.layout;
const resetLayout = () => adminRpc("island.configure", { look: { resetLayout: true, effect: "none", accent: "default" } });

async function islandWindow(page: Page) {
  await page.addInitScript((tok) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; w.__PGL_EMBEDDED__ = true; w.__PGL_ISLAND__ = true; }, state().adminToken);
  await page.setViewportSize({ width: 620, height: 380 });
  await page.goto(`${COMPANION}/#/island`);
  await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click();
  const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
  await expect(panel).toBeVisible();
  return panel;
}

test("Insel 3.63: neue Bereiche einschalten und benutzen, neue Kacheln, Ansicht und Sortieren – am PC gespeichert", async ({ browser }) => {
  test.setTimeout(150_000);
  await resetLayout();
  const ctx = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE" });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
  try {
    const panel = await islandWindow(page);
    // switch the three new areas on
    await panel.getByRole("button", { name: "Mehr" }).click();
    await panel.getByRole("menuitem", { name: "Bereiche anpassen" }).click();
    const areas = panel.getByRole("dialog", { name: "Bereiche in der Leiste" });
    for (const n of ["Werkzeuge", "Weltzeit", "Listen"]) await areas.getByRole("switch", { name: `${n} in der Leiste` }).check();
    await expect.poll(async () => (await layout())?.tabs?.slice(-3).join(","), { timeout: 8000 }).toBe("tools,world,lists");
    await areas.getByRole("button", { name: "Schließen" }).click();
    // Werkzeuge: roll the die, count
    await panel.getByRole("tab", { name: "Werkzeuge" }).click();
    await panel.getByRole("button", { name: "Los" }).click();
    await expect(panel.locator(".isl3-area.tools .isl3-dice")).toHaveText(/^[1-6]$/);
    await panel.getByRole("button", { name: "Zähler erhöhen" }).click();
    await panel.getByRole("button", { name: "Zähler erhöhen" }).click();
    await expect(panel.locator(".isl3-area.tools .isl3-count")).toHaveText("2");
    await shot(page, "isl363-tools");
    // Weltzeit: four cities, add one
    await panel.getByRole("tab", { name: "Weltzeit" }).click();
    await expect(panel.locator(".wclock")).toHaveCount(4);
    await panel.getByRole("button", { name: "Stadt hinzufügen" }).click();
    await panel.getByLabel("Stadt", { exact: true }).selectOption("Australia/Sydney");
    await expect(panel.locator(".wclock")).toHaveCount(5);
    await shot(page, "isl363-world");
    // Listen: add an entry and tick it
    await panel.getByRole("tab", { name: "Listen" }).click();
    await panel.getByLabel("Neuer Eintrag in To-do").fill("Controller laden");
    await panel.getByLabel("Neuer Eintrag in To-do").press("Enter");
    await panel.getByRole("checkbox", { name: "Controller laden" }).check();
    await expect(panel.getByText("Controller laden")).toHaveClass(/done/);

    // new tile from the catalog: only the new ones, the counter
    await panel.getByRole("tab", { name: "Home" }).click();
    await panel.getByRole("button", { name: "Startseite bearbeiten" }).click();
    await panel.getByRole("button", { name: "Kachel hinzufügen" }).click();
    const cat = panel.getByRole("dialog", { name: "Kachel hinzufügen" });
    await cat.getByRole("radio", { name: "Neu" }).click();
    await expect(cat.getByRole("listitem")).toHaveCount(8);
    await cat.getByLabel("Kachel suchen").fill("zähl");
    await cat.getByRole("listitem", { name: "Zähler hinzufügen" }).click();
    await panel.getByRole("button", { name: "Fertig" }).click();
    const counter = panel.getByRole("region", { name: "Zähler" });
    await counter.getByRole("button", { name: "Zähler erhöhen" }).click();
    await counter.getByRole("button", { name: "Zähler erhöhen" }).click();
    await counter.getByRole("button", { name: "Zähler erhöhen" }).click();
    await expect.poll(async () => (await layout())?.home.find((x) => x.type === "counter")?.opts?.value, { timeout: 8000 }).toBe(3);

    // view: list, then sort A–Z
    await panel.getByRole("button", { name: "Mehr" }).click();
    await panel.getByRole("menuitem", { name: "Ansicht & Sortieren" }).click();
    const vs = panel.getByRole("dialog", { name: "Startseite: Ansicht & Sortieren" });
    await vs.getByRole("radio", { name: /Liste/ }).click();
    await expect(panel.locator(".isl2-cards.view-list")).toHaveCount(1);
    await vs.getByRole("button", { name: "A–Z", exact: true }).click();
    const LABEL: Record<string, string> = { jarvis: "JARVIS", game: "Spiel", counter: "Zähler", focus: "Fokus-Timer", music: "Musik" };
    await expect.poll(async () => { const names = (await layout())?.home.map((x) => LABEL[x.type]) ?? []; return names.join(",") === [...names].sort((a, b) => a.localeCompare(b, "de")).join(",") && names.includes("Zähler"); }, { timeout: 8000 }).toBe(true);
    expect((await layout())?.view?.home).toBe("list");
    await vs.getByRole("button", { name: "Schließen" }).click();
    await shot(page, "isl363-list");
    expect(errors).toEqual([]);
  } finally { await resetLayout(); await ctx.close(); }
});

test("Insel in der App (iPad): Menü und Bearbeiten-Fenster sind ganz sichtbar und scrollbar, Timer und Stoppuhr in einer Farbe", async ({ browser }) => {
  test.setTimeout(120_000);
  await resetLayout();
  await adminRpc("island.configure", { look: { widgets: ["game", "clock", "music", "focus", "stopwatch", "stats"] } });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true, locale: "de-DE" });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.addInitScript((tok) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; }, state().adminToken);
    await page.goto(`${COMPANION}/#/games`);
    await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click({ timeout: 30_000 });
    const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
    await expect(panel).toBeVisible();
    // the menu fits on the screen: its last entry can be reached
    await panel.getByRole("button", { name: "Mehr" }).click();
    const menu = page.getByRole("menu");
    const last = menu.getByRole("menuitem", { name: "Schließen" });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    const box = await menu.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(820);
    await shot(page, "isl363-menu");
    // "Bereiche anpassen" opens big over the page (not squeezed into the island), every area can be reached
    await menu.getByRole("menuitem", { name: "Bereiche anpassen" }).click();
    const sheet = page.getByRole("dialog", { name: "Bereiche in der Leiste" });
    await expect(sheet).toHaveClass(/modal/);
    const sb = await sheet.boundingBox();
    expect(sb!.height).toBeGreaterThan(400);
    const lastArea = sheet.getByRole("switch", { name: "Listen in der Leiste" });
    await lastArea.scrollIntoViewIfNeeded();
    await expect(lastArea).toBeInViewport();
    await shot(page, "isl363-areas");
    await sheet.getByRole("button", { name: "Schließen" }).click();
    // catalog: big, with search and kinds
    await panel.getByRole("button", { name: "Mehr" }).click();
    await page.getByRole("menuitem", { name: "Kachel hinzufügen" }).click();
    const cat = page.getByRole("dialog", { name: "Kachel hinzufügen" });
    await expect(cat).toHaveClass(/modal/);
    await expect(cat.getByRole("radio", { name: "Werkzeuge" })).toBeVisible();
    await shot(page, "isl363-catalog");
    await page.locator(".isl3-backdrop").click({ position: { x: 5, y: 5 } }); // a tap beside it closes
    await expect(cat).toHaveCount(0);
    // focus area: timer and stopwatch share the island's colour family
    await panel.getByRole("tab", { name: "Fokus" }).click();
    const bgT = await panel.locator(".isl2-tcard").evaluate((e) => getComputedStyle(e).backgroundImage);
    const bgS = await panel.locator(".isl3-swcard").evaluate((e) => getComputedStyle(e).backgroundImage);
    expect(bgT).toBe(bgS);
    await shot(page, "isl363-focus");
    expect(errors).toEqual([]);
  } finally {
    await resetLayout();
    await adminRpc("island.configure", { look: { widgets: ["game", "clock", "music", "focus", "stats"] } });
    await ctx.close();
  }
});
