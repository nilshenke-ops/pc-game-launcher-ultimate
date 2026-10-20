import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { NEW_WIDGET_PLUGINS } from "./plugins-list";
import { COMPANION, COMPANION_PORT, HOSTED_PORT, HOSTED_SITE, OBS_PASSWORD, OBS_PORT, RELAY, RELAY_PORT, STATE_FILE } from "./env";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const SECRET = "e2e-relay-secret-0123456789abcdef";

async function waitFor(url: string, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timeout beim Warten auf " + url);
}

export default async function setup() {
  const dll = join(ROOT, "companion/src/Companion.Headless/bin/Debug/net8.0/pgl-companion-headless.dll");
  const relayMain = join(ROOT, "relay/dist/src/main.js");
  if (!existsSync(dll)) throw new Error("Headless-Companion nicht gebaut: dotnet build companion/src/Companion.Headless");
  if (!existsSync(relayMain)) throw new Error("Relay nicht gebaut: cd relay && npm run build");
  if (!existsSync(join(ROOT, "web/dist/index.html"))) throw new Error("Web-App nicht gebaut: cd web && npm run build");
  if (!existsSync(join(ROOT, "web/dist-hosted/index.html"))) throw new Error("Gehostete Web-App nicht gebaut: cd web && npm run build:hosted");

  const work = mkdtempSync(join(tmpdir(), "pgl-e2e-"));
  const dataDir = join(work, "data");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dataDir);
  // Companion settings: own port, relay enabled (secret stored with the headless "plain:" protector).
  writeFileSync(join(dataDir, "settings.json"), JSON.stringify({
    port: COMPANION_PORT, lanAccess: false, pcName: "E2E-Gaming-PC", webAppUrl: HOSTED_SITE,
    relayEnabled: true, relayUrl: `ws://127.0.0.1:${RELAY_PORT}`, relayCompanionId: "e2e-pc", relaySecretProtected: "plain:" + SECRET,
    pluginCatalogUrl: "", updateManifestUrl: "",
  }));
  // A fake "game": a script that writes a marker file when started.
  const game = join(work, "fake-game.sh");
  writeFileSync(game, `#!/bin/sh\necho started > "${join(work, "game-started.txt")}"\n`);
  chmodSync(game, 0o755);

  // Plugin packages: a real example plugin and a probe that tries everything the sandbox must block.
  const { pack } = await import("../../plugins/sdk/pack.mjs");
  pack(join(ROOT, "plugins/examples/spielzeit-heute"), work);
  pack(join(ROOT, "web/e2e/fixtures/sandbox-test"), work);
  pack(join(ROOT, "plugins/examples/cpu-mini"), work);
  for (const p of ["game-overlay", "favoriten-start", "top-woche", "sound-pad", "profil-wechsler", "pc-check", "leistungs-verlauf"]) pack(join(ROOT, "plugins/examples", p), work);
  for (const p of NEW_WIDGET_PLUGINS) pack(join(ROOT, "plugins/examples", p), work);

  const relayCfg = join(work, "relay.json");
  writeFileSync(relayCfg, JSON.stringify({ port: RELAY_PORT, host: "127.0.0.1", webDir: join(ROOT, "web/dist"), downloadsDir: join(work, "downloads"), companions: [{ id: "e2e-pc", secretSha256: createHash("sha256").update(SECRET).digest("hex") }] }));

  const tokenFile = join(work, "admin.txt");
  const dotnet = process.env.DOTNET ?? (existsSync("/opt/dotnet/dotnet") ? "/opt/dotnet/dotnet" : "dotnet");
  const companion = spawn(dotnet, [dll, "--data", dataDir], { env: { ...process.env, PGL_WEB_DIR: join(ROOT, "web/dist"), PGL_ADMIN_TOKEN_FILE: tokenFile, PGL_TEST_LAN_HOST: "127.0.0.1" }, stdio: "ignore", detached: true });
  const relay = spawn(process.execPath, [relayMain], { env: { ...process.env, PGL_RELAY_CONFIG: relayCfg }, stdio: "ignore", detached: true });
  // Stand-in for the static host (Cloudflare Pages / GitHub Pages): serves the hosted build on its own origin.
  const staticServer = spawn(process.execPath, ["-e", `
    const http = require("http"), fs = require("fs"), path = require("path");
    const root = ${JSON.stringify(join(ROOT, "web/dist-hosted"))};
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
    http.createServer((req, res) => {
      let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html");
      res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    }).listen(${HOSTED_PORT}, "127.0.0.1");`], { stdio: "ignore", detached: true });
  staticServer.unref();
  // Stand-in for OBS Studio's WebSocket server (recording and replay buffer).
  const obs = spawn(process.execPath, [join(ROOT, "web/e2e/fixtures/fake-obs.mjs"), String(OBS_PORT), OBS_PASSWORD], { stdio: "ignore", detached: true });
  obs.unref();
  companion.unref(); relay.unref();
  await waitFor(`${COMPANION}/healthz`);
  await waitFor(`${RELAY}/healthz`);
  await waitFor(`${HOSTED_SITE}/`);
  await waitFor(`http://127.0.0.1:${OBS_PORT}/state`);
  // Wait until the companion is connected to the relay.
  const end = Date.now() + 20000;
  while (Date.now() < end && (await (await fetch(`${RELAY}/healthz`)).json()).companionsOnline < 1) await new Promise((r) => setTimeout(r, 300));
  writeFileSync(STATE_FILE, JSON.stringify({ dataDir, workDir: work, adminToken: readFileSync(tokenFile, "utf8").trim(), pids: [companion.pid, relay.pid, staticServer.pid, obs.pid] }));
}
