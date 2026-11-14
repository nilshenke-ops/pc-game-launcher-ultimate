// Real finger swipes (Chrome's touch emulation via CDP – the browser applies touch-action and its own scrolling, unlike synthetic
// pointer events): on the overview (all cards) a sideways swipe must move to the next area, also when it starts on a card.
import { expect, test, type Page } from "@playwright/test";
import { COMPANION, state } from "./env";
import { adminRpc } from "./rpc";

async function fingerSwipe(page: Page, x: number, y: number, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (px: number) => [{ x: px, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(x) });
  for (let i = 1; i <= 12; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x + (dx * i) / 12) }); await page.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

for (const vp of [{ name: "iPad", width: 1180, height: 820 }, { name: "Handy", width: 412, height: 900 }]) {
  test(`Echtes Wischen auf der Übersicht (${vp.name}): von einer Kachel aus zum nächsten Bereich und zurück`, async ({ browser }) => {
    test.setTimeout(120_000);
    await adminRpc("island.configure", { look: { resetLayout: true, effect: "none", accent: "default" } });
    await adminRpc("island.configure", { look: { layout: { tabs: ["home", "dash", "music", "jarvis", "focus"] } } });
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: vp.name === "Handy", locale: "de-DE" });
    const page = await ctx.newPage();
    try {
      await page.addInitScript((tok) => { (window as unknown as Record<string, unknown>).__PGL_ADMIN__ = tok; }, state().adminToken);
      await page.goto(`${COMPANION}/#/games`);
      await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click({ timeout: 30_000 });
      const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
      await panel.getByRole("tab", { name: "Übersicht" }).click();
      await expect(panel.getByRole("tab", { name: "Übersicht" })).toHaveAttribute("aria-selected", "true");
      await page.waitForTimeout(500);
      for (const [i, sel] of [".isl3-dash > *:nth-child(1)", ".isl3-dash > *:nth-child(3)", ".isl3-dash > *:nth-child(4)"].entries()) {
        const b = (await panel.locator(sel).boundingBox())!;
        await fingerSwipe(page, b.x + b.width * 0.7, b.y + b.height / 2, -Math.min(260, b.width * 0.9));
        await expect(panel.getByRole("tab", { name: "Musik" }), `Wischen von Kachel ${i + 1}`).toHaveAttribute("aria-selected", "true", { timeout: 4000 });
        await page.waitForTimeout(500);
        const body = (await panel.locator(".isl2-body").boundingBox())!;
        await fingerSwipe(page, body.x + body.width * 0.3, body.y + body.height / 2, Math.min(260, body.width * 0.6));
        await expect(panel.getByRole("tab", { name: "Übersicht" })).toHaveAttribute("aria-selected", "true", { timeout: 4000 });
        await page.waitForTimeout(500);
      }
    } finally { await ctx.close(); await adminRpc("island.configure", { look: { resetLayout: true } }).catch(() => undefined); }
  });
}
