#!/usr/bin/env node
// Creates the release metadata for the version in ../VERSION:
//   update.json   – what the companion and the website read (version, date, file, size, SHA-256, changes, signature)
//   releases.json – version history (newest first), merged with --history
//   info          – download info for the website's download card
//   SHA256SUMS.txt, release-notes.md
// Signature: ECDSA P-256/SHA-256 over "pgl-update-v1\n{version}\n{sha256}\n{size}" (IEEE P1363, Base64) – the same
// payload the companion verifies. The private key comes from the environment variable PGL_UPDATE_SIGNING_KEY (PEM)
// or --key <file>; it is never written anywhere. The signature is checked against the public key built into the companion.
//
// Usage: node scripts/release-manifest.mjs --exe <exe> --zip <zip> --base-url <https://…/download/vX.Y.Z> --out <dir>
//        [--history <releases.json>] [--date YYYY-MM-DD] [--key <pem>] [--allow-unsigned]
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes("--" + name);
const fail = (msg) => { console.error("Fehler: " + msg); process.exit(1); };

const version = readFileSync(join(root, "VERSION"), "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`VERSION „${version}“ ist nicht MAJOR.MINOR.PATCH`);
const exe = arg("exe"), zip = arg("zip"), baseUrl = arg("base-url"), out = arg("out");
if (!exe || !zip || !baseUrl || !out) fail("--exe, --zip, --base-url und --out sind nötig");
if (!baseUrl.startsWith("https://")) fail("--base-url muss https sein");
for (const f of [exe, zip]) if (!existsSync(f)) fail(`${f} fehlt`);
const date = arg("date", new Date().toISOString().slice(0, 10));

/** Section "## X.Y.Z – date" of CHANGELOG.md with "### Neu/Verbessert/Behoben" lists. */
export function parseChangelog(text, v) {
  const start = text.search(new RegExp(`^## ${v.replace(/\./g, "\\.")}\\b`, "m"));
  if (start < 0) return null;
  const rest = text.slice(start + 3);
  const end = rest.search(/^## /m);
  const body = end < 0 ? rest : rest.slice(0, end);
  const changes = { neu: [], verbessert: [], behoben: [] };
  let cur = null;
  for (const line of body.split("\n")) {
    const h = /^### (.+)/.exec(line);
    if (h) { cur = { neu: "neu", verbessert: "verbessert", behoben: "behoben" }[h[1].trim().toLowerCase()] ?? null; continue; }
    const item = /^- (.+)/.exec(line);
    if (item && cur) changes[cur].push(item[1].trim());
  }
  return changes;
}

const changes = parseChangelog(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
if (!changes || changes.neu.length + changes.verbessert.length + changes.behoben.length === 0) fail(`CHANGELOG.md hat keinen Eintrag für ${version}`);

const file = (p) => { const b = readFileSync(p); return { size: statSync(p).size, sha256: createHash("sha256").update(b).digest("hex"), name: basename(p) }; };
const e = file(exe), z = file(zip);
const payload = Buffer.from(`pgl-update-v1\n${version}\n${e.sha256}\n${e.size}`);

/**
 * Reads the private key also when it was pasted into the GitHub secret in a slightly broken form: literal "\\n",
 * Windows line ends, quotes, everything on one line or only the base64 part without the BEGIN/END lines.
 * On failure only the shape is reported (length, lines, header present) – never any key material.
 */
function loadSigningKey(raw) {
  let text = raw.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(text);
  const label = m ? m[1] : "PRIVATE KEY";
  const body = (m ? m[2] : text).replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(body) && body.length > 40) text = `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;
  try { return createPrivateKey(text); }
  catch (e) {
    const lines = raw.split(/\r?\n/).length;
    fail(`Signaturschlüssel (Secret PGL_UPDATE_SIGNING_KEY) ist nicht lesbar: ${e.code ?? e.message}. Form: ${raw.length} Zeichen, ${lines} Zeile(n), ` +
      `BEGIN-Zeile ${/-----BEGIN [A-Z ]+-----/.test(raw) ? "vorhanden" : "fehlt"}, END-Zeile ${/-----END [A-Z ]+-----/.test(raw) ? "vorhanden" : "fehlt"}. ` +
      "Erwartet: der komplette Inhalt von secrets/update-signing-key.pem (5 Zeilen, von -----BEGIN PRIVATE KEY----- bis -----END PRIVATE KEY-----).");
  }
}

let signature = null;
const pem = process.env.PGL_UPDATE_SIGNING_KEY || (arg("key") ? readFileSync(arg("key"), "utf8") : "");
if (pem.trim()) {
  const key = loadSigningKey(pem);
  signature = sign("sha256", payload, { key, dsaEncoding: "ieee-p1363" }).toString("base64");
  // Must match the public key the companion trusts – otherwise every installed companion would reject the update.
  const src = readFileSync(join(root, "companion/src/Companion.Core/Services/SystemServices.cs"), "utf8");
  const builtIn = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/.exec(src)[0].split("\n").map((l) => l.trim()).join("\n");
  if (!verify("sha256", payload, { key: createPublicKey(builtIn), dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64")))
    fail("Signaturschlüssel passt nicht zum öffentlichen Schlüssel im Begleiter");
} else if (!flag("allow-unsigned")) fail("Kein Signaturschlüssel (PGL_UPDATE_SIGNING_KEY oder --key). Unsignierte Updates lehnt der Begleiter ab.");

const notes = [...changes.neu, ...changes.verbessert].slice(0, 3).join(" · ");
const manifest = {
  version, date, channel: "stable",
  fileName: e.name, url: `${baseUrl}/${e.name}`, size: e.size, sha256: e.sha256,
  zip: { fileName: z.name, url: `${baseUrl}/${z.name}`, size: z.size, sha256: z.sha256 },
  notes, changes, signature,
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "update.json"), JSON.stringify(manifest, null, 2) + "\n");

let history = [];
const hist = arg("history");
if (hist && existsSync(hist)) { try { history = JSON.parse(readFileSync(hist, "utf8")); } catch { history = []; } }
history = [manifest, ...history.filter((r) => r.version !== version)].slice(0, 50);
writeFileSync(join(out, "releases.json"), JSON.stringify(history, null, 2) + "\n");

writeFileSync(join(out, "info"), JSON.stringify({ available: true, fileName: e.name, size: e.size, sha256: e.sha256, version, date, url: manifest.url }));
writeFileSync(join(out, "SHA256SUMS.txt"), `${e.sha256}  ${e.name}\n${z.sha256}  ${z.name}\n`);
const md = (title, list) => (list.length ? `### ${title}\n${list.map((x) => `- ${x}`).join("\n")}\n\n` : "");
writeFileSync(join(out, "release-notes.md"),
  `${md("Neu", changes.neu)}${md("Verbessert", changes.verbessert)}${md("Behoben", changes.behoben)}` +
  `**Prüfsummen (SHA-256)**\n\n- \`${e.name}\`: \`${e.sha256}\` (${e.size} Bytes)\n- \`${z.name}\`: \`${z.sha256}\` (${z.size} Bytes)\n\n` +
  `Signiert: ${signature ? "ja (ECDSA P-256, Schlüssel des Projekts)" : "nein"}\n`);
console.log(`Version ${version} vom ${date}: ${e.name} ${e.size} Bytes, SHA-256 ${e.sha256}, signiert: ${signature ? "ja" : "nein"}`);
