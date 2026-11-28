// Christmas wish list (3.68): links with a title and a price the person types in, stored with the account (pgl.xmas) and shared as a link.
// The share link carries the list itself inside the address after the "#" – the part of an address a browser never sends to a server – so
// nothing is uploaded, nothing public exists on a server and nothing can be guessed or read by anyone without the link. It is a snapshot:
// who gets the link sees the list as it was when the link was made (a new link after changes). Prices are NOT read from the shops
// (a browser may not read other websites); they are what was typed in.

export const XMAS_KEY = "pgl.xmas";
export const MAX_ITEMS = 100;
const MAX_URL = 600, MAX_TITLE = 120, MAX_NOTE = 200, MAX_NAME = 60;
const MAX_PAYLOAD = 60_000;     // characters of the share code; larger is refused

export interface Wish { id: string; url: string; title: string; priceCents: number | null; note: string; at: number; /** When the price was read from the shop (ms), null when it was typed in. */ priceAt: number | null }
export interface XmasList { title: string; items: Wish[] }

const clamp = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n) : "");

/** "29,99", "29.99", "1.299,00", "1,299.00", "29 €", "29" → cents; null when it is not a price. */
export function parsePrice(raw: string): number | null {
  let s = raw.replace(/[€$£\s]|EUR|eur/g, "").trim();
  if (!s || !/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  const sep = Math.max(lastComma, lastDot);
  if (sep >= 0 && s.length - sep - 1 <= 2 && s.length - sep - 1 >= 1) {     // the last separator is the decimal point: 29,99 · 1.299,5
    s = s.slice(0, sep).replace(/[.,]/g, "") + "." + s.slice(sep + 1);
  } else s = s.replace(/[.,]/g, "");                                       // thousands separators only: 1.299 · 1,299
  const v = Number(s);
  if (!Number.isFinite(v) || v < 0 || v > 1_000_000) return null;
  return Math.round(v * 100);
}

export const formatPrice = (cents: number | null | undefined) =>
  cents == null ? "" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Only web addresses: "shop.de/x" becomes "https://shop.de/x"; javascript:, data:, file: … → null. No user name or password in it. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > MAX_URL || /\s/.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]+:\d+(\/|$)/.test(s) ? s : "https://" + s;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch { return null; }
}

export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** A readable first title from the address ("…/Sony-WH-1000XM5-Kopfhoerer/dp/B09…" → "Sony WH 1000XM5 Kopfhoerer"); the person can change it. */
export function guessTitle(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
    const best = parts.filter((p) => /[a-zA-Z]{3,}/.test(p) && !/^(dp|gp|p|product|products|produkt|artikel|item|de|en|html?|php)$/i.test(p) && p.length > 8)
      .sort((a, b) => (b.match(/[-_+ ]/g)?.length ?? 0) - (a.match(/[-_+ ]/g)?.length ?? 0))[0];
    if (best) return clamp(best.replace(/\.(html?|php)$/i, "").replace(/[-_+]+/g, " "), MAX_TITLE);
  } catch { /* fall through */ }
  return hostOf(url);
}

export const totalCents = (items: Wish[]) => items.reduce((a, w) => a + (w.priceCents ?? 0), 0);
export const withoutPrice = (items: Wish[]) => items.filter((w) => w.priceCents == null).length;

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

export function makeWish(url: string, title: string, price: string, note = ""): Wish | { error: "url" | "price" } {
  const u = normalizeUrl(url);
  if (!u) return { error: "url" };
  let cents: number | null = null;
  if (price.trim()) { cents = parsePrice(price); if (cents == null) return { error: "price" }; }
  return { id: newId(), url: u, title: clamp(title, MAX_TITLE) || guessTitle(u), priceCents: cents, note: clamp(note, MAX_NOTE), at: Date.now(), priceAt: null };
}

/** Whatever is stored or received becomes a clean list: only valid web links, limited lengths and count. */
export function cleanList(raw: unknown): XmasList {
  const r = (raw && typeof raw === "object" ? raw : {}) as { title?: unknown; items?: unknown };
  const items: Wish[] = [];
  for (const it of Array.isArray(r.items) ? r.items : []) {
    if (items.length >= MAX_ITEMS || !it || typeof it !== "object") continue;
    const w = it as Record<string, unknown>;
    const url = typeof w.url === "string" ? normalizeUrl(w.url) : null;
    if (!url) continue;
    const cents = typeof w.priceCents === "number" && Number.isFinite(w.priceCents) && w.priceCents >= 0 && w.priceCents <= 100_000_000 ? Math.round(w.priceCents) : null;
    items.push({ id: typeof w.id === "string" && w.id ? w.id.slice(0, 64) : newId(), url, title: clamp(w.title, MAX_TITLE) || guessTitle(url), priceCents: cents, note: clamp(w.note, MAX_NOTE), at: typeof w.at === "number" ? w.at : 0, priceAt: cents != null && typeof w.priceAt === "number" && Number.isFinite(w.priceAt) ? w.priceAt : null });
  }
  return { title: clamp(r.title, MAX_NAME), items };
}

// ------------------------------------------------------------------ price read from the shop (the PC loads the page: price.lookup)
export interface PriceLookup { url: string; host: string; title: string | null; priceCents: number | null; currency: string | null; source: string | null; note: string | null; multiple: boolean; readAt: string }
export interface LookupUse {
  /** Cents to put into the price field – only a price in euros (or one the shop gives without a currency); null otherwise. */
  cents: number | null; title: string; kind: "ok" | "check" | "none";
  /** What to tell the person. {n} texts are German here and go through t() in the page, so this only names the case. */
  message: "found" | "multiple" | "other-currency" | "none"; amount?: string; currency?: string; note?: string; host: string; source?: string;
}
/** What to do with the answer of the PC: never a made-up price, never a foreign currency taken for euros. */
export function applyLookup(r: PriceLookup): LookupUse {
  const title = clamp(r.title ?? "", MAX_TITLE), host = clamp(r.host, 80);
  if (r.priceCents == null) return { cents: null, title, kind: "none", message: "none", note: r.note ?? undefined, host };
  const cur = (r.currency ?? "EUR").toUpperCase();
  if (cur !== "EUR") return { cents: null, title, kind: "check", message: "other-currency", amount: (r.priceCents / 100).toFixed(2).replace(".", ","), currency: cur, host };
  return { cents: r.priceCents, title, kind: r.multiple ? "check" : "ok", message: r.multiple ? "multiple" : "found", host, source: r.source ?? undefined };
}

// ------------------------------------------------------------------ share code
const toB64Url = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64Url = (s: string) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/")); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const w = stream.writable.getWriter(); void w.write(data as BufferSource).catch(() => undefined); void w.close().catch(() => undefined);
  const chunks: Uint8Array[] = []; let n = 0;
  const rd = stream.readable.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > limit) { await rd.cancel(); throw new Error("too large"); } chunks.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** The list as a short code for the address: only title, link, price and note (no ids), compressed when the browser can. */
export async function encodeShare(list: XmasList): Promise<string> {
  const c = cleanList(list);
  const json = new TextEncoder().encode(JSON.stringify({ t: c.title, i: c.items.map((w) => [w.title, w.url, w.priceCents, w.note]) }));
  if (typeof CompressionStream !== "undefined") {
    try { return "z" + toB64Url(await pipe(json, new CompressionStream("deflate-raw"))); } catch { /* plain below */ }
  }
  return "p" + toB64Url(json);
}

/** The list from a code; null for anything that is not one (the code comes from outside and is never trusted). */
export async function decodeShare(code: string): Promise<XmasList | null> {
  try {
    if (code.length < 2 || code.length > MAX_PAYLOAD || !/^[zp][A-Za-z0-9_-]+$/.test(code)) return null;
    const raw = fromB64Url(code.slice(1));
    const bytes = code[0] === "z" ? await pipe(raw, new DecompressionStream("deflate-raw"), 400_000) : raw;
    const d = JSON.parse(new TextDecoder().decode(bytes)) as { t?: unknown; i?: unknown };
    if (!Array.isArray(d.i)) return null;
    return cleanList({ title: d.t, items: d.i.map((x) => (Array.isArray(x) ? { title: x[0], url: x[1], priceCents: x[2], note: x[3] } : null)) });
  } catch { return null; }
}

export const shareLink = (base: string, code: string) => `${base.replace(/\/$/, "")}/#/w/${code}`;
