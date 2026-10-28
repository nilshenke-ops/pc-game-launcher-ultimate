// What kind of game is it? – asked by this browser itself, also without the PC (only after the user's "Ja"):
// the Microsoft Store catalog (what the Xbox app sells) and Wikipedia allow requests from websites (CORS); Steam does
// not, its achievements come only through the PC. Only the game's name is sent. Nothing is scraped.

export interface GameInfo { name: string; source: string; url: string; genres: string[]; categories: string[]; description: string | null; text: string | null }

const EDITION = new Set(["special", "edition", "remastered", "remaster", "deluxe", "goty", "game", "of", "the", "year", "definitive", "anniversary", "enhanced",
  "complete", "ultimate", "legendary", "gold", "standard", "director", "directors", "s", "cut", "hd", "collection", "digital", "premium", "classic", "version"]);
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Same game, not another one of the series: "Skyrim" = "The Elder Scrolls V: Skyrim Special Edition", "Minecraft" ≠ "Minecraft Dungeons". */
export function sameGame(storeName: string, wanted: string): boolean {
  const name = words(storeName), want = words(wanted);
  if (!name.length || !want.length) return false;
  if (name.join("") === want.join("")) return true;
  for (let i = 0; i + want.length <= name.length; i++) {
    if (want.every((w, k) => name[i + k] === w)) return name.slice(i + want.length).every((w) => EDITION.has(w));
  }
  return false;
}

async function getJson<T>(url: string, ms = 8000): Promise<T> {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`${new URL(url).host} antwortet mit ${r.status}${r.status === 429 ? " (zu viele Anfragen – später noch einmal)" : ""}.`);
    return (await r.json()) as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`${new URL(url).host} antwortet nicht.`);
    throw e;
  } finally { clearTimeout(timer); }
}

type MsSuggest = { Results?: { Products?: { Type?: string; ProductId?: string }[] }[] };
type MsProducts = { Products?: { ProductKind?: string; ProductId?: string; LocalizedProperties?: { ProductTitle?: string; ShortDescription?: string; ProductDescription?: string }[]; Properties?: { Categories?: string[] } }[] };

export async function microsoftStore(game: string): Promise<GameInfo | null> {
  const base = "https://displaycatalog.mp.microsoft.com/v7.0";
  const s = await getJson<MsSuggest>(`${base}/productFamilies/autosuggest?market=DE&languages=de-de&query=${encodeURIComponent(game)}&productFamilyNames=Games`);
  const ids = [...new Set((s.Results ?? []).flatMap((r) => r.Products ?? []).filter((p) => p.Type === "Game" && /^[A-Z0-9]{12}$/.test(p.ProductId ?? "")).map((p) => p.ProductId!))].slice(0, 6);
  if (!ids.length) return null;
  const d = await getJson<MsProducts>(`${base}/products?bigIds=${ids.join(",")}&market=DE&languages=de-de`);
  for (const p of d.Products ?? []) {
    if (p.ProductKind && p.ProductKind !== "Game") continue;
    const lp = p.LocalizedProperties?.[0];
    const title = lp?.ProductTitle ?? "";
    if (!sameGame(title, game)) continue;
    const desc = (lp?.ShortDescription || lp?.ProductDescription || "").replace(/\s+/g, " ").trim().slice(0, 1200) || null;
    return { name: title, source: "Microsoft Store / Xbox", url: `https://www.xbox.com/de-DE/games/store/x/${p.ProductId}`, genres: (p.Properties?.Categories ?? []).slice(0, 5), categories: [], description: desc, text: lp?.ProductDescription?.slice(0, 6000) ?? null };
  }
  return null;
}

type WikiSearch = { pages?: { key: string; title: string; description?: string | null }[] };
type WikiExtract = { query?: { pages?: Record<string, { title?: string; extract?: string; missing?: string }> } };

/** Only a page that Wikipedia itself describes as a game ("Computerspiel", "video game"). */
export async function wikipedia(game: string, lang: "de" | "en"): Promise<GameInfo | null> {
  const host = `https://${lang}.wikipedia.org`;
  const s = await getJson<WikiSearch>(`${host}/w/rest.php/v1/search/title?q=${encodeURIComponent(game)}&limit=6`);
  const page = (s.pages ?? []).find((p) => /spiel|game/i.test(p.description ?? ""));
  if (!page) return null;
  const x = await getJson<WikiExtract>(`${host}/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(page.title)}`);
  const text = Object.values(x.query?.pages ?? {}).find((p) => !p.missing)?.extract ?? "";
  const first = text.split(/(?<=[a-zäöüß)"“][.!?])\s+(?=[A-ZÄÖÜ])/)[0]?.slice(0, 400) ?? null;
  return { name: page.title, source: `Wikipedia (${lang}.wikipedia.org)`, url: `${host}/wiki/${encodeURIComponent(page.key)}`, genres: [], categories: [], description: first || page.description || null, text: text.slice(0, 15000) || null };
}

/** Microsoft Store first (store words for the genre), Wikipedia for the description of how the game is played. */
export async function lookupGame(game: string): Promise<GameInfo> {
  const errors: string[] = [];
  const tryIt = async <T,>(f: () => Promise<T | null>) => { try { return await f(); } catch (e) { errors.push((e as Error).message); return null; } };
  const ms = await tryIt(() => microsoftStore(game));
  const wiki = (await tryIt(() => wikipedia(ms?.name ?? game, "de"))) ?? (await tryIt(() => wikipedia(ms?.name ?? game, "en")));
  if (ms && wiki) return { ...ms, source: `${ms.source} + ${wiki.source}`, text: [ms.text, wiki.text].filter(Boolean).join("\n").slice(0, 15000) };
  if (ms ?? wiki) return (ms ?? wiki)!;
  throw new Error(errors.length ? errors.join(" ") : `Zu „${game}“ habe ich im Microsoft Store und bei Wikipedia kein Spiel gefunden.`);
}
