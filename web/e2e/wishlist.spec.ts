// 3.68 Christmas wish list in the real web app: add links with prices, the sum, copy the link of one wish and of the whole list,
// open the shared link in a browser that has nothing (no account, no PC) and see the same list, broken or evil links are refused.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { COMPANION, HOSTED_SITE, state } from "./env";

const SHOTS = process.env.PGL_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: join(SHOTS, name + ".png") }); } };

for (const [label, viewport, mobile] of [["pc", { width: 1180, height: 860 }, false], ["handy", { width: 390, height: 844 }, true]] as const) {
  test(`Weihnachtswunschliste (${label}): Links mit Preis, Summe, Link kopieren, Liste teilen`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "de-DE", permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.addInitScript((tok) => { (window as unknown as Record<string, unknown>).__PGL_ADMIN__ = tok; }, state().adminToken);
    const page = await ctx.newPage();
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await page.goto(`${COMPANION}/#/wunschliste`);
      await expect(page.getByRole("heading", { name: "Weihnachtswunschliste" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Noch nichts auf der Liste")).toBeVisible();

      // refused: not a web link, not a price
      const url = page.getByLabel("Link zum Wunsch");
      const add = page.getByRole("button", { name: "Hinzufügen" });
      await url.fill("javascript:alert(1)");
      await expect(add).toBeDisabled();
      await url.fill("https://www.beispiel-shop.de/Sony-WH-1000XM5-Kopfhoerer/dp/B09XS7JWHH");
      await page.getByLabel("Preis in Euro (optional)").fill("abc");
      await add.click();
      await expect(page.getByText("Der Preis ist keine Zahl")).toBeVisible();

      // two wishes: one with a price, one without
      await page.getByLabel("Preis in Euro (optional)").fill("299,99");
      await add.click();
      await expect(page.getByRole("link", { name: /Sony WH 1000XM5 Kopfhoerer/ })).toBeVisible();
      await expect(page.locator(".wl-price").first()).toHaveText(/299,99\s*€/);
      await page.getByLabel("Link zum Wunsch").fill("buecher.de/lesen");
      await page.getByLabel("Titel (optional)").fill("Das Buch <b>Winter</b>");
      await add.click();
      const list = page.getByRole("list", { name: "Meine Wünsche" });
      await expect(list.locator("li")).toHaveCount(2);
      await expect(list.getByText("Das Buch <b>Winter</b>")).toBeVisible();            // shown as text, never as markup
      await expect(list.locator("li").nth(1).locator(".wl-price")).toHaveText("Preis offen");
      await expect(page.locator(".wl-total")).toContainText("2 Wünsche");
      await expect(page.locator(".wl-total")).toContainText(/299,99\s*€/);
      await expect(page.locator(".wl-total")).toContainText("1 ohne Preis nicht mitgerechnet");

      // edit the price of the second wish → the sum follows
      await page.getByRole("button", { name: /bearbeiten/ }).nth(1).click();
      await page.getByLabel("Preis in Euro", { exact: true }).fill("14,5");
      await page.getByRole("button", { name: "Speichern" }).click();
      await expect(page.locator(".wl-total")).toContainText(/314,49\s*€/);

      // copy the link of one wish
      await page.getByRole("button", { name: /Link zu „Sony WH 1000XM5 Kopfhoerer“ kopieren/ }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://www.beispiel-shop.de/Sony-WH-1000XM5-Kopfhoerer/dp/B09XS7JWHH");

      // the whole list as one link
      await page.getByLabel("Name der Liste (optional)").fill("Weihnachten 2026");
      const shareField = page.getByLabel("Link zur Liste");
      await expect(shareField).toHaveValue(/#\/w\/[zp][A-Za-z0-9_-]+$/);
      await page.getByRole("button", { name: "Link kopieren" }).click();
      const link = await page.evaluate(() => navigator.clipboard.readText());
      expect(link).toContain("/#/w/");
      expect(link).not.toMatch(/127\.0\.0\.1|localhost/);                                // never a link only this PC can open
      await shot(page, `wunschliste-${label}`);

      // stored: still there after a reload
      await page.reload();
      await expect(page.getByRole("list", { name: "Meine Wünsche" }).locator("li")).toHaveCount(2);

      // the person who gets the link: a browser with nothing at all, read-only, same list, same prices
      const other = await browser.newContext({ viewport, isMobile: mobile, locale: "de-DE", permissions: ["clipboard-read", "clipboard-write"] });
      const p2 = await other.newPage();
      const errors2: string[] = []; p2.on("pageerror", (e) => errors2.push(String(e)));
      const local = new URL(link).hash;                                                  // same code, opened on the hosted website (what the person gets the link for)
      await p2.goto(`${HOSTED_SITE}/${local}`);
      await expect(p2.getByRole("heading", { name: "Weihnachten 2026" })).toBeVisible({ timeout: 30_000 });
      const items = p2.getByRole("list", { name: "Wünsche" }).locator("li");
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText(/299,99\s*€/);
      await expect(items.nth(1)).toContainText(/14,50\s*€/);
      await expect(p2.locator(".wl-total")).toContainText(/314,49\s*€/);
      await expect(p2.getByRole("link", { name: /Sony WH/ })).toHaveAttribute("href", "https://www.beispiel-shop.de/Sony-WH-1000XM5-Kopfhoerer/dp/B09XS7JWHH");
      await expect(p2.getByRole("link", { name: /Sony WH/ })).toHaveAttribute("rel", /noopener/);
      await expect(p2.getByRole("button", { name: /entfernen|bearbeiten/ })).toHaveCount(0);   // read-only
      await shot(p2, `wunschliste-geteilt-${label}`);

      // a cut-off or invented link says so instead of showing something
      await p2.goto(`${HOSTED_SITE}/#/w/${local.split("/w/")[1].slice(0, 30)}`);
      await expect(p2.getByText("Diese Wunschliste lässt sich nicht öffnen")).toBeVisible();
      await p2.goto(`${HOSTED_SITE}/#/w/pAAAA`);
      await expect(p2.getByText("Diese Wunschliste lässt sich nicht öffnen")).toBeVisible();
      expect(errors2).toEqual([]);
      await other.close();

      // remove
      await page.getByRole("button", { name: /„Das Buch <b>Winter<\/b>“ entfernen/ }).click();
      await page.getByRole("button", { name: "Entfernen", exact: true }).click();
      await expect(page.getByRole("list", { name: "Meine Wünsche" }).locator("li")).toHaveCount(1);
      expect(errors).toEqual([]);
    } finally { await ctx.close(); }
  });
}
