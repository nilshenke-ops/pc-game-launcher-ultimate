// Runs LAST (the name sorts it so): it stops the test companion.
// The soundboard without the PC: while connected the phone keeps a copy of every sound; when the PC is gone, tapping a tile plays that copy on the phone.
import { expect, test, devices } from "@playwright/test";
import { execSync } from "node:child_process";
import { COMPANION, state } from "./env";
import { ACCESS_HASH } from "../src/lib/access";
import { adminSession } from "./rpc";

/** A 0.3 s test tone as a WAV file. */
function wav(): Uint8Array {
  const sr = 8000, n = Math.floor(sr * 0.3), b = new Uint8Array(44 + n * 2), v = new DataView(b.buffer);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
  s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 6) * 9000), true);
  return b;
}
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

test("Soundboard ohne PC: der Sound ist auf dem Handy gespeichert und spielt dort", async ({ browser }) => {
  const pc = await adminSession();
  const data = wav();
  const { uploadId } = await pc.call<{ uploadId: string }>("sounds.uploadBegin", { name: "Testton-Handy.wav", size: data.length });
  await pc.call("sounds.uploadChunk", { uploadId, data: b64(data) });
  await pc.call("sounds.uploadEnd", { uploadId });
  pc.close();

  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "de-DE" });
  await ctx.addInitScript((hash) => { try { localStorage.setItem("pgl.access", hash as string); } catch { /* ignore */ } }, ACCESS_HASH);
  const page = await ctx.newPage();
  await page.goto(`${COMPANION}/#admin=${state().adminToken}`);
  await page.goto(`${COMPANION}/#/soundboard`);
  const pad = page.locator(".pad", { hasText: "Testton-Handy" });
  await expect(pad).toBeVisible({ timeout: 30_000 });
  // connected: the copy lands in the device storage by itself
  await expect.poll(() => page.evaluate(() => new Promise<number>((res) => { const r = indexedDB.open("pgl-sounds", 1); r.onsuccess = () => { const q = r.result.transaction("sounds").objectStore("sounds").count(); q.onsuccess = () => res(q.result); q.onerror = () => res(0); }; r.onerror = () => res(0); })), { timeout: 30_000 }).toBeGreaterThan(0);
  // the PC "goes away"
  await page.evaluate(() => { (window as unknown as { __plays: number }).__plays = 0; const orig = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { (window as unknown as { __plays: number }).__plays++; return orig.call(this).catch(() => undefined) as Promise<void>; }; });
  try { execSync("pkill -f pgl-companion-headless"); } catch { /* already gone */ }   // the PC is gone (this test runs last)
  await expect(page.getByText("Ohne PC: die Sounds spielen auf diesem Gerät")).toBeVisible({ timeout: 30_000 });
  await pad.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __plays: number }).__plays), { timeout: 5000 }).toBeGreaterThan(0);   // played on the phone
  await ctx.close();
});
