// 3.66 Performance Intelligence against the real headless companion (Linux): every value of the island opens its detail view with
// live values and history from the PC, network in Mbit/s, drives with read/write speed from /proc/diskstats, the analysis, and FPS
// saying honestly why it cannot measure here (PresentMon only exists in the Windows companion). Nothing simulated.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { COMPANION, state } from "./env";
import { adminRpc } from "./rpc";

const SHOTS = process.env.PGL_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: join(SHOTS, name + ".png") }); } };

test("Insel: jeder Wert öffnet seine Detailansicht mit echten Werten und Verlauf", async ({ browser }) => {
  test.setTimeout(150_000);
  await adminRpc("island.configure", { look: { resetLayout: true, effect: "none", accent: "default" } });
  await adminRpc("island.configure", { look: { layout: { tabs: ["home", "system"] } } });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true, locale: "de-DE" });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.addInitScript((tok) => { (window as unknown as Record<string, unknown>).__PGL_ADMIN__ = tok; }, state().adminToken);
    await page.goto(`${COMPANION}/#/games`);
    await page.getByRole("button", { name: "JARVIS-Insel öffnen" }).click({ timeout: 30_000 });
    const panel = page.getByRole("dialog", { name: "JARVIS-Insel" });
    await panel.getByRole("tab", { name: "System" }).click();

    // CPU: live value and the history the PC keeps while somebody looks
    await panel.getByRole("button", { name: "CPU im Detail" }).click();
    const d = page.getByRole("dialog", { name: "CPU im Detail" });
    await expect(d).toBeVisible();
    await expect(d.locator(".md-big b")).toHaveText(/^\d+ %$/, { timeout: 15_000 });
    await expect(d.getByRole("img", { name: /CPU: Verlauf, Durchschnitt/ })).toBeVisible({ timeout: 20_000 });   // ≥ 2 real points
    await d.getByRole("radio", { name: "10 min" }).click();
    await expect(d.getByRole("radio", { name: "10 min" })).toHaveAttribute("aria-checked", "true");
    const hist = await adminRpc<{ points: { cpu: number | null }[] }>("monitor.history", { seconds: 600 });
    expect(hist.points.filter((p) => p.cpu != null).length).toBeGreaterThanOrEqual(2);
    await shot(page, "perf-cpu");

    // switch values inside the view (no page change)
    await d.getByRole("button", { name: "RAM", exact: true }).click();
    const ram = page.getByRole("dialog", { name: "RAM im Detail" });
    await expect(ram.locator(".md-big b")).toHaveText(/^\d+ %$/);
    await expect(ram.getByText("Gesamt")).toBeVisible();

    // network in Mbit/s, data since start
    await ram.getByRole("button", { name: "Netzwerk", exact: true }).click();
    const net = page.getByRole("dialog", { name: "Netzwerk im Detail" });
    await expect(net.locator(".md-big2 b").first()).toHaveText(/(k|M|G)bit\/s$/, { timeout: 10_000 });
    await expect(net.getByText("Empfangen seit Begleiter-Start")).toBeVisible();
    await shot(page, "perf-net");

    // drives: free space and (on Linux from /proc/diskstats) read/write speed
    await net.getByRole("button", { name: "Speicher", exact: true }).click();
    const disk = page.getByRole("dialog", { name: "Speicher im Detail" });
    await expect(disk.locator(".md-drives li").first()).toContainText(/frei von/);
    const sample = await adminRpc<{ sample: { diskIo?: unknown } }>("monitor.now").catch(() => null);
    expect(sample).not.toBeNull();
    await shot(page, "perf-disk");

    // FPS: says why it cannot measure on this system instead of showing a number
    await disk.getByRole("button", { name: "FPS", exact: true }).click();
    const fps = page.getByRole("dialog", { name: "FPS im Detail" });
    await expect(fps.getByText("Nicht verfügbar")).toBeVisible();
    await expect(fps.getByText(/nur im Windows-Begleiter/)).toBeVisible();
    await expect(fps.getByText("Letzte Spielsitzungen")).toBeVisible();
    await shot(page, "perf-fps");

    // analysis: real findings or "all fine", each with why/what helps/risk
    await fps.getByRole("button", { name: "Analyse", exact: true }).click();
    const an = page.getByRole("dialog", { name: "Analyse im Detail" });
    await expect(an.getByText(/Alles im grünen Bereich|Vermutung|gemessen/).first()).toBeVisible({ timeout: 15_000 });
    await expect(an.getByText(/Der Begleiter selbst: .* CPU/)).toBeVisible();
    const ins = await adminRpc<{ findings: { why: string; fix: string; risk: string }[] }>("perf.insights");
    for (const f of ins.findings) { expect(f.why.length).toBeGreaterThan(5); expect(f.fix.length).toBeGreaterThan(5); expect(f.risk.length).toBeGreaterThan(2); }
    await shot(page, "perf-insights");

    // ping: measured while the view is open
    await an.getByRole("button", { name: "Ping", exact: true }).click();
    const ping = page.getByRole("dialog", { name: "Ping im Detail" });
    await expect(ping.getByText("Jitter").first()).toBeVisible({ timeout: 15_000 });
    await ping.getByRole("button", { name: "Zurück zur Insel" }).click();
    await expect(ping).toHaveCount(0);
    await expect(panel).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await adminRpc("island.configure", { look: { resetLayout: true } }).catch(() => undefined);
  }
});

test("Begleiter: FPS-Status, Sitzungen und Einstellung", async () => {
  const st = await adminRpc<{ state: string; message: string }>("fps.status");
  expect(st.state).toBe("unavailable");                       // Linux: no PresentMon – said, not faked
  expect(st.message).toMatch(/Windows-Begleiter/);
  expect((await adminRpc<{ sessions: unknown[] }>("fps.sessions")).sessions).toEqual([]);
  await adminRpc("settings.save", { fpsAuto: false });
  expect((await adminRpc<{ state: string }>("fps.status")).state).toBe("off");
  await adminRpc("settings.save", { fpsAuto: true });
});
