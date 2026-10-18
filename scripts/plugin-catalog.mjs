#!/usr/bin/env node
// Builds the official plugin catalog: packs every folder in plugins/examples, writes catalog.json and signs it
// (catalog.json.sig, ECDSA P-256 like updates; key from PGL_UPDATE_SIGNING_KEY or --key). Output goes to gh-pages/plugins/.
// Usage: node scripts/plugin-catalog.mjs --out <dir> --base-url https://…/plugins [--key secrets/update-signing-key.pem]
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pack } from "../plugins/sdk/pack.mjs";

const root = new URL("..", import.meta.url).pathname;
const arg = (n) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : undefined; };
const out = arg("out"), base = arg("base-url");
if (!out || !base?.startsWith("https://")) { console.error("--out und --base-url (https) nötig"); process.exit(1); }
const examples = join(root, "plugins/examples");
const plugins = readdirSync(examples).sort().map((d) => {
  const r = pack(join(examples, d), out);
  const m = r.manifest;
  return { id: m.id, name: m.name, version: m.version, description: m.description, author: m.author, category: m.category, platforms: m.platforms,
    permissions: m.permissions, minAppVersion: m.minAppVersion, trust: "official", url: `${base}/${r.fileName}`, sha256: r.sha256, size: r.size, changelog: m.changelog ?? [] };
});
const json = Buffer.from(JSON.stringify({ version: 1, generated: new Date().toISOString().slice(0, 10), plugins }, null, 2) + "\n");
const pem = process.env.PGL_UPDATE_SIGNING_KEY || (arg("key") ? readFileSync(arg("key"), "utf8") : "");
if (!pem.trim()) { console.error("Kein Signaturschlüssel – der Begleiter akzeptiert nur einen signierten offiziellen Katalog."); process.exit(1); }
const sig = sign("sha256", json, { key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" });
const src = readFileSync(join(root, "companion/src/Companion.Core/Services/SystemServices.cs"), "utf8");
const pub = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/.exec(src)[0].split("\n").map((l) => l.trim()).join("\n");
if (!verify("sha256", json, { key: createPublicKey(pub), dsaEncoding: "ieee-p1363" }, sig)) { console.error("Schlüssel passt nicht zum Begleiter"); process.exit(1); }
writeFileSync(join(out, "catalog.json"), json);
writeFileSync(join(out, "catalog.json.sig"), sig.toString("base64") + "\n");
console.log(`Katalog: ${plugins.length} Plugins → ${out}`);
