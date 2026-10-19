// Reproducible web measurement: cold start (no cache) on a throttled "phone" (4x CPU slowdown, fast 3G-ish network)
// and desktop; time to first usable view (dashboard heading visible), JS heap, transferred bytes. Runs 3x, median.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
// Usage: node scripts/perf/web-start.mjs <dir-with-shot/admin.txt>  (companion with the built web app on port 8791)
const SP = process.argv[2], url = "http://127.0.0.1:8791";
const token = readFileSync(SP + "/shot/admin.txt", "utf8").trim();
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function run(profile) {
  const b = await chromium.launch();
  const res = { ttu: [], heap: [], bytes: [], dcl: [] };
  for (let i = 0; i < 3; i++) {
    const ctx = await b.newContext({ locale: process.env.LOCALE || "de-DE", ...(profile.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } }) });
    // Logged in like the PC's own window (admin token injected before the page runs); cold load without cache.
    await ctx.addInitScript((t) => { window.__PGL_ADMIN__ = t; window.__PGL_EMBEDDED__ = true; }, token);
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (profile.mobile) { await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 1.6e6 / 8 * 10, uploadThroughput: 750e3 / 8 * 10 }); }
    let bytes = 0; cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; });
    const t0 = Date.now();
    await p.goto(url + "/#/");
    await p.getByRole("heading", { name: "Gaming-Zentrale" }).waitFor({ timeout: 60000 });
    await p.locator(".dash .card, .dash > div").first().waitFor({ timeout: 60000 });
    res.ttu.push(Date.now() - t0);
    res.dcl.push(await p.evaluate(() => Math.round(performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd)));
    await p.waitForTimeout(1500);
    res.heap.push(await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e5) / 10));
    res.bytes.push(Math.round(bytes / 1024));
    await ctx.close();
  }
  await b.close();
  return { profile: profile.name, locale: process.env.LOCALE || "de-DE", timeToUsableMs: median(res.ttu), domContentLoadedMs: median(res.dcl), jsHeapMB: median(res.heap), transferredKB: median(res.bytes), runs: res.ttu };
}
for (const pr of [{ name: "desktop", mobile: false }, { name: "phone (4x CPU throttle, ~16 Mbit/s)", mobile: true }]) console.log(JSON.stringify(await run(pr)));
