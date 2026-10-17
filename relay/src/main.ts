import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRelay, defaultConfig, type RelayConfig } from "./relay.js";

// Configuration: relay.config.json (or PGL_RELAY_CONFIG), overridable by environment variables.
const base = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cfgPath = process.env.PGL_RELAY_CONFIG ?? resolve(base, "relay.config.json");
let cfg: RelayConfig = defaultConfig(base);
if (existsSync(cfgPath)) cfg = { ...cfg, ...JSON.parse(readFileSync(cfgPath, "utf8")) };
if (process.env.PORT) cfg.port = Number(process.env.PORT);
if (process.env.PGL_COMPANIONS) cfg.companions = process.env.PGL_COMPANIONS.split(",").map((x) => { const [id, secretSha256] = x.split(":"); return { id, secretSha256 }; });
if (process.env.PGL_WEB_DIR) cfg.webDir = process.env.PGL_WEB_DIR;
if (process.env.PGL_TRUST_PROXY) cfg.trustProxy = process.env.PGL_TRUST_PROXY === "1";

for (const c of cfg.companions)
  if (!/^[a-z0-9-]{3,40}$/.test(c.id) || !/^[0-9a-f]{64}$/i.test(c.secretSha256)) {
    console.error(`Ungültiger Companion-Eintrag "${c.id}". Erwartet: id (a-z, 0-9, -) und secretSha256 (64 Hex-Zeichen, siehe npm run hash-secret).`);
    process.exit(1);
  }
if (cfg.companions.length === 0) console.warn("Hinweis: Keine Companions konfiguriert – PCs können sich nicht verbinden. Siehe relay/relay.config.example.json.");

const relay = createRelay(cfg);
relay.server.listen(cfg.port, cfg.host, () => {
  console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", msg: "relay listening", port: relay.port(), webDir: cfg.webDir, companions: cfg.companions.map((c) => c.id) }));
});
const stop = () => { relay.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
