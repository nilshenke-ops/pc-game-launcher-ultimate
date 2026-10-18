#!/usr/bin/env node
// Signs an already published (unsigned) GitHub Release – for when the release workflow ran without the secret
// PGL_UPDATE_SIGNING_KEY. Downloads the release's update.json and EXE, checks size + SHA-256 itself (the manifest is
// not trusted blindly), signs with the private key and writes update.json, releases.json and info for the website.
//
// Usage: PGL_UPDATE_SIGNING_KEY="$(cat key.pem)" node scripts/sign-release.mjs <version> --out <dir> [--history <releases.json>]
//    or: node scripts/sign-release.mjs <version> --key secrets/update-signing-key.pem --out <dir>
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const arg = (name) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : undefined; };
const fail = (msg) => { console.error("Fehler: " + msg); process.exit(1); };
const version = process.argv[2];
const out = arg("out");
if (!/^\d+\.\d+\.\d+$/.test(version ?? "") || !out) fail("Aufruf: sign-release.mjs <X.Y.Z> --out <ordner> [--key <pem>] [--history <releases.json>]");
const repo = process.env.GITHUB_REPOSITORY ?? "nilshenke-ops/pc-game-launcher-ultimate";
const base = `https://github.com/${repo}/releases/download/v${version}`;

const get = async (url) => { const r = await fetch(url, { redirect: "follow" }); if (!r.ok) fail(`${url}: HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
const manifest = JSON.parse((await get(`${base}/update.json`)).toString("utf8"));
if (manifest.version !== version) fail(`update.json nennt Version ${manifest.version}`);
if (!manifest.url.startsWith(base + "/")) fail("Download-Adresse zeigt nicht auf dieses Release");
const exe = await get(manifest.url);
const sha = createHash("sha256").update(exe).digest("hex");
if (exe.length !== manifest.size || sha !== manifest.sha256) fail("Heruntergeladene EXE passt nicht zu update.json – nicht signiert");
console.log(`EXE geprüft: ${exe.length} Bytes, SHA-256 ${sha}`);

const pem = process.env.PGL_UPDATE_SIGNING_KEY || (arg("key") ? readFileSync(arg("key"), "utf8") : "");
if (!pem.trim()) fail("Kein Signaturschlüssel");
const payload = Buffer.from(`pgl-update-v1\n${version}\n${sha}\n${exe.length}`);
manifest.signature = sign("sha256", payload, { key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" }).toString("base64");
const src = readFileSync(join(root, "companion/src/Companion.Core/Services/SystemServices.cs"), "utf8");
const builtIn = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/.exec(src)[0].split("\n").map((l) => l.trim()).join("\n");
if (!verify("sha256", payload, { key: createPublicKey(builtIn), dsaEncoding: "ieee-p1363" }, Buffer.from(manifest.signature, "base64")))
  fail("Schlüssel passt nicht zum öffentlichen Schlüssel im Begleiter");

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "update.json"), JSON.stringify(manifest, null, 2) + "\n");
let history = [];
const hist = arg("history");
if (hist && existsSync(hist)) { try { history = JSON.parse(readFileSync(hist, "utf8")); } catch { history = []; } }
history = [manifest, ...history.filter((r) => r.version !== version)].slice(0, 50);
writeFileSync(join(out, "releases.json"), JSON.stringify(history, null, 2) + "\n");
writeFileSync(join(out, "info"), JSON.stringify({ available: true, fileName: manifest.fileName, size: manifest.size, sha256: sha, version, date: manifest.date, url: manifest.url }));
console.log(`Signiert: ${out}/update.json`);
