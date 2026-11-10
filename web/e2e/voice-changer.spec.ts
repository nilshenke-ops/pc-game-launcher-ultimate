// The Discord voice changer with a fake microphone (a beep that Chromium generates): it starts, the levels move, voices switch live
// (also while running), and it stops again. The cable itself cannot exist in the test – the real routing is only checked by its settings.
import { expect, test, type ConsoleMessage } from "@playwright/test";
import { COMPANION, state } from "./env";
import { ACCESS_HASH } from "../src/lib/access";

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] }, permissions: ["microphone"] });

test("Stimmenwechsler: starten, Pegel bewegen sich, Stimme live wechseln, stoppen", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1280, height: 1000 }, permissions: ["microphone"] });
  await ctx.addInitScript((hash) => { try { localStorage.setItem("pgl.access", hash as string); } catch { /* ignore */ } }, ACCESS_HASH);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("console", (m: ConsoleMessage) => { if (m.type() === "error") errors.push(m.text()); });
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${COMPANION}/#admin=${state().adminToken}`);
  await p.goto(`${COMPANION}/#/voice-changer`);
  await expect(p.getByRole("heading", { name: "Stimmenwechsler", exact: true })).toBeVisible();
  // All voices are offered; Original is chosen at first.
  const voices = p.getByRole("radiogroup", { name: "Stimme" }).getByRole("radio");
  expect(await voices.count()).toBeGreaterThanOrEqual(10);
  await expect(p.getByRole("radio", { name: /^Original(\s|$)/ })).toHaveAttribute("aria-checked", "true");
  await p.getByRole("button", { name: "Stimmenwechsler starten" }).click();
  await expect(p.getByRole("button", { name: "Stoppen" })).toBeVisible({ timeout: 15000 });
  await expect(p.getByText("Aktiv", { exact: true })).toBeVisible();
  const level = (name: string) => p.getByRole("meter", { name }).getAttribute("aria-valuenow").then((v) => Number(v));
  // The fake microphone beeps: the level at the microphone moves, and the changed voice comes out.
  await expect.poll(() => level("Pegel Mikrofon"), { timeout: 12000 }).toBeGreaterThan(0);
  await p.getByRole("radio", { name: /^Roboter(\s|$)/ }).click();
  await expect(p.getByRole("radio", { name: /^Roboter(\s|$)/ })).toHaveAttribute("aria-checked", "true");
  await expect(p.getByText("Läuft: Roboter")).toBeVisible();
  await expect.poll(() => level("Pegel Ausgang"), { timeout: 12000 }).toBeGreaterThan(0);
  // Another voice while it runs – and the fine tuning – without stopping.
  for (const name of [/^Monster(\s|$)/, /^Chipmunk(\s|$)/, /^Echo(\s|$)/, /^Megafon(\s|$)/, /^Original(\s|$)/]) {
    await p.getByRole("radio", { name }).click();
    await expect(p.getByRole("radio", { name })).toHaveAttribute("aria-checked", "true");
  }
  await p.getByRole("slider", { name: "Feinabstimmung der Tonhöhe" }).fill("3");
  await expect(p.getByText(/\+3 Halbtöne/)).toBeVisible();
  await expect(p.getByRole("button", { name: "Stoppen" })).toBeVisible();
  // Running keeps going when another page is opened.
  await p.goto(`${COMPANION}/#/`);
  await p.goto(`${COMPANION}/#/voice-changer`);
  await expect(p.getByRole("button", { name: "Stoppen" })).toBeVisible();
  // The choices are remembered.
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem("pgl.voicechanger") ?? "{}"))).toMatchObject({ voice: "original", trim: 3 });
  await p.getByRole("button", { name: "Stoppen" }).click();
  await expect(p.getByRole("button", { name: "Stimmenwechsler starten" })).toBeVisible();
  await expect(p.getByText("Gestoppt", { exact: true })).toBeVisible();
  expect(errors.filter((e) => !/favicon|manifest|Failed to load resource|ws:|WebSocket/i.test(e))).toEqual([]);
  await ctx.close();
});
