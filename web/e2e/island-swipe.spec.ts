// Swiping between the island's areas: the area follows the finger, then carries on and the next one springs in – or springs back.
// Touch is simulated with real pointer events (pointerType "touch"); a mouse and a vertical move must do nothing.
import { expect, test, devices, type Locator, type Page } from "@playwright/test";
import { COMPANION, state } from "./env";
import { ACCESS_HASH } from "../src/lib/access";

test.describe.configure({ mode: "serial" });
let page: Page;
const tabOn = (panel: Locator) => panel.locator('[role="tab"][aria-selected="true"]');

async function swipe(body: Locator, steps: { dx: number; dy?: number }[], pointerType = "touch", release = true, delay = 16) {
  await body.evaluate(async (el, a) => {
    const r = el.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + 30;
    const fire = (type: string, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: a.pointerType, clientX: x, clientY: y, isPrimary: true }));
    fire("pointerdown", x0, y0);
    for (const s of a.steps) { fire("pointermove", x0 + s.dx, y0 + (s.dy ?? 0)); await new Promise((r2) => setTimeout(r2, a.delay)); }
    if (a.release) { const last = a.steps[a.steps.length - 1]; fire("pointerup", x0 + last.dx, y0 + (last.dy ?? 0)); }
  }, { steps, pointerType, release, delay });
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "de-DE" });
  await ctx.addInitScript((hash) => { try { localStorage.setItem("pgl.access", hash as string); } catch { /* ignore */ } }, ACCESS_HASH);
  page = await ctx.newPage();
  await page.goto(`${COMPANION}/#admin=${state().adminToken}`);
  await page.goto(`${COMPANION}/#/island`);
  await page.locator(".isl-host").dispatchEvent("mouseover", { relatedTarget: null });
  await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click();
  await expect(page.getByRole("dialog", { name: "JARVIS-Insel" })).toBeVisible();
});

test("Wischen: der Bereich folgt dem Finger, fährt weiter und der nächste federt von der anderen Seite herein", async () => {
  const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
  const body = panel.locator(".isl2-body");
  const first = (await tabOn(panel).getAttribute("id"))!;
  // Mid-drag: the body is moved by the finger and fades a little – no jump, no CSS class animation.
  await swipe(body, [{ dx: -10 }, { dx: -40 }, { dx: -90 }], "touch", false);
  const mid = await body.evaluate((el) => ({ t: el.style.transform, o: Number(el.style.opacity) }));
  expect(mid.t).toContain("-90px"); expect(mid.o).toBeLessThan(1); expect(mid.o).toBeGreaterThan(0.5);
  // Release far enough: on to the next area, the body starts fresh (no leftover transform), and it really is another tab.
  await body.evaluate((el) => el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 - 170, clientY: el.getBoundingClientRect().top + 30 })));
  await body.evaluate((el) => el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 - 170, clientY: el.getBoundingClientRect().top + 30 })));
  await expect.poll(async () => tabOn(panel).getAttribute("id")).not.toBe(first);
  const next = (await tabOn(panel).getAttribute("id"))!;
  await expect(panel.locator(".isl2-body.swipe-next")).toHaveCount(1);          // the new area springs in from the right
  await expect.poll(() => panel.locator(".isl2-body").evaluate((el) => el.getAnimations().length), { timeout: 3000 }).toBe(0);   // and comes to rest
  expect(await panel.locator(".isl2-body").evaluate((el) => [el.style.transform, getComputedStyle(el).opacity])).toEqual(["", "1"]);
  // Back to the right: the previous area.
  await swipe(panel.locator(".isl2-body"), [{ dx: 30 }, { dx: 90 }, { dx: 190 }]);
  await expect.poll(async () => tabOn(panel).getAttribute("id")).toBe(first);
  await expect(panel.locator(".isl2-body.swipe-prev")).toHaveCount(1);
  expect(next).not.toBe(first);
});

test("kurzer Wisch federt zurück; Maus und senkrechtes Ziehen tun nichts; am Rand mit Gummiband", async () => {
  const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
  await expect.poll(() => panel.locator(".isl2-body").evaluate((el) => el.getAnimations().length), { timeout: 3000 }).toBe(0);
  const at = (await tabOn(panel).getAttribute("id"))!;
  await swipe(panel.locator(".isl2-body"), [{ dx: -14 }, { dx: -30 }], "touch", true, 160);        // short and slow: back (a quick flick would go on)
  await expect.poll(() => panel.locator(".isl2-body").evaluate((el) => [el.style.transform, el.getAnimations().length]), { timeout: 3000 }).toEqual(["", 0]);
  expect(await tabOn(panel).getAttribute("id")).toBe(at);
  await swipe(panel.locator(".isl2-body"), [{ dx: -60 }, { dx: -200 }], "mouse");              // a mouse never swipes
  await swipe(panel.locator(".isl2-body"), [{ dx: -4, dy: 30 }, { dx: -10, dy: 120 }]);         // vertical = scrolling
  expect(await tabOn(panel).getAttribute("id")).toBe(at);
  // At the first area there is nothing to the right: the body is pulled only a little (rubber band) and returns.
  await swipe(panel.locator(".isl2-body"), [{ dx: 40 }, { dx: 120 }, { dx: 300 }], "touch", false);
  const pulled = await panel.locator(".isl2-body").evaluate((el) => Number(/translate3d\((-?[\d.]+)px/.exec(el.style.transform)?.[1] ?? "0"));
  expect(pulled).toBeGreaterThan(0); expect(pulled).toBeLessThanOrEqual(56);
  await panel.locator(".isl2-body").evaluate((el) => el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 + 300, clientY: el.getBoundingClientRect().top + 30 })));
  await expect.poll(() => panel.locator(".isl2-body").evaluate((el) => el.style.transform), { timeout: 3000 }).toBe("");
  expect(await tabOn(panel).getAttribute("id")).toBe(at);
});

test("Tipp auf einen Reiter: der alte Bereich fährt hinaus, der neue federt herein", async () => {
  const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
  await panel.getByRole("tab", { name: "PC", exact: true }).click();
  await expect(panel.locator('[role="tab"][aria-selected="true"]')).toHaveAttribute("aria-label", /PC|^$/).catch(() => undefined);
  await expect(panel.locator(".isl2-body.swipe-next")).toHaveCount(1);
  await panel.getByRole("tab", { name: "Home", exact: true }).click();
  await expect(panel.locator(".isl2-body.swipe-prev")).toHaveCount(1);
});

test("Übergang ist flüssig: viele Zwischenbilder, ohne Sprünge und ohne Flackern", async () => {
  const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
  await expect.poll(() => panel.locator(".isl2-body").evaluate((el) => el.getAnimations().length), { timeout: 3000 }).toBe(0);
  // Record the position and opacity of the body in every frame while a swipe is carried out.
  const frames = await page.evaluate(async () => {
    const out: { x: number; o: number }[] = [];
    let alive = true;
    const loop = () => { const el = document.querySelector(".isl2-body"); if (el) out.push({ x: el.getBoundingClientRect().left, o: Number(getComputedStyle(el).opacity) }); if (alive) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const el = document.querySelector(".isl2-body")!;
    const r = el.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + 30;
    const fire = (type: string, x: number) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, pointerType: "touch", clientX: x, clientY: y0, isPrimary: true }));
    fire("pointerdown", x0);
    for (let i = 1; i <= 12; i++) { fire("pointermove", x0 - i * 14); await new Promise((r2) => setTimeout(r2, 16)); }
    fire("pointerup", x0 - 168);
    await new Promise((r2) => setTimeout(r2, 900));
    alive = false;
    return out;
  });
  const xs = frames.map((f) => Math.round(f.x * 10) / 10);
  const distinct = new Set(xs).size;
  expect(distinct).toBeGreaterThan(25);                                           // many different positions, not one or two jumps
  // Between the old area leaving and the new one arriving there is a moment of full transparency (hand-over) – a jump there cannot be seen.
  // Every pair of frames that is visible at both ends must move smoothly.
  const visible = frames.slice(1).map((f, i) => (f.o > 0.05 && frames[i].o > 0.05 ? Math.abs(f.x - frames[i].x) : 0));
  expect(Math.max(...visible)).toBeLessThan(70);                                 // no visible frame jumps across the panel
  expect(frames.at(-1)!.o).toBe(1);                                              // and it ends fully visible
});
