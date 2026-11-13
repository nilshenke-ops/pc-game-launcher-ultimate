import { expect, test, type Page } from "@playwright/test";
import { COMPANION, state } from "./env";
test.skip(!process.env.PGL_DIAG, "diag");
async function anims(page: Page) {
  return page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => {
    const e = a.effect as KeyframeEffect | null; const t = e?.target as Element | null;
    const props = [...new Set((e?.getKeyframes() ?? []).flatMap((k) => Object.keys(k).filter((x) => !["offset", "computedOffset", "easing", "composite"].includes(x))))];
    return `${(a as CSSAnimation).animationName ?? "?"} @${t && typeof t.className === "string" ? t.className.slice(0, 40) : t?.tagName} [${props}] x${e?.getTiming().iterations}`;
  }));
}
test("diag", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript((tok) => { (window as any).__PGL_ADMIN__ = tok; (window as any).__PGL_EMBEDDED__ = true; }, state().adminToken);
  await p.goto(`${COMPANION}/#/`); await expect(p.getByRole("heading", { name: "Gaming-Zentrale", exact: true })).toBeVisible({ timeout: 20000 }); await p.waitForTimeout(40000);
  console.log("HOME after 40s:\n " + (await anims(p)).join("\n "));
  const i = await ctx.newPage();
  await i.addInitScript((tok) => { (window as any).__PGL_ADMIN__ = tok; (window as any).__PGL_EMBEDDED__ = true; (window as any).__PGL_ISLAND__ = true; }, state().adminToken);
  await i.setViewportSize({ width: 620, height: 420 });
  await i.goto(`${COMPANION}/#/island`); await i.waitForTimeout(2500);
  await i.getByRole("button", { name: "JARVIS-Insel öffnen" }).click(); await i.waitForTimeout(6000);
  console.log("ISLAND-OPEN:\n " + (await anims(i)).join("\n "));
});
