#!/usr/bin/env node
// Steam prices and pictures for the website (GitHub Actions, see .github/workflows/steam-prices.yml).
// Steam only allows its own web pages to ask its price API from a browser, so the phone cannot ask Steam directly.
// These files lie next to the website – the phone reads them without the PC and without sending anything about its
// wish list.
//
//   node scripts/steam-price-index.mjs --out <dir> [--country de] [--pages 30]
//       → <dir>/steam-de.json: popular games (top sellers, most wished, new, on sale), every 6 hours
//   STEAM_API_KEY=… node scripts/steam-price-index.mjs --all --out <dir> [--country de]
//       → <dir>/apps/<a-z|0-9|_>.json: every game on Steam (name, price, picture), split by first letter, once a day
//
// Row format in both: [appId, name, finalCents | null, initialCents | null, discountPercent, headerPicturePath | null]
// Picture: https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/<appId>/<headerPicturePath>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((v, i, all) => (v.startsWith("--") ? [v.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? "1" : all[i + 1]] : null)).filter(Boolean));
const out = args.out ?? "steam-prices";
const country = (args.country ?? "de").toLowerCase();
const pages = Number(args.pages ?? 30);
const all = args.all === "1";
const UA = "NexusGamingHub-PriceIndex/1.0 (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)";
const CURRENCY = { gb: "GBP", us: "USD", ch: "CHF", pl: "PLN" }[country] ?? "EUR";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 1; ; i++) {
    let wait = 2000 * i;
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
      if (r.ok) return await r.json();
      if (r.status === 429) wait = 20000 * i; // Steam asks to slow down
      if (i >= tries) throw new Error(`HTTP ${r.status}`); // never the URL: it may hold the API key
    } catch (e) { if (i >= tries) throw e; }
    await sleep(wait);
  }
}

/** Prices and header pictures for up to 100 apps per request. */
async function details(ids, names) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const input = { ids: chunk.map((appid) => ({ appid })), context: { language: "german", country_code: country.toUpperCase() }, data_request: { include_assets: true } };
    try {
      const d = await get(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      for (const it of d.response?.store_items ?? []) {
        if (!it.appid || !it.visible) continue;
        const name = it.name ?? names.get(it.appid) ?? "";
        const header = typeof it.assets?.header === "string" ? it.assets.header : null;
        const o = it.best_purchase_option;
        if (it.is_free) rows.push([it.appid, name, 0, 0, 0, header]);
        else if (o?.final_price_in_cents != null) rows.push([it.appid, name, Number(o.final_price_in_cents), Number(o.original_price_in_cents ?? o.final_price_in_cents), Number(o.discount_pct ?? 0), header]);
        else rows.push([it.appid, name, null, null, 0, header]); // not buyable (yet): name and picture still help
      }
    } catch (e) { console.error(`Details ab ${i}: ${e.message}`); }
    await sleep(all ? 350 : 300);
    if (all && i % 10000 === 0) console.log(`… ${i}/${ids.length}`);
  }
  return rows;
}

const meta = () => ({ version: 2, country, currency: CURRENCY, updatedAt: new Date().toISOString(), source: "Steam (store.steampowered.com / api.steampowered.com)",
  columns: ["appId", "name", "finalCents", "initialCents", "discountPercent", "header"] });

/** First letter of the name (a–z, 0–9, else "_") – the phone only loads the part it needs. */
export const shard = (name) => { const c = (name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]/) ?? ["_"])[0]; return c; };

if (all) {
  const key = process.env.STEAM_API_KEY;
  if (!key) { console.error("STEAM_API_KEY fehlt."); process.exit(1); }
  const names = new Map();
  let last = 0;
  for (let page = 0; page < 20; page++) {
    const d = await get(`https://api.steampowered.com/IStoreService/GetAppList/v1/?key=${encodeURIComponent(key)}&include_games=true&include_dlc=false&include_software=false&include_videos=false&include_hardware=false&max_results=50000&last_appid=${last}`);
    for (const a of d.response?.apps ?? []) names.set(a.appid, a.name);
    if (!d.response?.have_more_results) break;
    last = d.response.last_appid;
    await sleep(1000);
  }
  console.log(`${names.size} Spiele bei Steam`);
  if (names.size < 10000) { console.error("Zu wenige Spiele – nichts ersetzt."); process.exit(1); }
  const rows = await details([...names.keys()], names);
  if (rows.length < 10000) { console.error(`Nur ${rows.length} Einträge – nichts ersetzt.`); process.exit(1); }
  const parts = new Map();
  for (const r of rows) { const k = shard(r[1]); if (!parts.has(k)) parts.set(k, []); parts.get(k).push(r); }
  mkdirSync(join(out, "apps"), { recursive: true });
  for (const [k, items] of parts) writeFileSync(join(out, "apps", `${k}.json`), JSON.stringify({ ...meta(), items }));
  writeFileSync(join(out, "apps", "index.json"), JSON.stringify({ ...meta(), parts: Object.fromEntries([...parts].map(([k, v]) => [k, v.length])) }));
  console.log(`${rows.length} Spiele in ${parts.size} Teilen → ${join(out, "apps")}`);
} else {
  /** App ids and names from a Steam search list (only games: category1=998). */
  async function list(filter, n) {
    const found = [];
    for (let p = 0; p < n; p++) {
      const d = await get(`https://store.steampowered.com/search/results/?query=&start=${p * 100}&count=100&filter=${filter}&cc=${country}&l=german&json=1&category1=998`);
      const items = d.items ?? [];
      for (const it of items) { const m = /\/apps\/(\d+)\//.exec(it.logo ?? ""); if (m) found.push({ appId: Number(m[1]), name: String(it.name ?? "") }); }
      if (items.length < 100) break;
      await sleep(1500);
    }
    return found;
  }
  const sources = [["topsellers", pages], ["popularwishlist", Math.ceil(pages / 3)], ["popularnew", Math.ceil(pages / 6)], ["specials", Math.ceil(pages / 3)]];
  const names = new Map();
  for (const [filter, n] of sources) {
    try { for (const a of await list(filter, n)) if (!names.has(a.appId)) names.set(a.appId, a.name); }
    catch (e) { console.error(`Liste ${filter}: ${e.message}`); }
    await sleep(5000);
  }
  console.log(`${names.size} Spiele gefunden`);
  const items = (await details([...names.keys()], names)).filter((r) => r[2] != null);
  if (items.length < 50) { console.error(`Nur ${items.length} Preise – Liste wird nicht ersetzt.`); process.exit(1); }
  mkdirSync(out, { recursive: true });
  const file = join(out, `steam-${country}.json`);
  writeFileSync(file, JSON.stringify({ ...meta(), items }));
  console.log(`${items.length} Preise → ${file}`);
}
