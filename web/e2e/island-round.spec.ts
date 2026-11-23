// 3.67.2: round buttons stay round and square ones square on phone, iPad and PC (touch screens gave them a min-height but not the width → ovals).
import { expect, test } from "@playwright/test";
import { COMPANION, state } from "./env";
import { adminRpc } from "./rpc";
for (const vp of [{ n: "phone", w: 412, h: 900, m: true }, { n: "ipad", w: 1180, h: 820, m: false }, { n: "pc", w: 1600, h: 900, m: false }]) {
  test(`Insel: runde Knöpfe bleiben rund (${vp.n})`, async ({ browser }) => {
    await adminRpc("island.configure", { look: { resetLayout: true, effect: "none", accent: "default", layout: { tabs: ["home", "dash", "music", "focus", "system", "controls"] } } });
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.n !== "pc", locale: "de-DE" });
    const page = await ctx.newPage();
    await page.addInitScript((tok) => { (window as unknown as Record<string, unknown>).__PGL_ADMIN__ = tok; }, state().adminToken);
    await page.goto(`${COMPANION}/#/games`);
    await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click({ timeout: 30_000 });
    const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
    const bad: string[] = [];
    for (const tab of ["Home", "Übersicht", "Musik", "Fokus", "System", "Regler"]) {
      await panel.getByRole("tab", { name: tab }).click(); await page.waitForTimeout(700);
      bad.push(...await page.evaluate((tab) => [...document.querySelectorAll(".isl2 *")].flatMap((e) => {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || cs.display === "none" || cs.visibility === "hidden") return [];
        const round = cs.borderRadius === "50%" || (parseFloat(cs.borderTopLeftRadius) >= Math.min(r.width, r.height) / 2 - 0.5 && e.tagName === "BUTTON" && Math.abs(r.width - r.height) < 30 && r.width < 70);
        return round && Math.abs(r.width - r.height) > 1.5 ? [`${tab}: ${e.tagName}.${(e as HTMLElement).className.toString().slice(0, 40)} in ${(e.parentElement?.className ?? '').toString().slice(0, 40)} [${e.getAttribute('aria-label') ?? ''}] ${Math.round(r.width)}×${Math.round(r.height)}`] : [];
      }), tab));
    }
    console.log(vp.n, JSON.stringify([...new Set(bad)]));
    expect([...new Set(bad)]).toEqual([]);
    await ctx.close();
  });
}
