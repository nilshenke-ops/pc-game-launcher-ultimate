#!/usr/bin/env node
// Prüft alle Links auf die eigene Webseite und das eigene Repository (Quelltext, Doku, Hilfetexte) auf 404.
// Aufruf: node scripts/check-links.mjs   (Exit-Code 1, wenn ein Link ins Leere führt)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execSync("git ls-files web/src docs README.md companion/src scripts web/public", { encoding: "utf8" }).split("\n").filter((f) => /\.(ts|tsx|md|txt|json|cs|mjs|html|iss)$/.test(f));
const re = /https:\/\/(?:nilshenke-ops\.github\.io\/pc-game-launcher-ultimate|github\.com\/nilshenke-ops\/pc-game-launcher-ultimate)[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*/g;
const HISTORISCH = new Set(["docs/ABSCHLUSSBERICHT.md"]); // alter 1.x-Bericht: nennt Zip-Downloads, die es nicht mehr gibt
const found = new Map();
for (const f of files) {
  if (HISTORISCH.has(f)) continue;
  let text = ""; try { text = readFileSync(f, "utf8"); } catch { continue; }
  for (const m of text.matchAll(re)) { const u = m[0].replace(/[.,;:)'"]+$/, ""); if (!found.has(u)) found.set(u, f); }
}
let bad = 0;
for (const [u, f] of found) {
  if (/\/(download|plugins)\/$/.test(u) || /\/settings\//.test(u)) continue; // Basisverzeichnisse bzw. Seiten, die eine GitHub-Anmeldung brauchen
  if (/\$\{|\{[a-z]+\}|<|>|VERSION|X\.Y/i.test(u)) continue; // Vorlagen mit Platzhaltern
  try {
    let r = await fetch(u, { method: "HEAD", redirect: "follow" });
    if (r.status === 405 || r.status === 403) r = await fetch(u, { redirect: "follow" });
    if (r.status >= 400) { bad++; console.log(`✘ ${r.status} ${u}  (${f})`); }
  } catch (e) { bad++; console.log(`✘ Fehler ${u}  (${f}): ${e.message}`); }
}
console.log(`${found.size} Links geprüft, ${bad} fehlerhaft.`);
process.exit(bad ? 1 : 0);
