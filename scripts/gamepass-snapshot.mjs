#!/usr/bin/env node
// Writes a snapshot of the public PC Game Pass catalog (all PC games: id, title, cover, category) as JSON.
// The hosted website shows it while no PC is connected; a connected PC always uses its own live catalog.
// Usage: node scripts/gamepass-snapshot.mjs <output.json> [market=DE] [language=de-de]
// If <output.json> already exists, "firstSeen" dates are kept so newly added games can be marked "Neu".
// Same public endpoints as the companion (Companion.Core/Services/GamePassService.cs).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [out, market = "DE", lang = "de-de"] = process.argv.slice(2);
if (!out) { console.error("Usage: node scripts/gamepass-snapshot.mjs <output.json> [market] [language]"); process.exit(2); }
const LIST = "609d944c-d395-4c0a-9ea4-e9f39b52c1ad"; // "Alle PC-Spiele"

async function json(url) {
  const r = await fetch(url, { headers: { "User-Agent": "PCGameLauncherUltimate/1.0" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

const ids = [...new Set((await json(`https://catalog.gamepass.com/sigls/v2?id=${LIST}&language=${lang}&market=${market}`))
  .map((e) => e.id).filter((id) => /^[0-9A-Z]{12}$/.test(id ?? "")))];
if (ids.length < 50) throw new Error(`Katalog unplausibel klein (${ids.length})`);

const games = [];
for (let i = 0; i < ids.length; i += 20) {
  const d = await json(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ids.slice(i, i + 20).join(",")}&market=${market}&languages=${lang}&MS-CV=PGLauncher.0`);
  for (const p of d.Products ?? []) {
    const lp = p.LocalizedProperties?.[0];
    if (!lp?.ProductTitle || !/^[0-9A-Z]{12}$/.test(p.ProductId)) continue;
    const img = ["Poster", "BoxArt"].map((k) => lp.Images?.find((x) => x.ImagePurpose === k)).find(Boolean);
    let cover = img?.Uri ? (img.Uri.startsWith("//") ? "https:" + img.Uri : img.Uri) : undefined;
    if (cover && !cover.startsWith("https://store-images.s-microsoft.com/")) cover = undefined;
    games.push({ id: p.ProductId, title: lp.ProductTitle.trim(), cover, category: p.Properties?.Category ?? undefined });
  }
}
let previous = null;
try { if (existsSync(out)) previous = JSON.parse(readFileSync(out, "utf8")); } catch { /* start fresh */ }
const now = new Date().toISOString();
const seen = new Map((previous?.games ?? []).map((g) => [g.id, g.firstSeen ?? previous.initialAt ?? previous.fetchedAt]));
for (const g of games) g.firstSeen = seen.get(g.id) ?? now;
if (previous && games.length < (previous.games?.length ?? 0) / 2) throw new Error(`Antwort unvollständig (${games.length} statt ${previous.games.length}) – Datei bleibt unverändert`);
games.sort((a, b) => a.title.localeCompare(b.title, "de"));
writeFileSync(out, JSON.stringify({ fetchedAt: now, initialAt: previous?.initialAt ?? previous?.fetchedAt ?? now, market, games }));
console.log(`${games.length} Spiele → ${out}`);
