#!/usr/bin/env node
// Steam price list for the website (runs every few hours as a GitHub Action, see .github/workflows/steam-prices.yml).
// Steam only allows its own web pages to ask its price API from a browser, so the phone cannot ask Steam directly.
// This list holds current Steam prices of popular games (top sellers, most wished, new, on sale) and lies next to the
// website – the phone reads it without the PC and without sending anything about its wish list.
//
// Usage: node scripts/steam-price-index.mjs --out <dir> [--country de] [--pages 30]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const out = args.out ?? "steam-prices";
const country = (args.country ?? "de").toLowerCase();
const pages = Number(args.pages ?? 30);
const UA = "NexusGamingHub-PriceIndex/1.0 (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 1; ; i++) {
    let wait = 2000 * i;
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      if (r.ok) return await r.json();
      if (r.status === 429) wait = 20000 * i; // Steam asks to slow down
      if (i >= tries) throw new Error(`${r.status} ${url}`);
    } catch (e) { if (i >= tries) throw e; }
    await sleep(wait);
  }
}

/** App ids and names from a Steam search list (only games: category1=998). */
async function list(filter, n) {
  const found = [];
  for (let p = 0; p < n; p++) {
    const d = await get(`https://store.steampowered.com/search/results/?query=&start=${p * 100}&count=100&filter=${filter}&cc=${country}&l=german&json=1&category1=998`);
    const items = d.items ?? [];
    for (const it of items) {
      const m = /\/apps\/(\d+)\//.exec(it.logo ?? "");
      if (m) found.push({ appId: Number(m[1]), name: String(it.name ?? "") });
    }
    if (items.length < 100) break;
    await sleep(1500);
  }
  return found;
}

const sources = [["topsellers", pages], ["popularwishlist", Math.ceil(pages / 3)], ["popularnew", Math.ceil(pages / 6)], ["specials", Math.ceil(pages / 3)]];
const apps = new Map();
for (const [filter, n] of sources) {
  try { for (const a of await list(filter, n)) if (!apps.has(a.appId)) apps.set(a.appId, a.name); }
  catch (e) { console.error(`Liste ${filter}: ${e.message}`); }
  await sleep(5000);
}
console.log(`${apps.size} Spiele gefunden`);

const ids = [...apps.keys()];
const items = [];
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100);
  const input = { ids: chunk.map((appid) => ({ appid })), context: { language: "german", country_code: country.toUpperCase() }, data_request: {} };
  try {
    const d = await get(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
    for (const it of d.response?.store_items ?? []) {
      if (!it.appid || !it.visible) continue;
      const name = it.name ?? apps.get(it.appid) ?? "";
      const o = it.best_purchase_option;
      if (it.is_free) items.push([it.appid, name, 0, 0, 0]);
      else if (o?.final_price_in_cents != null) {
        const final = Number(o.final_price_in_cents), initial = Number(o.original_price_in_cents ?? o.final_price_in_cents);
        items.push([it.appid, name, final, initial, Number(o.discount_pct ?? 0)]);
      }
    }
  } catch (e) { console.error(`Preise ${i}: ${e.message}`); }
  await sleep(300);
}
if (items.length < 50) { console.error(`Nur ${items.length} Preise – Liste wird nicht ersetzt.`); process.exit(1); }

mkdirSync(out, { recursive: true });
const file = join(out, `steam-${country}.json`);
writeFileSync(file, JSON.stringify({
  version: 1, country, currency: country === "gb" ? "GBP" : country === "us" ? "USD" : country === "ch" ? "CHF" : country === "pl" ? "PLN" : "EUR",
  updatedAt: new Date().toISOString(), source: "Steam (store.steampowered.com / api.steampowered.com)",
  columns: ["appId", "name", "finalCents", "initialCents", "discountPercent"], items,
}));
console.log(`${items.length} Preise → ${file}`);
