// QR transfer (3.64) against the real headless companion: the island makes the QR code, a "phone" (separate browser without any
// account) opens it, both show the same code, the PC allows it, files go encrypted in both directions; a second device, a wrong link
// and an ended transfer are refused. Real files, real bytes – nothing simulated.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPANION, state } from "./env";
import { adminRpc } from "./rpc";

const SHOTS = process.env.PGL_SHOTS;
const shot = async (page: Page, name: string) => { if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: join(SHOTS, name + ".png") }); } };
type FilesResp = { files: { name: string; size: number }[] };

async function putOnShelf(name: string, data: Buffer) {
  const { uploadId } = await adminRpc<{ uploadId: string }>("files.uploadBegin", { name, size: data.length });
  for (let o = 0; o < data.length; o += 400_000) await adminRpc("files.uploadChunk", { uploadId, data: data.subarray(o, o + 400_000).toString("base64") });
  await adminRpc("files.uploadEnd", { uploadId });
}
async function islandShelf(browser: Browser) {
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 900, height: 560 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const pc = await ctx.newPage();
  await pc.addInitScript((tok) => { const w = window as unknown as Record<string, unknown>; w.__PGL_ADMIN__ = tok; w.__PGL_EMBEDDED__ = true; w.__PGL_ISLAND__ = true; }, state().adminToken);
  await pc.goto(`${COMPANION}/#/island`);
  await pc.getByRole("button", { name: "JARVIS-Insel öffnen" }).click();
  const panel = pc.getByRole("dialog", { name: "JARVIS-Insel" });
  await adminRpc("island.configure", { look: { layout: { tabs: ["home", "shelf"], home: [], dash: [] } } });
  await panel.getByRole("tab", { name: "Ablage" }).click();
  return { ctx, pc, panel };
}
/** The phone opens the link of the QR code (the part after "#", on the PC's own address, as in the home Wi-Fi). */
async function phoneOpens(browser: Browser, link: string) {
  const ctx = await browser.newContext({ locale: "de-DE", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
  const phone = await ctx.newPage();
  await phone.goto(`${COMPANION}/${link.slice(link.indexOf("#"))}`);
  return { ctx, phone };
}

test("PC → Handy: Datei per QR-Code, gleicher Code auf beiden Seiten, erst nach „Erlauben“, Datei kommt unverändert an", async ({ browser }) => {
  test.setTimeout(120_000);
  const content = Buffer.from(Array.from({ length: 1_300_000 }, (_, i) => (i * 7) % 251)); // 1.3 MB → several encrypted pieces
  await putOnShelf("urlaub.png", content);
  const { ctx, pc, panel } = await islandShelf(browser);
  try {
    await panel.getByRole("checkbox", { name: "urlaub.png auswählen" }).check();
    await panel.getByRole("button", { name: "1 mit Handy übertragen" }).click();
    const qr = panel.getByRole("img", { name: "QR-Code für die Übertragung" });
    await expect(qr).toBeVisible();
    const link = (await qr.getAttribute("data-link"))!;
    expect(link).toMatch(/#\/x\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    await shot(pc, "share-qr");

    const { ctx: pctx, phone } = await phoneOpens(browser, link);
    await expect(phone.getByText("Bitte am PC bestätigen")).toBeVisible({ timeout: 20_000 });
    const phoneCode = (await phone.locator(".xs-code").textContent())!.trim();
    expect(phoneCode).toMatch(/^\d{4}$/);
    // nothing to see on the phone before the PC says yes
    await expect(phone.getByText("urlaub.png")).toHaveCount(0);
    const ask = panel.getByRole("alertdialog", { name: "Gerät möchte übertragen" });
    await expect(ask).toContainText(phoneCode);                                  // the same code on both sides
    await shot(pc, "share-ask"); await shot(phone, "share-phone-wait");
    await ask.getByRole("button", { name: "Erlauben" }).click();

    await expect(phone.getByText("urlaub.png")).toBeVisible();
    await phone.getByRole("button", { name: "Dateien empfangen" }).click();
    await expect(phone.getByText("Alles empfangen")).toBeVisible({ timeout: 30_000 });
    await shot(phone, "share-phone-done");
    const dl = phone.waitForEvent("download");
    await phone.getByRole("button", { name: /Sichern/ }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe("urlaub.png");
    expect(readFileSync((await file.path())!).equals(content)).toBe(true);     // byte for byte
    await expect(panel.getByText(/1 Datei\(en\) an .* übertragen/)).toBeVisible();
    await pctx.close();
  } finally { await ctx.close(); await adminRpc("files.remove", { name: "urlaub.png" }).catch(() => undefined); }
});

test("Handy → PC: Dateien wählen und senden, landen im Austausch-Ordner; Programme werden abgelehnt", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, panel } = await islandShelf(browser);
  try {
    await panel.getByRole("button", { name: "Vom Handy empfangen" }).click();
    const link = (await panel.getByRole("img", { name: "QR-Code für die Übertragung" }).getAttribute("data-link"))!;
    const { ctx: pctx, phone } = await phoneOpens(browser, link);
    await expect(phone.getByText("Bitte am PC bestätigen")).toBeVisible({ timeout: 20_000 });
    await panel.getByRole("alertdialog", { name: "Gerät möchte übertragen" }).getByRole("button", { name: "Erlauben" }).click();
    const big = Buffer.alloc(3_000_000, 7);
    await phone.locator('input[type="file"]').setInputFiles([
      { name: "vom-handy.txt", mimeType: "text/plain", buffer: Buffer.from("Gruß vom iPhone") },
      { name: "video.mp4", mimeType: "video/mp4", buffer: big },
      { name: "boese.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
    ]);
    await phone.getByRole("button", { name: "An den PC senden" }).click();
    await expect(phone.getByText(/fehlgeschlagen/)).toBeVisible({ timeout: 30_000 });          // the .exe is refused …
    await expect(phone.locator(".xs-file.error")).toContainText("boese.exe");
    await expect(phone.locator(".xs-file.done")).toHaveCount(2);                              // … the other two arrived
    await shot(phone, "share-phone-upload");
    const files = (await adminRpc<FilesResp>("files.list")).files;
    expect(files.find((f) => f.name === "vom-handy.txt")?.size).toBe(Buffer.byteLength("Gruß vom iPhone"));
    expect(files.find((f) => f.name === "video.mp4")?.size).toBe(3_000_000);
    expect(files.some((f) => f.name.startsWith("boese"))).toBe(false);
    await pctx.close();
  } finally {
    await ctx.close();
    for (const n of ["vom-handy.txt", "video.mp4"]) await adminRpc("files.remove", { name: n }).catch(() => undefined);
  }
});

test("Sicherheit: falscher Link, zweites Gerät, Ablehnen und Beenden", async ({ browser }) => {
  test.setTimeout(120_000);
  await putOnShelf("geheim.txt", Buffer.from("nur für mich"));
  const { ctx, panel } = await islandShelf(browser);
  try {
    // a made-up link
    const { ctx: c0, phone: fake } = await phoneOpens(browser, "#/x/AAAAAAAAAAAA." + "A".repeat(43));
    await expect(fake.getByText(/ungültig oder abgelaufen/)).toBeVisible({ timeout: 20_000 });
    await c0.close();
    // a cut-off link is caught on the phone itself
    const { ctx: cx, phone: cut } = await phoneOpens(browser, "#/x/AAAA.BBBB");
    await expect(cut.getByText("Ungültiger QR-Code")).toBeVisible();
    await cx.close();
    // the right id with a wrong secret is refused too
    await panel.getByRole("checkbox", { name: "geheim.txt auswählen" }).check();
    await panel.getByRole("button", { name: "1 mit Handy übertragen" }).click();
    const link = (await panel.getByRole("img", { name: "QR-Code für die Übertragung" }).getAttribute("data-link"))!;
    const wrong = link.replace(/\.[A-Za-z0-9_-]{43}$/, "." + "B".repeat(43));
    const { ctx: c1, phone: guess } = await phoneOpens(browser, wrong);
    await expect(guess.getByText(/passt nicht/)).toBeVisible({ timeout: 20_000 });
    await c1.close();
    // refused at the PC: the phone gets nothing
    const { ctx: c2, phone } = await phoneOpens(browser, link);
    await expect(phone.getByText("Bitte am PC bestätigen")).toBeVisible({ timeout: 20_000 });
    await panel.getByRole("alertdialog", { name: "Gerät möchte übertragen" }).getByRole("button", { name: "Ablehnen" }).click();
    await expect(phone.getByText("Übertragung beendet")).toBeVisible();
    await expect(phone.getByText("geheim.txt")).toHaveCount(0);
    await c2.close();
    // a new code, allowed, then a second device with the same link is turned away; "Beenden" ends it for the first
    await panel.getByRole("button", { name: "Neuen Code erzeugen" }).click();
    const link2 = (await panel.getByRole("img", { name: "QR-Code für die Übertragung" }).getAttribute("data-link"))!;
    expect(link2).not.toBe(link);
    const { ctx: c3, phone: p1 } = await phoneOpens(browser, link2);
    await expect(p1.getByText("Bitte am PC bestätigen")).toBeVisible({ timeout: 20_000 });
    await panel.getByRole("alertdialog", { name: "Gerät möchte übertragen" }).getByRole("button", { name: "Erlauben" }).click();
    await expect(p1.getByText("geheim.txt")).toBeVisible();
    const { ctx: c4, phone: p2 } = await phoneOpens(browser, link2);
    await expect(p2.getByText(/anderen Gerät/)).toBeVisible({ timeout: 20_000 });
    await c4.close();
    await panel.getByRole("button", { name: "Beenden" }).click();
    await expect(p1.getByText("Übertragung beendet")).toBeVisible();
    await c3.close();
  } finally { await ctx.close(); await adminRpc("files.remove", { name: "geheim.txt" }).catch(() => undefined); }
});
