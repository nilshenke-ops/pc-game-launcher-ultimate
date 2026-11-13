// Real performance measurements (3.61): run only with PGL_PERF=<file.json>. Measures in this test browser (headless Chromium,
// software rendering – absolute frame numbers are lower than on a real PC with a GPU; compare before/after on the same machine)
// and the headless companion process (Linux /proc). Nothing here is estimated: every number is read from the browser or the OS.
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { COMPANION, state } from "./env";

const OUT = process.env.PGL_PERF;
test.skip(!OUT, "nur mit PGL_PERF=<datei.json>");
test.setTimeout(10 * 60_000);

const ROUTES = ["/", "/games", "/apps", "/soundboard", "/assistant", "/audio", "/monitor", "/deals", "/settings", "/automations", "/files", "/overlay-settings", "/profiles", "/library"];

async function admin(page: Page, island = false) {
  await page.addInitScript(([tok, isl]) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; w.__PGL_EMBEDDED__ = true; if (isl) w.__PGL_ISLAND__ = true; }, [state().adminToken, island] as const);
}
async function metric(cdp: CDPSession) {
  const { metrics } = await cdp.send("Performance.getMetrics") as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(metrics.map((m) => [m.name, m.value])) as Record<string, number>;
}
async function heapAfterGc(cdp: CDPSession) {
  await cdp.send("HeapProfiler.collectGarbage");
  return (await metric(cdp)).JSHeapUsedSize;
}
/** Main-thread busy time per second while nothing is touched (polling, timers, animations). */
async function idleCpu(page: Page, cdp: CDPSession, seconds: number) {
  const a = await metric(cdp);
  let frames = 0;
  const onWs = () => { frames++; };
  cdp.on("Network.webSocketFrameReceived", onWs); cdp.on("Network.webSocketFrameSent", onWs);
  await page.waitForTimeout(seconds * 1000);
  cdp.off("Network.webSocketFrameReceived", onWs); cdp.off("Network.webSocketFrameSent", onWs);
  const b = await metric(cdp);
  return {
    taskMsPerSec: +(((b.TaskDuration - a.TaskDuration) * 1000) / seconds).toFixed(1),
    scriptMsPerSec: +(((b.ScriptDuration - a.ScriptDuration) * 1000) / seconds).toFixed(1),
    layoutsPerSec: +((b.LayoutCount - a.LayoutCount) / seconds).toFixed(2),
    styleRecalcsPerSec: +((b.RecalcStyleCount - a.RecalcStyleCount) / seconds).toFixed(2),
    wsFramesPerMin: +((frames * 60) / seconds).toFixed(1),
  };
}
/** Frame intervals while the island opens, stays open and closes. */
async function islandFrames(page: Page) {
  return page.evaluate(async () => {
    const times: number[] = [];
    let run = true;
    const tick = (t: number) => { times.push(t); if (run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const pill = document.querySelector<HTMLButtonElement>(".isl-pill")!;
    pill.click();
    await new Promise((r) => setTimeout(r, 1500));
    (document.querySelector<HTMLButtonElement>(".isl2-closeTap") ?? pill).click();
    await new Promise((r) => setTimeout(r, 1500));
    run = false;
    const d = times.slice(1).map((t, i) => t - times[i]);
    const avg = d.reduce((a, b) => a + b, 0) / Math.max(d.length, 1);
    const sorted = [...d].sort((a, b) => a - b);
    return { frames: d.length, avgFps: +(1000 / avg).toFixed(1), p95FrameMs: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1), drops: d.filter((x) => x > 25).length, longest: +Math.max(...d).toFixed(1) };
  });
}
function companionProcess() {
  for (const pid of state().pids) {
    try { if (readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("pgl-companion-headless")) return pid; } catch { /* gone */ }
  }
  for (const d of readdirSync("/proc").filter((x) => /^\d+$/.test(x))) {
    try { if (readFileSync(`/proc/${d}/cmdline`, "utf8").includes("pgl-companion-headless")) return Number(d); } catch { /* gone */ }
  }
  return null;
}
async function companionIdle(seconds: number) {
  const pid = companionProcess();
  if (!pid) return null;
  const ticks = () => { const f = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" "); return Number(f[11]) + Number(f[12]); };
  const rss = () => Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))![1]) / 1024;
  const t0 = ticks(), w0 = Date.now();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const cpuSec = (ticks() - t0) / 100; // USER_HZ = 100 on Linux
  return { cpuPercentOfOneCore: +((cpuSec / ((Date.now() - w0) / 1000)) * 100).toFixed(2), rssMb: +rss().toFixed(1) };
}
function bundle() {
  const dist = join(process.cwd(), "dist");
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const entry = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const size = (f: string) => { const b = readFileSync(join(dist, f)); return { raw: b.length, gzip: gzipSync(b).length }; };
  const initial = entry.reduce((a, f) => { const s = size(f); return { raw: a.raw + s.raw, gzip: a.gzip + s.gzip }; }, { raw: 0, gzip: 0 });
  const all = readdirSync(join(dist, "assets")).filter((f) => /\.(js|css)$/.test(f));
  const total = all.reduce((a, f) => a + statSync(join(dist, "assets", f)).size, 0);
  return { initialFiles: entry.length, initialKb: Math.round(initial.raw / 1024), initialGzipKb: Math.round(initial.gzip / 1024), chunks: all.length, totalKb: Math.round(total / 1024) };
}

test("Messung: Bündel, Seitenwechsel, Leerlauf, Insel-Bildrate, Speicher, Begleiter", async ({ browser }) => {
  const result: Record<string, unknown> = { at: new Date().toISOString(), note: "Headless Chromium mit Software-Rendering im Test-Container; Begleiter = Headless-Version unter Linux. Vorher/Nachher nur auf derselben Maschine vergleichbar." };
  result.bundle = bundle();

  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await admin(page);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable"); await cdp.send("Network.enable");
  const t0 = Date.now();
  await page.goto(`${COMPANION}/#/`);
  await expect(page.getByRole("heading", { name: "Gaming-Zentrale", exact: true })).toBeVisible({ timeout: 20000 });
  result.firstLoadMs = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; const fcp = performance.getEntriesByName("first-contentful-paint")[0]; return { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd), fcpMs: fcp ? Math.round(fcp.startTime) : null }; });
  result.navigation = nav;
  await page.waitForTimeout(3000);
  result.heapStartMb = +((await heapAfterGc(cdp)) / 1048576).toFixed(1);
  result.idleHome = await idleCpu(page, cdp, 20);

  // Page changes inside the app (hash routes): time until the new page has drawn (two animation frames after the route changed).
  const switches: Record<string, number> = {};
  for (let round = 0; round < 3; round++) {
    for (const r of ROUTES) {
      const ms = await page.evaluate(async (route) => {
        const s = performance.now();
        location.hash = "#" + route;
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        // wait until the route's main area exists and no lazy chunk is loading (suspense fallback gone)
        for (let i = 0; i < 200 && (document.querySelector(".page-loading, .route-loading") || !document.querySelector("main")); i++) await new Promise((res) => setTimeout(res, 10));
        return performance.now() - s;
      }, r);
      if (round > 0) switches[r] = Math.max(switches[r] ?? 0, Math.round(ms)); // first round loads chunks; later rounds = switching
      else switches[r + " (erstes Mal)"] = Math.round(ms);
    }
  }
  result.pageSwitchMs = switches;
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForTimeout(2000);
  result.heapAfter45SwitchesMb = +((await heapAfterGc(cdp)) / 1048576).toFixed(1);
  await page.evaluate(() => { location.hash = "#/soundboard"; });
  await page.waitForTimeout(2000);
  result.idleSoundboard = await idleCpu(page, cdp, 15);
  await page.evaluate(() => { location.hash = "#/monitor"; });
  await page.waitForTimeout(2000);
  result.idleMonitor = await idleCpu(page, cdp, 15);
  await ctx.close();

  // The island window on the PC (closed, then the open panel).
  const ictx = await browser.newContext({ locale: "de-DE", viewport: { width: 620, height: 420 } });
  const ip = await ictx.newPage();
  await admin(ip, true);
  const icdp = await ictx.newCDPSession(ip);
  await icdp.send("Performance.enable"); await icdp.send("Network.enable");
  await ip.goto(`${COMPANION}/#/island`);
  await expect(ip.getByRole("button", { name: "JARVIS-Insel öffnen" })).toBeVisible({ timeout: 20000 });
  await ip.waitForTimeout(2500);
  result.idleIslandClosed = await idleCpu(ip, icdp, 15);
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await islandFrames(ip));
  result.islandOpenClose = runs;
  await ip.getByRole("button", { name: "JARVIS-Insel öffnen" }).click();
  await ip.waitForTimeout(2000);
  result.idleIslandOpen = await idleCpu(ip, icdp, 15);
  await ictx.close();

  result.companionIdle = await companionIdle(20);
  writeFileSync(OUT!, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
});
