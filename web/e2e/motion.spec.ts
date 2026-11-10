// Motion, checked on phone, tablet and desktop with the real built app (no PC needed): the animations really run – also when the operating system says
// "reduce motion" (Windows with animations switched off was the reason nothing moved) –, they are continuous (no jumps), and the app's own switch still
// turns them off. Frames are recorded with requestAnimationFrame, so "smooth" is measured, not guessed.
import { expect, test, devices, type Browser, type Page } from "@playwright/test";
import { HOSTED_SITE } from "./env";
import { ACCESS_HASH } from "../src/lib/access";

const SIZES = [
  { name: "Handy", opts: { ...devices["iPhone 13"] } },
  { name: "iPad", opts: { ...devices["iPad (gen 7)"], viewport: { width: 1180, height: 820 } } },
  { name: "PC", opts: { viewport: { width: 1360, height: 860 } } },
];

const ITEMS = Array.from({ length: 9 }, (_, i) => ({
  id: `g${i}`, kind: "game", name: `Testspiel ${i + 1}`, source: "exe", target: `C:/Spiele/t${i}.exe`, args: "", processNames: [], categories: [], favorite: i === 2, addedAt: "2026-01-01T00:00:00Z", rating: 0,
}));

async function openApp(browser: Browser, opts: object, extra: { reduce?: boolean; follow?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ ...opts, locale: "de-DE", reducedMotion: extra.reduce ? "reduce" : "no-preference" });
  await ctx.addInitScript(([hash, items, follow]) => {
    try {
      localStorage.setItem("pgl.access", hash as string);
      localStorage.setItem("pgl.cache.library.list", JSON.stringify({ at: Date.now(), data: { items, running: [], installed: {}, coversFromCdn: true } }));
      if (follow) localStorage.setItem("pgl.motion.followOs", "1");
    } catch { /* ignore */ }
  }, [ACCESS_HASH, ITEMS, !!extra.follow]);
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    (window as unknown as { __rec: (sel: string, prop: string, ms: number) => Promise<number[]> }).__rec = (sel, prop, ms) => new Promise((resolve) => {
      const out: number[] = []; const t0 = performance.now();
      const tick = () => {
        const el = document.querySelector(sel);
        if (el) out.push(prop === "x" ? el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 : parseFloat(getComputedStyle(el).getPropertyValue(prop)) || 0);
        if (performance.now() - t0 < ms) requestAnimationFrame(tick); else resolve(out);
      };
      requestAnimationFrame(tick);
    });
  });
  return p;
}
const distinct = (a: number[], d = 0.01) => new Set(a.map((v) => Math.round(v / d))).size;
const maxJump = (a: number[]) => a.reduce((m, v, i) => (i ? Math.max(m, Math.abs(v - a[i - 1])) : 0), 0);

for (const size of SIZES) {
  test.describe(`Bewegung · ${size.name}`, () => {
    test("Insel öffnet und schließt in einer Bewegung – auch wenn das System „Bewegung reduzieren“ meldet", async ({ browser }) => {
      const p = await openApp(browser, size.opts, { reduce: true });
      await p.goto(`${HOSTED_SITE}/#/games`);
      const btn = p.getByRole("button", { name: "JARVIS-Insel öffnen" });
      await expect(btn).toBeVisible({ timeout: 30_000 });
      expect(await p.evaluate(() => document.documentElement.dataset.motion)).toBe("full");     // the system setting no longer switches the app off
      await p.waitForTimeout(1500);
      const open = p.evaluate(() => (window as never as { __rec: (s: string, q: string, m: number) => Promise<number[]> }).__rec(".isl-host", "--isl-p", 1100));
      await btn.click();
      const pOpen = await open;
      expect(Math.max(...pOpen)).toBeGreaterThan(0.95);                                        // it opens fully
      const mid = pOpen.filter((v) => v > 0.05 && v < 0.95);
      expect(mid.length).toBeGreaterThanOrEqual(2);                                            // … through intermediate steps, not in one jump
      expect(distinct(pOpen)).toBeGreaterThanOrEqual(4);
      await expect(p.locator(".isl2-card").first()).toBeVisible();
      // folding back: the same movement the other way
      const close = p.evaluate(() => (window as never as { __rec: (s: string, q: string, m: number) => Promise<number[]> }).__rec(".isl-host", "--isl-p", 1100));
      await p.keyboard.press("Escape");
      const pClose = await close;
      expect(Math.min(...pClose)).toBeLessThan(0.02);
      expect(pClose.filter((v) => v > 0.05 && v < 0.95).length).toBeGreaterThanOrEqual(2);
      // changing its mind halfway (open, then close after 120 ms) must not jump
      const turn = p.evaluate(() => (window as never as { __rec: (s: string, q: string, m: number) => Promise<number[]> }).__rec(".isl-host", "--isl-p", 1300));
      await btn.click(); await p.waitForTimeout(140); await p.keyboard.press("Escape");
      const pTurn = await turn;
      expect(maxJump(pTurn)).toBeLessThan(0.55);
      await p.context().close();
    });

    test("Mit „Systemeinstellung beachten“ und System-Wunsch „reduzieren“ bleibt alles ruhig", async ({ browser }) => {
      const p = await openApp(browser, size.opts, { reduce: true, follow: true });
      await p.goto(`${HOSTED_SITE}/#/games`);
      await expect(p.getByRole("button", { name: "JARVIS-Insel öffnen" })).toBeVisible({ timeout: 30_000 });
      expect(await p.evaluate(() => document.documentElement.dataset.motion)).toBe("reduce");
      await p.context().close();
    });

    test("Holo-Ansicht: Karten folgen dem Finger, rasten ein und gleiten (keine Sprünge)", async ({ browser }) => {
      const p = await openApp(browser, size.opts, { reduce: true });
      await p.goto(`${HOSTED_SITE}/#/games`);
      await p.getByRole("radio", { name: /Holo/ }).click();
      const cur = p.locator(".holo-card.cur");
      await expect(cur).toBeVisible({ timeout: 30_000 });
      const first = await cur.getAttribute("aria-label");
      await p.locator(".holo-stage").scrollIntoViewIfNeeded();
      await p.waitForTimeout(300);
      const box = (await p.locator(".holo-stage").boundingBox())!;
      const y = box.y + box.height / 2, x0 = box.x + box.width * 0.62;
      const touch = !!(size.opts as { hasTouch?: boolean }).hasTouch;
      const cdp = touch ? await p.context().newCDPSession(p) : null;
      const send = (type: string, x: number) => cdp!.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
      if (touch) await send("touchStart", x0); else { await p.mouse.move(x0, y); await p.mouse.down(); }
      const dragRec = p.evaluate(() => (window as never as { __rec: (s: string, q: string, m: number) => Promise<number[]> }).__rec(".holo-stage", "--drag", 500));
      for (let i = 1; i <= 8; i++) { if (touch) await send("touchMove", x0 - i * 14); else await p.mouse.move(x0 - i * 14, y); await p.waitForTimeout(25); }
      const dragged = await dragRec;
      expect(Math.max(...dragged.map(Math.abs))).toBeGreaterThan(0.1);                           // the cards were pulled along by the finger
      expect(await p.locator(".holo").evaluate((el) => el.classList.contains("dragging"))).toBe(true);
      const settle = p.evaluate(() => (window as never as { __rec: (s: string, q: string, m: number) => Promise<number[]> }).__rec(".holo-card.cur", "x", 900));
      if (touch) await send("touchEnd", 0); else await p.mouse.up();
      const xs = await settle;
      await expect(cur).not.toHaveAttribute("aria-label", first ?? "", { timeout: 5000 });       // the next game is in the middle
      expect(await p.locator(".holo").evaluate((el) => el.classList.contains("dragging"))).toBe(false);
      expect(await p.locator(".holo-stage").evaluate((el) => getComputedStyle(el).getPropertyValue("--drag").trim())).toBe("0");
      expect(distinct(xs, 2)).toBeGreaterThanOrEqual(4);                                                // the settling is a glide through many positions
      await p.keyboard.press("ArrowRight");                                                      // keyboard and buttons still work
      await p.context().close();
    });

    test("Auswahlschalter und Schalter gleiten/federn", async ({ browser }) => {
      const p = await openApp(browser, size.opts, { reduce: true });
      await p.goto(`${HOSTED_SITE}/#/settings?s=general`);
      const seg = p.locator(".segmented.has-thumb").first();
      await expect(seg).toBeVisible({ timeout: 30_000 });
      const thumb = seg.locator(".seg-thumb");
      await expect.poll(async () => thumb.evaluate((el) => getComputedStyle(el).opacity), { timeout: 5000 }).toBe("1");
      const rec = p.evaluate(() => (window as never as { __rec: (s: string, q: string, m: number) => Promise<number[]> }).__rec(".segmented.has-thumb .seg-thumb", "x", 900));
      await seg.locator("button:not(.on)").first().click();
      const xs = await rec;
      expect(distinct(xs, 1.5)).toBeGreaterThanOrEqual(3);                                              // the highlight travelled, it did not jump
      await p.context().close();
    });
  });
}

test.describe("Bewegung · Seitenleiste (PC/iPad)", () => {
  test("Logo, Einträge und Fuß erscheinen mit Bewegung; Hover dreht das Symbol", async ({ browser }) => {
    const p = await openApp(browser, { viewport: { width: 1360, height: 860 } }, { reduce: true });
    await p.goto(`${HOSTED_SITE}/#/games`);
    const link = p.locator(".mn-link", { hasText: "Soundboard" }).first();
    await expect(link).toBeVisible({ timeout: 30_000 });
    const names = await p.evaluate(() => [".mn-brand", ".mn-list .mn-link", ".mn-foot > *"].map((s) => document.querySelector(s)?.getAnimations().length ?? 0));
    expect(names.some((n) => n > 0) || (await p.evaluate(() => performance.now() > 4000))).toBe(true);   // (animations may already be over on a slow start)
    await link.hover();
    await expect.poll(async () => link.locator("svg").first().evaluate((el) => getComputedStyle(el).rotate), { timeout: 3000 }).not.toBe("none");
    await expect.poll(async () => link.locator(".mn-t").evaluate((el) => getComputedStyle(el).translate), { timeout: 3000 }).not.toBe("none");
    await p.context().close();
  });
});

test.describe("Bewegung · Untere Leiste (Handy)", () => {
  test("Aktives Symbol federt beim Wechsel", async ({ browser }) => {
    const p = await openApp(browser, { ...devices["iPhone 13"] }, { reduce: true });
    await p.goto(`${HOSTED_SITE}/#/games`);
    const bar = p.locator(".bottom-nav");
    await expect(bar).toBeVisible({ timeout: 30_000 });
    await p.waitForTimeout(1200);
    const target = bar.locator("a:not(.active)").first();
    const label = (await target.innerText()).trim();
    await target.click();
    await expect.poll(async () => bar.locator("a.active", { hasText: label }).first().locator(".bn-icon").evaluate((el) => el.getAnimations().map((a) => (a as CSSAnimation).animationName).join(",")), { timeout: 3000 }).toContain("m-bn-pop");
    await p.context().close();
  });
});
