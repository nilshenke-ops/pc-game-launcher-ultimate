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

/** A short tone as a WAV file – what the pretend ElevenLabs sends back. */
function wav(seconds = 0.6, rate = 24000) {
  const n = Math.floor(seconds * rate), b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 330 * i) / rate)), 44 + i * 2);
  return b;
}

test("Echte Stimmen (ElevenLabs): Schlüssel einmal, Stimmen laden, Satz aufnehmen, in der anderen Stimme zurück – mit nachgebautem ElevenLabs", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 1280, height: 1100 }, permissions: ["microphone"] });
  await ctx.addInitScript((hash) => { try { localStorage.setItem("pgl.access", hash as string); } catch { /* ignore */ } }, ACCESS_HASH);
  const calls: { url: string; key: string | null; method: string }[] = [];
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  await ctx.route("https://api.elevenlabs.io/**", async (route) => {
    const req = route.request(), url = req.url();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push({ url, key: req.headers()["xi-api-key"] ?? null, method: req.method() });
    if (url.includes("/v1/user/subscription")) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ tier: "starter", character_count: 10, character_limit: 30000 }) });
    if (url.includes("/v1/voices")) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ voices: [{ voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", category: "premade" }, { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Meine Stimme", category: "cloned" }] }) });
    if (url.includes("/v1/speech-to-speech/")) return route.fulfill({ status: 200, headers: cors, contentType: "audio/mpeg", body: wav() });
    return route.fulfill({ status: 404, headers: cors, body: "" });
  });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${COMPANION}/#admin=${state().adminToken}`);
  // The key is typed once in the AI manager (sealed on this device, and it travels with the account).
  await p.goto(`${COMPANION}/#/assistant?tab=ai`);
  const eleven = p.getByRole("group", { name: "ElevenLabs auf diesem Gerät" });
  await eleven.getByLabel("ElevenLabs-Schlüssel").fill("sk_" + "a".repeat(32));
  await eleven.getByRole("button", { name: /Speichern & testen/ }).click();
  await expect(eleven).toContainText(/Verbindung steht/, { timeout: 15000 });
  // The voice changer: switch to the real voices, the voices of the account are loaded by themselves.
  await p.goto(`${COMPANION}/#/voice-changer`);
  await p.getByText("Echte Stimmen (ElevenLabs)", { exact: true }).click();
  const pick = p.getByLabel("Stimme von ElevenLabs");
  await expect(pick.locator("option")).toHaveCount(2, { timeout: 15000 });
  await expect(pick).toContainText("Adam");
  await pick.selectOption({ label: "Meine Stimme · Eigene (geklont)" });
  await p.getByRole("button", { name: "Echte Stimme starten" }).click();
  await expect(p.getByText("Bereit", { exact: true })).toBeVisible({ timeout: 15000 });
  // Hold "Sprechen" for a few seconds (the fake microphone beeps), release: the sentence is sent with the chosen voice and comes back.
  const talk = p.getByRole("button", { name: "Sprechen (halten)" });
  const box = (await talk.boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await expect(p.getByText("Sprich jetzt …")).toBeVisible();
  await p.waitForTimeout(3200);
  await p.mouse.up();
  await expect(p.getByRole("status", { name: "Verzögerung" })).toContainText(/Letzte Verzögerung: \d+\.\d s · 1 Sätze/, { timeout: 20000 });
  const sts = calls.filter((c) => c.url.includes("/v1/speech-to-speech/"));
  expect(sts).toHaveLength(1);
  expect(sts[0].url).toContain("/EXAVITQu4vr4xnSDxMaL");               // the chosen voice
  expect(sts[0].key).toBe("sk_" + "a".repeat(32));                     // the key of this device, nobody else's
  expect(sts[0].method).toBe("POST");
  // Other changers' effects and this one never run together: starting the effects stops it.
  await p.getByText("Effekte (live)", { exact: true }).click();
  await p.getByRole("button", { name: "Stimmenwechsler starten" }).click();
  await expect(p.getByRole("button", { name: "Stoppen" })).toBeVisible({ timeout: 15000 });
  await p.getByRole("button", { name: "Stoppen" }).click();
  await expect(p.getByText("Gestoppt", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});
