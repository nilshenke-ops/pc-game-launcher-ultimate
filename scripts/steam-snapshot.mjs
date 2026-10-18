#!/usr/bin/env node
// Writes the Steam library of one account (owned games with name and playtime) as JSON for the website, so it can be
// looked at while no PC is connected. Runs in GitHub Actions with the repository secrets STEAM_API_KEY and STEAM_ID
// (the key never ends up in the output). Without both secrets it does nothing and exits successfully.
// Usage: STEAM_API_KEY=… STEAM_ID=… node scripts/steam-snapshot.mjs <output.json>
// The Steam profile's "Spieldetails" must be public – the same requirement the PC companion has.
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) { console.error("Usage: node scripts/steam-snapshot.mjs <output.json>"); process.exit(2); }
const key = (process.env.STEAM_API_KEY ?? "").trim();
let id = (process.env.STEAM_ID ?? "").trim();
if (!key || !id) { console.log("STEAM_API_KEY / STEAM_ID nicht gesetzt – Steam-Bibliothek wird nicht veröffentlicht."); process.exit(0); }
if (!/^[0-9A-Fa-f]{32}$/.test(key)) throw new Error("STEAM_API_KEY muss 32 Zeichen (0–9, A–F) haben.");
const API = process.env.STEAM_API_BASE ?? "https://api.steampowered.com";
const COMMUNITY = process.env.STEAM_COMMUNITY_BASE ?? "https://steamcommunity.com";

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": "PCGameLauncherUltimate/1.0" }, signal: AbortSignal.timeout(30000) });
  if (r.status === 401 || r.status === 403) throw new Error("Steam hat den Web-API-Schlüssel abgelehnt.");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// Profile link or vanity name → SteamID64.
const m = id.match(/steamcommunity\.com\/(profiles|id)\/([^/?#\s]+)/i);
if (m) id = m[2];
if (!/^\d{17}$/.test(id)) {
  const xml = await get(`${COMMUNITY}/id/${encodeURIComponent(id)}/?xml=1`);
  const found = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
  if (!found) throw new Error(`Steam-Profil „${id}“ nicht gefunden.`);
  id = found[1];
}

// Diagnosis in the log (public profile data only): which account is used and how Steam reports its visibility.
try {
  const xml = await get(`${COMMUNITY}/profiles/${id}/?xml=1`);
  const tag = (t) => xml.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${t}>`))?.[1];
  console.log(`Profil: „${tag("steamID") ?? "?"}“ · Sichtbarkeit: ${tag("privacyState") ?? "?"}`);
} catch (e) { console.log("Profil-Info nicht abrufbar: " + e.message); }

const data = JSON.parse(await get(`${API}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${id}&include_appinfo=1&include_played_free_games=1&format=json`));
const games = data?.response?.games;
if (!Array.isArray(games)) throw new Error(`Steam liefert keine Spiele für das Profil oben (Antwort: ${JSON.stringify(data?.response ?? data).slice(0, 80)}). Ist es das Konto mit deinen Spielen? Dann in Steam unter Profil → Privatsphäre „Spieldetails“ auf „Öffentlich“ stellen (Änderungen brauchen manchmal einige Minuten).`);
let persona;
try { persona = (await get(`${COMMUNITY}/profiles/${id}/?xml=1`)).match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/)?.[1]; } catch { /* optional */ }

const list = games.filter((g) => g.name).map((g) => ({
  appId: String(g.appid),
  name: g.name,
  playtimeMinutes: g.playtime_forever || undefined,
  lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : undefined,
})).sort((a, b) => a.name.localeCompare(b.name, "de"));
// Real cover art: newer games only have hashed image paths, which Steam's public store API reports (no key needed).
const STORE = process.env.STEAM_STORE_API_BASE ?? "https://api.steampowered.com";
for (let i = 0; i < list.length; i += 50) {
  const ids = list.slice(i, i + 50).map((g) => ({ appid: Number(g.appId) }));
  try {
    const input = JSON.stringify({ ids, context: { language: "german", country_code: "DE" }, data_request: { include_assets: true } });
    const r = JSON.parse(await get(`${STORE}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(input)}`));
    for (const it of r?.response?.store_items ?? []) {
      const a = it.assets, file = a?.library_capsule ?? a?.header;
      const g = list.find((x) => x.appId === String(it.appid));
      if (g && a?.asset_url_format && file) g.cover = "https://shared.akamai.steamstatic.com/store_item_assets/" + a.asset_url_format.replace("${FILENAME}", file);
    }
  } catch (e) { console.log("Cover teilweise nicht abrufbar: " + e.message); }
}
writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), persona, games: list }));
console.log(`${list.length} Steam-Spiele → ${out}`);
