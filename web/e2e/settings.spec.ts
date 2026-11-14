// Settings 3.62 against the real headless companion: categories, the instant search (with everyday words) that opens and
// highlights the setting, the simple/advanced view, performance presets with a preview and undo, and old links still working.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { COMPANION, state } from "./env";

const SHOTS = process.env.PGL_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: join(SHOTS, name + ".png") }); } };

async function open(page: Page, path: string) {
  await page.addInitScript((tok) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; w.__PGL_EMBEDDED__ = true; }, state().adminToken);
  await page.goto(`${COMPANION}/#${path}`);
}

test("Einstellungen: Kategorien, Suche mit Alltagswörtern springt zur Einstellung, alte Links gehen weiter", async ({ page }) => {
  await open(page, "/settings");
  const nav = page.getByRole("navigation", { name: "Einstellungsbereiche" });
  for (const c of ["Allgemein", "Personalisierung", "Gaming", "Audio", "JARVIS", "Dynamic Island", "Verbindung & Geräte", "Cloud & Sync", "Datenschutz & Sicherheit", "Performance", "Erweitert", "Hilfe"])
    await expect(nav.getByRole("button", { name: c, exact: true })).toBeVisible();

  // "laggt" is not written anywhere on the page – the synonym leads to the performance preset.
  const search = page.getByRole("combobox", { name: "Einstellungen durchsuchen" });
  await search.fill("laggt");
  const list = page.getByRole("listbox", { name: "Gefundene Einstellungen" });
  await expect(list.getByRole("option").first()).toContainText("Leistungs-Preset");
  await shot(page, "settings-search");
  await search.press("Enter");
  await expect(page).toHaveURL(/s=performance/);
  await expect(nav.getByRole("button", { name: "Performance", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".card.set-flash", { hasText: "Leistungs-Preset" })).toBeVisible();

  // A setting on its own page: the page opens and the setting is highlighted there. (The audio page would be the obvious
  // example, but it is Windows-only and this companion runs on Linux.)
  await search.fill("koppeln rechte");
  await list.getByRole("option", { name: /Gekoppelte Geräte/ }).click();
  await expect(page).toHaveURL(/#\/devices/);
  await expect(page.locator(".set-flash")).toContainText("Gekoppelte Geräte");

  // Nothing found is said plainly.
  await page.goto(`${COMPANION}/#/settings`);
  await page.getByRole("combobox", { name: "Einstellungen durchsuchen" }).fill("xyzunbekannt");
  await expect(page.getByText("Keine Einstellung gefunden. Versuch ein anderes Wort.")).toBeVisible();

  // Links from before 3.62 land in the new category.
  await page.goto(`${COMPANION}/#/settings?s=backup`);
  await expect(nav.getByRole("button", { name: "Cloud & Sync", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".card", { hasText: "Backup erstellen" }).first()).toBeVisible();
  await page.goto(`${COMPANION}/#/settings?s=security`);
  await expect(nav.getByRole("button", { name: "Datenschutz & Sicherheit", exact: true })).toHaveAttribute("aria-current", "true");
});

test("Einstellungen: Einfach/Erweitert blendet nur aus, Suche nach erweiterter Einstellung schaltet sie sichtbar", async ({ page }) => {
  await open(page, "/settings?s=connection");
  await expect(page.locator(".card", { hasText: "Lokales Netzwerk (WLAN)" })).toBeVisible();
  // Simple is the default: the own-relay card is hidden, and the page says so.
  await expect(page.getByText(/Einstellungen für Fortgeschrittene sind ausgeblendet/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Eigener Server/ })).toHaveCount(0);
  await page.getByRole("radio", { name: "Erweitert", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Eigener Server/ })).toBeVisible();
  await shot(page, "settings-advanced");
  await page.getByRole("radio", { name: "Einfach", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Eigener Server/ })).toHaveCount(0);
  // Searching for an advanced setting opens the advanced view, so the hit is never invisible.
  await page.getByRole("combobox", { name: "Einstellungen durchsuchen" }).fill("relay");
  await page.getByRole("option", { name: /Eigener Server/ }).click();
  await expect(page.getByRole("heading", { name: /Eigener Server/ })).toBeVisible();
  await expect(page.locator(".card.set-flash", { hasText: "Eigener Server" })).toBeVisible();
});

test("Einstellungen: Leistungs-Preset zeigt vorher, was sich ändert, übernimmt und lässt sich rückgängig machen", async ({ page }) => {
  await open(page, "/settings?s=performance");
  const html = page.locator("html");
  const lite = page.getByRole("switch", { name: /Leichte Darstellung/ });
  await expect(lite).not.toBeChecked();
  await page.getByRole("radio", { name: /Energiesparend/ }).click();
  const preview = page.locator(".set-preview");
  await expect(preview).toContainText("Das ändert sich:");
  await expect(preview).toContainText("Leichte Darstellung: aus → an");
  await expect(preview).toContainText("Animationen reduzieren: aus → an");
  await expect(lite).not.toBeChecked(); // the preview alone changes nothing
  await shot(page, "settings-preset-preview");
  await preview.getByRole("button", { name: "Übernehmen" }).click();
  await expect(lite).toBeChecked();
  await expect(html).toHaveAttribute("data-motion", "reduce");
  await expect(page.locator(".card", { hasText: "Leistungs-Preset" }).locator(".badge").first()).toHaveText("Energiesparend");
  // Kept after a reload (stored on this device).
  await page.reload();
  await expect(page.getByRole("switch", { name: /Leichte Darstellung/ })).toBeChecked();
  // Undo is offered right after applying – apply again, then undo.
  await page.getByRole("radio", { name: /Maximale Effekte/ }).click();
  await page.locator(".set-preview").getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByRole("switch", { name: /Leichte Darstellung/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByRole("switch", { name: /Leichte Darstellung/ })).toBeChecked();
  await expect(page.locator(".card", { hasText: "Leistungs-Preset" }).locator(".badge").first()).toHaveText("Energiesparend");
  // Back to the standard for the following tests.
  await page.getByRole("radio", { name: /Ausgewogen/ }).click();
  await page.locator(".set-preview").getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByRole("switch", { name: /Leichte Darstellung/ })).not.toBeChecked();
});
