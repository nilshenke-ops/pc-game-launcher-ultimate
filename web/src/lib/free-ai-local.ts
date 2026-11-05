// OpenRouter and Groq WITHOUT the PC: the key is typed on this device, locked with a password only the person knows (AES-GCM, key from
// PBKDF2) and only ever sent to its own service – straight from the browser (both allow that). The same cost rules as at the PC apply:
// only free models (price 0 in every field, ":free" or exactly "openrouter/free"), checked again before every request, maximum price 0
// in every OpenRouter request, fixed addresses, no top-up, no paid fallback. Without the password the key is unreadable; with the PC
// connected the PC's own copy is used instead (this file is only for the PC-less case). Honest limit: a key on a device is less safe than
// a key at the PC – anyone who can run code in this page while it is unlocked could read it. So: a free key, a password, and lock it again.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";
import { askFreeAi, buildMessages, cleanAnswer, freeAiConsent, FreeAiError, looksLikePaymentNotice, type Turn } from "./free-ai";

export type LocalProvider = "openrouter" | "groq";
export const LOCAL_PROVIDERS: readonly LocalProvider[] = ["openrouter", "groq"];
export const LOCAL_NAME: Record<LocalProvider, string> = { openrouter: "OpenRouter", groq: "Groq" };
const BASE: Record<LocalProvider, string> = { openrouter: "https://openrouter.ai/api/v1", groq: "https://api.groq.com/openai/v1" };
const HOST: Record<LocalProvider, string> = { openrouter: "openrouter.ai", groq: "api.groq.com" };

// ------------------------------------------------------------------ the cost rules (the same as CostGuard in the companion)

export const FREE_ROUTER = "openrouter/free";
export const isFreeId = (id: string) => id.endsWith(":free") || id === FREE_ROUTER;

/** Free only if the id is a free id AND every price in "pricing" is 0 (no overrides, no negative "variable" price, no unreadable value). */
export function isFreeOpenRouter(m: unknown): boolean {
  const o = m as { id?: unknown; pricing?: Record<string, unknown> } | null;
  if (!o || typeof o.id !== "string" || !isFreeId(o.id) || !o.pricing || typeof o.pricing !== "object") return false;
  let prompt = false, completion = false;
  for (const [k, v] of Object.entries(o.pricing)) {
    if (k === "overrides") { if (Array.isArray(v) && v.length > 0) return false; continue; }
    if (v === null || v === undefined) continue;
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n !== 0) return false;
    if (k === "prompt") prompt = true;
    if (k === "completion") completion = true;
  }
  return prompt && completion;
}

const NOT_CHAT = /(safety|guard|embed|whisper|tts|rerank|moderat|orpheus|playai|image|audio|speech|transcri|\bvl\b|-vl\b|vision|ocr|diffusion|code|prompt-guard)/i;
export const isChatModel = (id: string) => id.length > 1 && id.length <= 120 && !NOT_CHAT.test(id);

/** Quality guess from the name (parameter count capped at 120 B, bonus for known families, a little for context). The free router comes first. */
export function rankModel(id: string, context: number): number {
  if (id === FREE_ROUTER) return 100000;
  const m = /(?<![\d.])(\d{1,3}(?:\.\d)?)b(?![a-z])/i.exec(id);
  const size = m ? Math.min(Number(m[1]), 120) : 8;
  const bonus = /gpt-oss|llama-3\.3|llama-3\.1|qwen|gemma|nemotron|mistral|deepseek/i.test(id) ? 10 : 0;
  return Math.floor(size * 10 + bonus + Math.min(Math.floor(context / 50000), 10));
}

/** Key shapes: OpenRouter "sk-or-…", Groq "gsk_…". Anything else is refused before it is stored or sent. */
export function keyLooksRight(p: LocalProvider, key: string): boolean {
  return key.length >= 20 && key.length <= 200 && /^[A-Za-z0-9_-]+$/.test(key) && (p === "openrouter" ? key.startsWith("sk-or-") : key.startsWith("gsk_"));
}

// ------------------------------------------------------------------ the lock (password → AES-GCM key)

export interface Locked { v: 1; salt: string; iv: string; ct: string }
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const localAiSupported = () => typeof crypto !== "undefined" && !!crypto.subtle;
const ITER = 250_000;

async function aesKey(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
/** The provider name is part of the sealed data: a locked OpenRouter key cannot be moved into the Groq slot. */
export async function lockSecret(pass: string, purpose: string, secret: string): Promise<Locked> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(purpose) }, await aesKey(pass, salt), new TextEncoder().encode(secret)));
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
/** The secret, or null for a wrong password / changed data. */
export async function unlockSecret(pass: string, purpose: string, l: Locked): Promise<string | null> {
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(l.iv) as BufferSource, additionalData: new TextEncoder().encode(purpose) }, await aesKey(pass, unb64(l.salt)), unb64(l.ct) as BufferSource);
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

// ------------------------------------------------------------------ what is stored and what is unlocked right now

const STORE = "pgl.localai", SESSION = "pgl.localai.session";
interface Stored { openrouter?: Locked; groq?: Locked; groqAttested?: boolean }
const read = (): Stored => { try { return readJson<Stored>(STORE) ?? {}; } catch { return {}; } };
const write = (s: Stored) => { try { writeJson(STORE, s); } catch { /* storage blocked – this visit only */ } };
const unlocked: Partial<Record<LocalProvider, string>> = (() => { try { return readJson<Partial<Record<LocalProvider, string>>>(SESSION, "session") ?? {}; } catch { return {}; } })();

export type LocalState = "none" | "locked" | "ready";
export interface LocalSnap { openrouter: LocalState; groq: LocalState; groqAttested: boolean }
const listeners = new Set<() => void>();
const compute = (): LocalSnap => { const s = read(); const st = (p: LocalProvider): LocalState => unlocked[p] && (p !== "groq" || s.groqAttested) ? "ready" : s[p] ? "locked" : "none"; return { openrouter: st("openrouter"), groq: st("groq"), groqAttested: !!s.groqAttested }; };
let snap: LocalSnap = compute();
const publish = () => { snap = compute(); listeners.forEach((l) => l()); };
export const localAiSnapshot = () => snap;
export const useLocalAi = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => snap);
export const readyProviders = (): LocalProvider[] => LOCAL_PROVIDERS.filter((p) => snap[p] === "ready");

/** The keys that are unlocked right now (only for handing them over to the PC – never shown, never logged). */
export const unlockedKeys = (): Partial<Record<LocalProvider, { key: string; attested: boolean }>> => {
  const out: Partial<Record<LocalProvider, { key: string; attested: boolean }>> = {};
  for (const p of readyProviders()) out[p] = { key: unlocked[p]!, attested: p === "groq" ? snap.groqAttested : true };
  return out;
};

/**
 * Set up on the phone first, the PC takes over as soon as it is connected: every key that is unlocked here and not yet at the PC
 * is handed over (sealed, see seal.ts). Returns the providers that were transferred; a failure of one does not stop the others.
 */
export async function transferKeysToPc(
  pc: { id: string; state: string; keySet?: boolean }[],
  send: (provider: LocalProvider, key: string, attested: boolean) => Promise<void>,
  already: Set<string> = new Set(),
): Promise<{ done: LocalProvider[]; failed: { provider: LocalProvider; message: string }[] }> {
  const done: LocalProvider[] = [], failed: { provider: LocalProvider; message: string }[] = [];
  const keys = unlockedKeys();
  for (const p of LOCAL_PROVIDERS) {
    const k = keys[p]; const there = pc.find((x) => x.id === p);
    if (!k || !there || there.keySet || already.has(p)) continue;          // nothing to hand over, unknown to this PC, or the PC has its own key already
    already.add(p);
    try { await send(p, k.key, k.attested); done.push(p); }
    catch (e) { already.delete(p); failed.push({ provider: p, message: (e as Error).message }); }
  }
  return { done, failed };
}

function remember(on: boolean) { try { writeJson(SESSION, on ? unlocked : null, "session"); } catch { /* ignore */ } }

export async function saveLocalKey(p: LocalProvider, key: string, pass: string, o: { attested?: boolean; remember?: boolean } = {}): Promise<void> {
  if (!localAiSupported()) throw new FreeAiError("Hier ist das Verschlüsseln nicht möglich (nur auf der Website im Internet, nicht auf der http-Seite im WLAN).");
  const k = key.trim();
  if (!keyLooksRight(p, k)) throw new FreeAiError(p === "openrouter" ? "Das sieht nicht nach einem OpenRouter-Schlüssel aus (er beginnt mit „sk-or-“)." : "Das sieht nicht nach einem Groq-Schlüssel aus (er beginnt mit „gsk_“).");
  if (pass.length < 6) throw new FreeAiError("Das Passwort braucht mindestens 6 Zeichen.");
  if (p === "groq" && !(o.attested ?? read().groqAttested)) throw new FreeAiError("Bitte zuerst bestätigen: Dein Groq-Konto ist im kostenlosen Tarif und hat keine Zahlungsmethode.");
  const s = read();
  const other = LOCAL_PROVIDERS.find((x) => x !== p && s[x]);                  // one password for all keys of this device
  if (other && unlocked[other] === undefined && (await unlockSecret(pass, other, s[other]!)) === null) throw new FreeAiError("Das Passwort passt nicht zu dem schon gespeicherten Schlüssel (ein Passwort für alle).");
  s[p] = await lockSecret(pass, p, k);
  if (p === "groq") s.groqAttested = true;
  write(s); unlocked[p] = k;
  if (o.remember) remember(true);
  publish();
}

export async function unlockLocalAi(pass: string, keep = false): Promise<void> {
  const s = read(); let any = false;
  for (const p of LOCAL_PROVIDERS) {
    if (!s[p]) continue;
    const v = await unlockSecret(pass, p, s[p]!);
    if (v === null) throw new FreeAiError("Falsches Passwort.");
    unlocked[p] = v; any = true;
  }
  if (!any) throw new FreeAiError("Auf diesem Gerät ist noch kein Schlüssel gespeichert.");
  remember(keep); publish();
}
export function lockLocalAi() { for (const p of LOCAL_PROVIDERS) delete unlocked[p]; remember(false); publish(); }
export function removeLocalKey(p: LocalProvider) {
  const s = read(); delete s[p]; if (p === "groq") delete s.groqAttested; write(s);
  const kept = !!readJson(SESSION, "session"); delete unlocked[p];
  remember(kept && Object.keys(unlocked).length > 0); publish();
}

// ------------------------------------------------------------------ talking to the service

export type Fetcher = typeof fetch;
export class LocalAiError extends FreeAiError { constructor(message: string, public kind: "limit" | "key" | "down" | "offline" | "busy" | "model" | "empty" | "blocked" | "billing", public retryMs?: number) { super(message); } }
interface Model { id: string; context: number; rank: number }
const FRESH_MS = 5 * 60_000;
const cache: Partial<Record<LocalProvider, { at: number; models: Model[] }>> = {};
const cooldown: Partial<Record<LocalProvider, number>> = {};
export const resetLocalAiState = () => { for (const p of LOCAL_PROVIDERS) { delete cache[p]; delete cooldown[p]; } };

async function call(p: LocalProvider, path: string, init: RequestInit, o: { fetcher?: Fetcher; signal?: AbortSignal; timeoutMs?: number }): Promise<Response> {
  const url = BASE[p] + path;
  if (new URL(url).host !== HOST[p]) throw new LocalAiError("Adresse nicht erlaubt.", "blocked");
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 25_000);
  o.signal?.addEventListener("abort", () => ctl.abort(), { once: true });
  try { return await (o.fetcher ?? fetch)(url, { ...init, signal: ctl.signal, referrerPolicy: "no-referrer", credentials: "omit" }); }
  catch { throw o.signal?.aborted ? new FreeAiError("Abgebrochen.") : ctl.signal.aborted ? new LocalAiError(`${LOCAL_NAME[p]}: zu langsam.`, "busy", 60_000) : new LocalAiError(`${LOCAL_NAME[p]}: nicht erreichbar (Internet prüfen).`, "offline"); }
  finally { clearTimeout(timer); }
}

function classify(p: LocalProvider, r: Response, body: string): LocalAiError {
  const n = LOCAL_NAME[p], ra = Number(r.headers.get("retry-after")), wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 60_000;
  if (r.status === 401 || r.status === 403) return new LocalAiError(`${n}: Der Schlüssel wird abgelehnt.`, "key");
  if (r.status === 402) return new LocalAiError(`${n}: verlangt Guthaben – diese Anfrage wird nicht bezahlt.`, "billing", 3_600_000);
  if (r.status === 429) return new LocalAiError(/per-day|daily|free-models-per-day/i.test(body) ? `${n}: Tageslimit der kostenlosen Nutzung erreicht.` : `${n}: Limit erreicht – kurz warten.`, "limit", /per-day|daily/i.test(body) ? 3_600_000 : wait);
  if ([400, 404, 422].includes(r.status)) return new LocalAiError(`${n}: Modell nicht verfügbar (${r.status}).`, "model", 600_000);
  if (r.status >= 500) return new LocalAiError(`${n}: Dienst gerade gestört (${r.status}).`, "down", 60_000);
  return new LocalAiError(`${n}: Fehler ${r.status}.`, "down", 60_000);
}

/** The free chat models of a provider right now, best first – OpenRouter: only price 0 and free ids. Checked again when older than five minutes. */
export async function freeModels(p: LocalProvider, o: { fetcher?: Fetcher; signal?: AbortSignal; now?: number; force?: boolean } = {}): Promise<Model[]> {
  const now = o.now ?? Date.now(), c = cache[p];
  if (!o.force && c && now - c.at <= FRESH_MS && c.models.length) return c.models;
  const headers: Record<string, string> = {};
  if (p === "groq") { if (!unlocked.groq) throw new LocalAiError("Groq: Schlüssel ist gesperrt.", "key"); headers.authorization = `Bearer ${unlocked.groq}`; }
  let res: Response;
  try { res = await call(p, "/models", { method: "GET", headers }, o); }
  catch (e) { if (c && now - c.at <= 30 * 60_000 && c.models.length) return c.models; throw e; }         // can be trusted for half an hour, then not used at all
  const raw = await res.text();
  if (!res.ok) throw classify(p, res, raw);
  let data: { data?: Record<string, unknown>[] };
  try { data = JSON.parse(raw); } catch { throw new LocalAiError(`${LOCAL_NAME[p]}: unerwartete Modellliste.`, "down"); }
  const list: Model[] = [];
  for (const m of data.data ?? []) {
    const id = typeof m.id === "string" ? m.id : "";
    if (!isChatModel(id)) continue;
    if (p === "openrouter") {
      if (!isFreeOpenRouter(m)) continue;
      const ar = m.architecture as { input_modalities?: string[]; output_modalities?: string[] } | undefined;
      if (ar?.output_modalities && !ar.output_modalities.includes("text")) continue;
      if (ar?.input_modalities && !ar.input_modalities.includes("text")) continue;
    } else if (m.active === false) continue;
    const ctx = typeof m.context_length === "number" ? m.context_length : typeof m.context_window === "number" ? m.context_window : 0;
    list.push({ id, context: ctx, rank: rankModel(id, ctx) });
  }
  list.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  const models = list.slice(0, 60);
  cache[p] = { at: now, models };
  return models;
}

export interface LocalAnswer { text: string; model: string; provider: LocalProvider | "pollinations"; label: string }
interface Opts { fetcher?: Fetcher; signal?: AbortSignal; now?: number; onWait?: (s: number) => void }

/** One question to one provider (up to three of its models, best first). */
export async function askLocal(p: LocalProvider, question: string, history: Turn[], o: Opts = {}): Promise<LocalAnswer> {
  const key = unlocked[p];
  if (!key) throw new LocalAiError(`${LOCAL_NAME[p]}: Schlüssel ist gesperrt – in der KI-Verwaltung entsperren.`, "key");
  const now = o.now ?? Date.now();
  if ((cooldown[p] ?? 0) > now) throw new LocalAiError(`${LOCAL_NAME[p]}: Limit erreicht, bitte später noch einmal.`, "limit", (cooldown[p] ?? 0) - now);
  const models = (await freeModels(p, o)).slice(0, 3);
  if (models.length === 0) throw new LocalAiError(p === "openrouter" ? "OpenRouter: gerade ist kein kostenloses Modell verfügbar." : "Groq: gerade ist kein Modell verfügbar.", "model");
  const messages = buildMessages(question, history);
  let last: LocalAiError | null = null;
  for (const m of models) {
    if (p === "openrouter" && !isFreeId(m.id)) continue;                       // the price check of THIS model, right before the request
    const body: Record<string, unknown> = { model: m.id, messages, max_tokens: 500, stream: false };
    if (p === "openrouter") body.provider = { max_price: { prompt: 0, completion: 0, request: 0, image: 0 } };   // OpenRouter itself refuses anything that is not free
    let res: Response;
    try { res = await call(p, "/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "x-title": "Nexus Gaming Hub" }, body: JSON.stringify(body) }, o); }
    catch (e) { if (e instanceof LocalAiError && e.kind === "busy") { last = e; continue; } throw e; }
    const raw = await res.text();
    if (!res.ok) {
      const err = classify(p, res, raw);
      if (err.kind === "limit" || err.kind === "billing" || err.kind === "key") { cooldown[p] = now + (err.retryMs ?? 60_000); throw err; }
      last = err; continue;
    }
    let data: { choices?: { message?: { content?: unknown } }[]; model?: unknown; usage?: { completion_tokens?: unknown }; error?: unknown };
    try { data = JSON.parse(raw); } catch { last = new LocalAiError(`${LOCAL_NAME[p]}: unerwartete Antwort.`, "down"); continue; }
    if (data.error) { last = new LocalAiError(`${LOCAL_NAME[p]}: meldet einen Fehler beim Modell.`, "down"); continue; }
    const text = typeof data.choices?.[0]?.message?.content === "string" ? cleanAnswer(data.choices![0].message!.content as string) : "";
    const used = typeof data.usage?.completion_tokens === "number" ? data.usage.completion_tokens : -1;
    if (looksLikePaymentNotice(text, used)) { cooldown[p] = now + 30 * 60_000; throw new LocalAiError(`${LOCAL_NAME[p]}: meldet „Budget erreicht“ – nichts bezahlt.`, "limit", 30 * 60_000); }
    if (!text) { last = new LocalAiError(`${LOCAL_NAME[p]}: leere Antwort.`, "empty"); continue; }
    const served = typeof data.model === "string" ? data.model.slice(0, 80) : m.id;
    return { text, model: served, provider: p, label: `Beantwortet von ${LOCAL_NAME[p]} – kostenloses Modell (${served})` };
  }
  throw last ?? new LocalAiError(`${LOCAL_NAME[p]}: kein Modell hat geantwortet.`, "model");
}

/** A real connection test: the model list and one tiny question. Counts as one request against the free limit. */
export async function testLocal(p: LocalProvider, o: Opts = {}): Promise<{ ok: boolean; message: string; model?: string; ms: number; models: number }> {
  const t0 = Date.now();
  try {
    const models = (await freeModels(p, { ...o, force: true })).length;
    const a = await askLocal(p, "Sag nur: Verbindung steht.", [], o);
    return { ok: true, message: `Verbindung steht – Antwort von ${a.model}.`, model: a.model, ms: Date.now() - t0, models };
  } catch (e) { return { ok: false, message: (e as Error).message, ms: Date.now() - t0, models: 0 }; }
}

/**
 * The chain for a question without the PC: OpenRouter, then Groq (those whose key is unlocked on this device), then – only with this device's yes – the
 * anonymous Pollinations service. If none can answer, an honest error that lists why.
 */
export async function askLocalChain(question: string, history: Turn[], o: Opts = {}): Promise<LocalAnswer> {
  const failed: string[] = [];
  for (const p of readyProviders()) {
    try { return await askLocal(p, question, history, o); }
    catch (e) { if (e instanceof FreeAiError && e.message === "Abgebrochen.") throw e; failed.push((e as Error).message); }
  }
  if (freeAiConsent() === "yes") {
    try { const r = await askFreeAi(question, { history, fetcher: o.fetcher, signal: o.signal, now: o.now, onWait: o.onWait }); return { text: r.text, model: r.model, provider: "pollinations", label: "Beantwortet von Pollinations – kostenloser Dienst ohne Konto" }; }
    catch (e) { failed.push((e as Error).message); }
  }
  throw new FreeAiError(`Momentan ist keine kostenlose externe KI erreichbar.${failed.length ? "\n" + failed.map((x) => "• " + x).join("\n") : ""}`);
}
