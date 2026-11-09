// The sidebar highlight glides to the new entry (one element, a spring), groups fold softly, and a dialog grows out of the spot that was tapped.
import { expect, test, type Page } from "@playwright/test";
import { COMPANION, state } from "./env";
import { ACCESS_HASH } from "../src/lib/access";

test.describe.configure({ mode: "serial" });
let page: Page;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "de-DE" });
  await ctx.addInitScript((hash) => { try { localStorage.setItem("pgl.access", hash as string); } catch { /* ignore */ } }, ACCESS_HASH);
  page = await ctx.newPage();
  await page.goto(`${COMPANION}/#admin=${state().adminToken}`);
  await page.goto(`${COMPANION}/#/`);
  await expect(page.locator(".mn-link.active")).toBeVisible();
});

test("Seitenleiste: die Markierung gleitet zum neuen Eintrag, ohne zu springen", async () => {
  const pillRect = () => page.locator(".mn-pill").evaluate((el) => { const r = el.getBoundingClientRect(); return { y: r.top, h: r.height, o: getComputedStyle(el).opacity }; });
  const linkRect = () => page.locator(".mn-link.active").evaluate((el) => { const r = el.getBoundingClientRect(); return { y: r.top, h: r.height }; });
  await expect.poll(async () => Math.abs((await pillRect()).y - (await linkRect()).y), { timeout: 3000 }).toBeLessThan(2);   // at rest it sits exactly on the active entry
  const before = (await pillRect()).y;
  // record the pill's position in every frame while another entry is opened
  await page.evaluate(() => { (window as unknown as { __ys: number[] }).__ys = []; const loop = () => { const el = document.querySelector(".mn-pill"); if (el) (window as unknown as { __ys: number[] }).__ys.push(el.getBoundingClientRect().top); (window as unknown as { __raf: number }).__raf = requestAnimationFrame(loop); }; loop(); });
  await page.locator(".mn-link", { hasText: "Einstellungen" }).first().click();
  await page.waitForTimeout(900);
  const ys: number[] = await page.evaluate(() => { cancelAnimationFrame((window as unknown as { __raf: number }).__raf); return (window as unknown as { __ys: number[] }).__ys; });
  const after = (await pillRect()).y;
  expect(Math.abs(after - before)).toBeGreaterThan(40);                                    // it really moved
  expect(Math.abs(after - (await linkRect()).y)).toBeLessThan(2);                          // and landed on the new entry
  expect(new Set(ys.map((y) => Math.round(y))).size).toBeGreaterThan(8);                   // through many positions – a glide, not a jump
  const moved = ys.filter((y) => y > Math.min(before, after) + 1 && y < Math.max(before, after) - 1);
  expect(moved.length).toBeGreaterThan(5);
});

test("Dialog wächst dort auf, wo getippt wurde", async () => {
  await page.goto(`${COMPANION}/#/`);
  const btn = page.locator(".account-btn");
  await expect(btn).toBeVisible();
  const box = (await btn.boundingBox())!;
  await btn.click();
  const modal = page.locator(".modal");
  await expect(modal).toBeVisible();
  const origin = await modal.evaluate((el) => ({ cls: el.className, o: (el as HTMLElement).style.transformOrigin }));
  expect(origin.cls).toContain("from-tap");
  expect(origin.o).toMatch(/px/);
  expect(box.width).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});

test("Profil: Konto-Seite ist unter /profile, /cloud leitet dorthin um", async () => {
  await page.goto(`${COMPANION}/#/cloud`);
  await expect(page).toHaveURL(/#\/profile$/);
  await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();
  await expect(page.getByText("Android-App")).toHaveCount(0);                              // the APK card lives under Updates now
  await page.goto(`${COMPANION}/#/updates`);
  await expect(page.getByText("APK herunterladen").first()).toBeVisible();
});
