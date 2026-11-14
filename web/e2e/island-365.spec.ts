// 3.65 – the island on a phone, against the real headless companion: the pencil stays visible with many areas, the edit buttons sit under
// each tile (never over it or the next row), swiping works when the finger starts on a card, and the weather place is kept.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";
import { COMPANION, state } from "./env";
import { adminRpc } from "./rpc";

const SHOTS = process.env.PGL_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: join(SHOTS, name + ".png") }); } };
type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** A finger moving sideways over an element (pointer events as a touch screen sends them). */
async function swipe(el: Locator, dx: number) {
  await el.evaluate((node, dx) => {
    const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (type: string, cx: number) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: cx, clientY: y }));
    ev("pointerdown", x);
    for (let i = 1; i <= 8; i++) ev("pointermove", x + (dx * i) / 8);
    ev("pointerup", x + dx);
  }, dx);
}

test("Insel am Handy: Stift sichtbar, Bearbeiten ohne Überlappung, Wischen von einer Kachel, Wetter-Ort bleibt", async ({ browser }) => {
  test.setTimeout(150_000);
  await adminRpc("island.configure", { look: { resetLayout: true, effect: "none", accent: "default" } });
  await adminRpc("island.configure", { look: { layout: { tabs: ["home", "dash", "music", "jarvis", "focus", "shelf", "apps"] } } });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE" });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.addInitScript((tok) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; }, state().adminToken);
    await page.goto(`${COMPANION}/#/games`);
    await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click({ timeout: 30_000 });
    const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("tab")).toHaveCount(7);

    // the pencil and the menu keep their size and stay inside the island, even with seven areas
    const pen = panel.getByRole("button", { name: "Startseite bearbeiten" });
    const more = panel.getByRole("button", { name: "Mehr" });
    await expect(pen).toBeInViewport({ ratio: 1 });
    const pb = (await pen.boundingBox())!, mb = (await more.boundingBox())!, panelBox = (await panel.boundingBox())!;
    expect(pb.width).toBeGreaterThanOrEqual(30);
    expect(pb.x + pb.width).toBeLessThanOrEqual(mb.x + 1);
    expect(mb.x + mb.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
    await shot(page, "isl365-head");

    // editing: every bar sits under its own tile, bars and tiles of different rows never cover each other, and the buttons work
    await pen.click();
    const wraps = panel.locator(".isl3-ew");
    const n = await wraps.count();
    expect(n).toBeGreaterThan(1);
    const boxes: Box[] = [];
    for (let i = 0; i < n; i++) {
      const tile = (await wraps.nth(i).locator(":scope > :first-child").boundingBox())!, bar = (await wraps.nth(i).locator(".isl3-ebar").boundingBox())!;
      expect(overlap(tile, bar), `Leiste ${i} liegt auf ihrer Kachel`).toBe(false);
      expect(bar.y).toBeGreaterThanOrEqual(tile.y + tile.height - 1);
      boxes.push(tile, bar);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `Teile ${i}/${j} überlappen`).toBe(false);
    const names = () => wraps.locator(".isl3-ebar button:nth-child(2)").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label")));
    const before = await names();
    await wraps.first().locator(".isl3-ebar").getByRole("button", { name: /nach hinten$/ }).click();
    await expect.poll(async () => (await names())[1], { timeout: 8000 }).toBe(before[0]);
    await shot(page, "isl365-edit");
    await panel.getByRole("button", { name: "Fertig" }).click();

    // the overview: swiping that starts ON a card moves on to the next area (the dashboard is nearly all cards)
    await panel.getByRole("tab", { name: "Übersicht" }).click();
    await expect(panel.getByRole("tab", { name: "Übersicht" })).toHaveAttribute("aria-selected", "true");
    const card = panel.locator(".isl3-dash > *").first();
    await swipe(card, -220);
    await expect(panel.getByRole("tab", { name: "Musik" })).toHaveAttribute("aria-selected", "true", { timeout: 5000 });
    await page.waitForTimeout(500);                                                       // the carousel has settled
    await swipe(panel.locator(".isl2-body"), 220);
    await expect(panel.getByRole("tab", { name: "Übersicht" })).toHaveAttribute("aria-selected", "true", { timeout: 5000 });

    // the weather place is stored the way the account keeps it (JSON) and is still there after a reload
    const place = panel.getByLabel("Ort für das Wetter");
    await expect(place).toBeVisible();
    await place.fill("Köln");
    await place.press("Enter");
    await expect(place).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("pgl.homePlace"))).toBe('"Köln"');
    await page.reload();
    await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click({ timeout: 30_000 });
    await panel.getByRole("tab", { name: "Übersicht" }).click();
    await expect(panel.getByLabel("Ort für das Wetter")).toHaveCount(0);
    await shot(page, "isl365-dash");
    // the island never slides sideways inside its frame (it did when a field got the focus)
    expect(await page.evaluate(() => { let max = 0; for (let el: HTMLElement | null = document.querySelector(".isl2-head"); el; el = el.parentElement) max = Math.max(max, el.scrollLeft); return max; })).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await adminRpc("island.configure", { look: { resetLayout: true } }).catch(() => undefined);
  }
});
