// Microsoft Store (Xbox) prices straight from this device – the catalog allows browser requests, so the Deal Radar
// works on the phone without the PC. Same rules as the PC (DealService): only buyable offers of the game itself, no
// add-on bundles, no prices that need a subscription first (Game Pass member price).
import { readJson, writeJson } from "./rpc";

export interface MsPrice { productId: string; title: string; finalCents: number; initialCents: number; currency: string; image?: string | null; at: number }
export type MsResult = MsPrice | { error: string; at: number };

const BASE = "https://displaycatalog.mp.microsoft.com/v7.0";
const ADDON_WORDS = ["add-on", "addon", "upgrade", "season pass", "dlc", "erweiterung", "expansion", "car pack", "vip"];

const EDITION_WORDS = new Set(["edition", "standard", "deluxe", "premium", "ultimate", "gold", "complete", "definitive", "goty", "game", "of", "the", "year",
  "for", "für", "fur", "pc", "windows", "10", "11", "launcher", "java", "bedrock", "digital", "and", "und", "remastered", "enhanced"]);
const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** The searched game itself, possibly with an edition name after it – "Minecraft Legends" is not "Minecraft" (same rule as the PC). */
export function sameGame(query: string, title: string) {
  const q = tokens(query), t = tokens(title);
  if (!q.length || t.length < q.length || q.some((w, i) => t[i] !== w)) return false;
  return t.slice(q.length).every((w) => EDITION_WORDS.has(w));
}

export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

interface Product {
  ProductId: string; ProductKind?: string;
  LocalizedProperties: { ProductTitle: string; Images?: { ImagePurpose: string; Uri: string }[] }[];
  MarketProperties?: { RelatedProducts?: { RelationshipType: string }[] }[];
  DisplaySkuAvailabilities: { Availabilities: { Actions?: string[]; RemediationRequired?: boolean; OrderManagementData?: { Price?: { CurrencyCode: string; ListPrice: number; MSRP: number } } }[] }[];
}

function image(p: Product): string | null {
  for (const purpose of ["SuperHeroArt", "TitledHeroArt", "BoxArt", "Poster"]) {
    const u = p.LocalizedProperties[0]?.Images?.find((i) => i.ImagePurpose === purpose)?.Uri;
    if (u) { const url = u.startsWith("//") ? "https:" + u : u; try { if (new URL(url).host === "store-images.s-microsoft.com") return url; } catch { /* bad url */ } }
  }
  return null;
}

/** Picks the cheapest buyable edition whose title contains the searched name (pure – tested with real answers). */
export function pickBest(title: string, products: Product[]): Omit<MsPrice, "at"> | null {
  const q = norm(title);
  let best: Omit<MsPrice, "at"> | null = null;
  for (const p of products) {
    if (p.ProductKind && p.ProductKind !== "Game") continue;
    const name = p.LocalizedProperties[0]?.ProductTitle ?? "";
    const n = norm(name);
    if (!sameGame(title, name)) continue;
    if (ADDON_WORDS.some((w) => n.includes(norm(w)) && !q.includes(norm(w)))) continue;
    for (const a of p.DisplaySkuAvailabilities[0]?.Availabilities ?? []) {
      if (!a.Actions?.includes("Purchase") || a.RemediationRequired) continue;
      const pr = a.OrderManagementData?.Price;
      if (!pr || pr.ListPrice <= 0) continue;
      const final = Math.round(pr.ListPrice * 100), initial = Math.round(Math.max(pr.MSRP, pr.ListPrice) * 100);
      if (!best || final < best.finalCents) best = { productId: p.ProductId, title: name, finalCents: final, initialCents: initial, currency: pr.CurrencyCode, image: image(p) };
      break;
    }
  }
  return best;
}

export async function fetchMsPrice(title: string, country: string, fetcher: typeof fetch = fetch): Promise<MsResult> {
  const market = country.toUpperCase();
  const lang = ["de", "at", "ch"].includes(country) ? "de-de" : "en-us";
  try {
    const sug = await (await fetcher(`${BASE}/productFamilies/autosuggest?market=${market}&languages=${lang}&query=${encodeURIComponent(title)}&productFamilyNames=Games`)).json();
    const ids = [...new Set((sug.Results ?? []).flatMap((r: { Products: { ProductId: string; Type: string }[] }) => r.Products).filter((p: { Type: string }) => p.Type === "Game").map((p: { ProductId: string }) => p.ProductId))].slice(0, 8);
    if (!ids.length) return { error: "Im Microsoft Store nicht gefunden.", at: Date.now() };
    const det = await (await fetcher(`${BASE}/products?bigIds=${ids.join(",")}&market=${market}&languages=${lang}`)).json();
    const best = pickBest(title, det.Products ?? []);
    return best ? { ...best, at: Date.now() } : { error: "Im Microsoft Store kein kaufbares Angebot mit diesem Namen.", at: Date.now() };
  } catch {
    return { error: "Microsoft Store nicht erreichbar.", at: Date.now() };
  }
}

const KEY = "pgl.deals.ms";
/** Prices this device fetched itself, per wish-list entry (kept for 7 days). */
export function phonePrices(): Record<string, MsResult> {
  const all = readJson<Record<string, MsResult>>(KEY) ?? {};
  const week = Date.now() - 7 * 864e5;
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v && v.at > week));
}
export function savePhonePrice(id: string, r: MsResult) { writeJson(KEY, { ...phonePrices(), [id]: r }); }
