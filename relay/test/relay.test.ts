import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { createRelay, defaultConfig, sha256Hex, type Relay } from "../src/relay.js";

const SECRET = "test-secret-test-secret-123";

async function start(): Promise<{ relay: Relay; base: string; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), "pgl-relay-"));
  mkdirSync(join(dir, "web", "assets"), { recursive: true });
  mkdirSync(join(dir, "downloads"));
  writeFileSync(join(dir, "web", "index.html"), "<!doctype html><title>pgl</title>");
  writeFileSync(join(dir, "web", "assets", "app.js"), "console.log(1)");
  writeFileSync(join(dir, "secret.txt"), "top secret");
  const cfg = { ...defaultConfig(dir), port: 0, host: "127.0.0.1", webDir: join(dir, "web"), downloadsDir: join(dir, "downloads"), companions: [{ id: "mein-pc", secretSha256: sha256Hex(SECRET) }] };
  const relay = createRelay(cfg);
  await new Promise<void>((r) => relay.server.listen(0, "127.0.0.1", () => r()));
  return { relay, base: `127.0.0.1:${relay.port()}`, dir };
}

const queues = new WeakMap<WebSocket, { items: any[]; waiters: ((v: any) => void)[] }>();

/** Opens a socket and buffers every incoming message so no message is lost before a test awaits it. */
function open(url: string, headers: Record<string, string> = {}) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const q = { items: [] as any[], waiters: [] as ((v: any) => void)[] };
    queues.set(ws, q);
    ws.on("message", (d) => { const v = JSON.parse(d.toString()); const w = q.waiters.shift(); if (w) w(v); else q.items.push(v); });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}

function next(ws: WebSocket): Promise<any> {
  const q = queues.get(ws)!;
  if (q.items.length) return Promise.resolve(q.items.shift());
  return new Promise((resolve) => q.waiters.push(resolve));
}

async function companion(base: string, secret = SECRET) {
  const ws = await open(`ws://${base}/companion`);
  ws.send(JSON.stringify({ t: "auth", id: "mein-pc", secret }));
  return { ws, reply: await next(ws) };
}

test("companion with wrong secret is rejected", async () => {
  const { relay, base } = await start();
  const { ws, reply } = await companion(base, "wrong-secret-wrong-secret-0");
  assert.equal(reply.t, "error");
  await new Promise((r) => ws.once("close", r));
  assert.deepEqual(relay.online(), []);
  await relay.close();
});

test("browser gets offline status, then frames are forwarded in both directions", async () => {
  const { relay, base } = await start();
  const browser = await open(`ws://${base}/ws?pc=mein-pc`);
  assert.deepEqual(await next(browser), { type: "relay", state: "companion-offline" });

  const onlineP = next(browser);
  const comp = await companion(base);
  assert.equal(comp.reply.t, "ok");
  assert.deepEqual(await onlineP, { type: "relay", state: "companion-online" });

  // The web app reconnects after "companion-online"; a fresh browser socket is attached.
  const openedP = next(comp.ws);
  const browser2 = await open(`ws://${base}/ws`); // single companion configured: pc parameter optional
  const opened = await openedP;
  assert.equal(opened.t, "open");
  browser2.send('{"v":1,"id":1,"m":"hello"}');
  const fwd = await next(comp.ws);
  assert.deepEqual(fwd, { t: "msg", ch: opened.ch, d: '{"v":1,"id":1,"m":"hello"}' });
  comp.ws.send(JSON.stringify({ t: "msg", ch: opened.ch, d: '{"v":1,"id":1,"ok":true}' }));
  assert.deepEqual(await next(browser2), { v: 1, id: 1, ok: true });

  browser2.close();
  const closed = await next(comp.ws);
  assert.deepEqual(closed, { t: "close", ch: opened.ch });

  comp.ws.close();
  browser.close();
  await relay.close();
});

test("unknown pc and foreign origins are refused", async () => {
  const { relay, base } = await start();
  await assert.rejects(open(`ws://${base}/ws?pc=fremd`), /404/);
  await assert.rejects(open(`ws://${base}/ws?pc=mein-pc`, { Origin: "https://evil.example" }), /403/);
  // "Origin: null" (sandboxed page) is refused and does not crash the relay.
  await assert.rejects(open(`ws://${base}/ws?pc=mein-pc`, { Origin: "null" }), /403/);
  assert.equal((await fetch(`http://${base}/healthz`)).status, 200);
  await relay.close();
});

test("static files, SPA fallback, traversal protection and security headers", async () => {
  const { relay, base } = await start();
  const r1 = await fetch(`http://${base}/assets/app.js`);
  assert.equal(r1.status, 200);
  assert.match(r1.headers.get("content-type")!, /javascript/);
  assert.match(r1.headers.get("cache-control")!, /immutable/);
  assert.equal(r1.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await fetch(`http://${base}/some/route`)).status, 200);
  assert.equal((await fetch(`http://${base}/missing.js`)).status, 404);
  const trav = await fetch(`http://${base}/..%2Fsecret.txt`);
  assert.notEqual(await trav.text(), "top secret");
  const health = await (await fetch(`http://${base}/healthz`)).json();
  assert.equal(health.role, "relay");
  await relay.close();
});

test("download is only offered when the file matches its manifest", async () => {
  const { relay, base, dir } = await start();
  let info = await (await fetch(`http://${base}/download/info`)).json();
  assert.equal(info.available, false);
  assert.equal(info.reason, "not-built");

  const data = Buffer.from("MZ fake companion binary");
  writeFileSync(join(dir, "downloads", "PCGameLauncherCompanion.exe"), data);
  const sha = createHash("sha256").update(data).digest("hex");
  writeFileSync(join(dir, "downloads", "manifest.json"), JSON.stringify({ fileName: "PCGameLauncherCompanion.exe", size: data.length, sha256: sha, version: "1.0.0" }));
  info = await (await fetch(`http://${base}/download/info`)).json();
  assert.equal(info.available, true);
  assert.equal(info.size, data.length);
  const dl = await fetch(`http://${base}/download/PCGameLauncherCompanion.exe`);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("content-length"), String(data.length));
  assert.match(dl.headers.get("content-disposition")!, /attachment/);
  assert.equal(createHash("sha256").update(Buffer.from(await dl.arrayBuffer())).digest("hex"), sha);
  assert.equal((await fetch(`http://${base}/download/other.exe`)).status, 404);

  writeFileSync(join(dir, "downloads", "manifest.json"), JSON.stringify({ fileName: "PCGameLauncherCompanion.exe", size: 999, sha256: sha, version: "1.0.0" }));
  info = await (await fetch(`http://${base}/download/info`)).json();
  assert.equal(info.available, false);
  assert.equal(info.reason, "mismatch");
  await relay.close();
});

test("a second login with the same id replaces the old companion connection", async () => {
  const { relay, base } = await start();
  const a = await companion(base);
  const closedA = new Promise((r) => a.ws.once("close", (code) => r(code)));
  const b = await companion(base);
  assert.equal(b.reply.t, "ok");
  assert.equal(await closedA, 4409);
  assert.deepEqual(relay.online(), ["mein-pc"]);
  b.ws.close();
  await relay.close();
});
