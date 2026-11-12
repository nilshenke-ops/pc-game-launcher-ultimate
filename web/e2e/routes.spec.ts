// Every page opens by its link – not only once: each route is opened directly, reloaded, and opened again from another page.
// Twice over: on the hosted website without any PC (what a phone sees first) and in the PC app (signed in as the PC itself).
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { COMPANION, HOSTED_SITE, state } from "./env";
import { ACCESS_HASH } from "../src/lib/access";

// The routes of the app, read from the router itself, so a new page is covered automatically.
const ROUTES = [...readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8").matchAll(/path="(\/[a-z-]*)"/g)].map((m) => m[1]).filter((r, i, a) => a.indexOf(r) === i && r !== "/desktop-widget");
test.setTimeout(600_000);

async function sweep(page: Page, base: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const bad: string[] = [];
  const check = async (route: string, how: string) => {
    // The page is there: the app shell rendered something and no part of it fell back to the error card.
    await expect(page.locator("#root")).not.toBeEmpty({ timeout: 20_000 });
    await page.waitForTimeout(250);
    const broken = await page.getByText(/Dieser Bereich konnte nicht geladen werden|Etwas ist schiefgelaufen/).count();
    const text = (await page.locator("#root").innerText()).trim();
    if (broken || text.length < 20) bad.push(`${route} (${how})`);
  };
  for (const route of ROUTES) {
    await page.goto(`${base}/#${route}`); await check(route, "Link");
    await page.reload(); await check(route, "neu geladen");
  }
  // and once more in a row without a fresh start in between (what tapping links does)
  for (const route of ROUTES) { await page.evaluate((r) => { location.hash = "#" + r; }, route); await check(route, "zweites Mal"); }
  expect(bad, "Seiten, die sich nicht öffnen ließen").toEqual([]);
  expect(errors, "Fehler im Browser").toEqual([]);
}

test(`Website ohne PC: alle ${ROUTES.length} Seiten öffnen sich per Link, nach Neuladen und beim zweiten Mal`, async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 420, height: 900 } });
  await ctx.addInitScript((hash) => { try { localStorage.setItem("pgl.access", hash as string); localStorage.setItem("pgl.offlineShell", "true"); } catch { /* ignore */ } }, ACCESS_HASH);
  await sweep(await ctx.newPage(), HOSTED_SITE);
  await ctx.close();
});

test(`PC-App: alle ${ROUTES.length} Seiten öffnen sich per Link, nach Neuladen und beim zweiten Mal`, async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${COMPANION}/#admin=${state().adminToken}`);
  await expect(page.getByRole("heading", { name: "Gaming-Zentrale", exact: true })).toBeVisible({ timeout: 20_000 });
  await sweep(page, COMPANION);
  await ctx.close();
});
