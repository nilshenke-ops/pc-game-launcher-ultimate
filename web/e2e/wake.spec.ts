// "PC einschalten": set-up, start signal and the honest sequence of states – on the hosted site without a PC, with the cloud service rebuilt
// by the test (it records what the page sends). The FRITZ!Box part itself is tested in src/lib/wake-worker.test.ts.
import { expect, test, devices } from "@playwright/test";
import { HOSTED_SITE } from "./env";
import { ACCESS_HASH } from "../src/lib/access";

test("PC einschalten: einrichten, Startsignal nur einmal, Status folgt dem echten Verlauf, Kennwort bleibt versiegelt", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "de-DE" });
  await ctx.addInitScript((hash) => {
    localStorage.setItem("pgl.access", hash as string);
    // signed in with a cloud account (keys of a test account)
    localStorage.setItem("pgl.designAccount", JSON.stringify({ user: "nils", auth: "ab".repeat(32), enc: btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1))), cloud: true, savedAt: 1 }));
  }, ACCESS_HASH);
  const page = await ctx.newPage();
  const cloud = { wakes: [] as Record<string, unknown>[], infos: 0, active: false, pcAt: null as string | null };
  await page.route(/\/api\/(sync|account)\//, async (route) => {
    const url = route.request().url(), body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
    const ok = (o: object) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, ...o }) });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (url.endsWith("/sync/token")) return ok({ token: "cd".repeat(32) });
    if (url.endsWith("/sync/wakeinfo")) { cloud.infos++; return ok({ known: true, active: cloud.active, name: "Victus", iface: "Ethernet", ip: "192.168.178.40" }); }
    if (url.endsWith("/sync/wake")) { cloud.wakes.push(body); return ok({ sent: true, at: new Date().toISOString() }); }
    if (url.endsWith("/sync/pull")) return ok({ seq: 1, unchanged: !cloud.pcAt, pcAt: cloud.pcAt, pcName: "VICTUS", items: [], ops: [] });
    return ok({ user: "nils", blob: null, updatedAt: new Date().toISOString() });
  });

  await page.goto(`${HOSTED_SITE}/#/control`);
  const card = page.locator(".wake-card");
  await expect(card.getByText("Wake-on-LAN nicht verfügbar")).toBeVisible({ timeout: 30_000 });      // not set up yet: said so, no fake button
  await expect(card.getByRole("button", { name: "PC einschalten", exact: true })).toHaveCount(0);

  // set-up: the whole address with port can be pasted
  await card.getByRole("button", { name: "Jetzt einrichten" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("MyFRITZ!-Adresse der FRITZ!Box").fill("https://abc123def456.myfritz.net:44321");
  await expect(dlg.getByLabel("HTTPS-Port")).toHaveValue("44321");
  await dlg.getByLabel("FRITZ!Box-Benutzer").fill("jarvis");
  await dlg.getByLabel("Kennwort dieses Benutzers").fill("streng-geheim-99");
  await dlg.getByLabel("MAC-Adresse des LAN-Anschlusses am PC").fill("aa-bb-cc-dd-ee-ff");
  await dlg.getByRole("button", { name: "Verbindung testen" }).click();
  await expect(dlg.getByText(/kennt den PC „Victus“ \(per LAN-Kabel\)/)).toBeVisible();
  await dlg.getByRole("button", { name: "Speichern" }).click();
  await expect(dlg).toBeHidden();

  // sealed: the FRITZ!Box password is nowhere in the device storage in readable form
  const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  expect(stored).not.toContain("streng-geheim-99");
  expect(stored).toContain("pgl.wake");

  await expect(card.getByText("PC ausgeschaltet")).toBeVisible();                                  // the FRITZ!Box says: not in the home network
  const start = card.getByRole("button", { name: "PC einschalten", exact: true });
  await start.click();
  await expect(card.getByText("PC wird gestartet")).toBeVisible();                                  // sent is not "running"
  await expect(card.getByRole("button", { name: "Wird gestartet …" })).toBeDisabled();             // no second start signal
  expect(cloud.wakes.length).toBe(1);
  expect(cloud.wakes[0]).toMatchObject({ user: "nils", token: "cd".repeat(32), host: "abc123def456.myfritz.net", port: 44321, fbUser: "jarvis", mac: "AA:BB:CC:DD:EE:FF" });

  cloud.active = true;                                                                              // the FRITZ!Box sees the PC in the home network
  await expect(card.getByText("PC startet gerade")).toBeVisible({ timeout: 20_000 });
  cloud.pcAt = new Date(Date.now() + 1000).toISOString();                                           // the PC reported to the cloud
  await expect(card.getByText("Verbindung wird hergestellt")).toBeVisible({ timeout: 25_000 });
  expect(cloud.wakes.length).toBe(1);
  await ctx.close();
});

test("Begleiter: wol.info liefert die Netzwerkadapter mit MAC-Adresse und ehrliche Prüfungen (ohne Windows: „unbekannt“, nie „geht“)", async () => {
  const { adminRpc } = await import("./rpc");
  const r = await adminRpc<{ adapters: { mac: string; kind: string }[]; checks: { id: string; ok: boolean | null }[]; windows: boolean }>("wol.info");
  expect(Array.isArray(r.adapters)).toBe(true);
  for (const a of r.adapters) expect(a.mac).toMatch(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
  expect(r.windows).toBe(false);                                   // the test companion runs on Linux
  expect(r.checks.every((c) => c.ok !== true)).toBe(true);         // nothing is reported as working that was not checked
});
