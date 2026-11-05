// A free AI for questions when the PC is not connected (phone, iPad, a browser on its own): the free text service of Pollinations
// (https://text.pollinations.ai, no account, no key, open to browsers). Only the question and the last few turns of this chat are
// sent – nothing else, no key, no file, no data of the PC – and only after this device was told "yes" once. The answer may be wrong
// and is marked as such. With the PC connected the PC's own AIs (OpenRouter, Groq, router, local) are used instead – never this one.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";

export const FREE_AI_URL = "https://text.pollinations.ai/openai";
export const FREE_AI_NAME = "Freie KI ohne Konto (Pollinations)";
const KEY = "pgl.freeai";

export type FreeAiConsent = "ask" | "yes" | "no";
let consent: FreeAiConsent = (() => { try { const v = readJson<string>(KEY); return v === "yes" || v === "no" ? v : "ask"; } catch { return "ask"; } })();
const listeners = new Set<() => void>();
export const freeAiConsent = () => consent;
export function setFreeAiConsent(v: "yes" | "no") { consent = v; try { writeJson(KEY, v); } catch { /* storage blocked – only for this visit */ } listeners.forEach((l) => l()); if (v === "yes") warmUpFreeAi(); }
export const useFreeAiConsent = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => consent);

export interface Turn { role: "user" | "bot"; text: string }
const SYSTEM = "Du bist JARVIS, der Gaming-Assistent einer Spiele-Launcher-App. Antworte in der Sprache des Nutzers (meist Deutsch), kurz, sachlich und verständlich (höchstens etwa 6 Sätze) – gib direkt die Antwort, ohne Quellenangaben und ohne Markdown (keine Sternchen, Rauten oder Aufzählungszeichen). " +
  "Du beantwortest auch allgemeine Fragen. Du hast hier KEINEN Zugriff auf den PC des Nutzers, keine Werkzeuge und keine aktuellen Internetseiten: Behaupte nie, etwas gestartet, geöffnet oder nachgeschaut zu haben. " +
  "Erfinde nichts: Bist du bei Zahlen, aktuellen Ereignissen oder Preisen unsicher, sag das offen. Keine Hilfe bei Cheats oder Anti-Cheat-Umgehung. Gib keine Links an.";

export function buildMessages(question: string, history: Turn[] = []): { role: "system" | "user" | "assistant"; content: string }[] {
  const past = history.slice(-6).map((h) => ({ role: h.role === "user" ? ("user" as const) : ("assistant" as const), content: h.text.slice(0, 500) }));
  return [{ role: "system", content: SYSTEM }, ...past, { role: "user", content: question.trim().slice(0, 1000) }];
}

/** Answers are text only: no markup, no links (they are removed, the words stay), not endless. */
export function cleanAnswer(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1800);
}

// At most 20 questions per hour per device – the service is free and shared.
const stamps: number[] = [];
export const FREE_AI_PER_HOUR = 20;
export function freeAiBudget(now = Date.now()): number { while (stamps.length && now - stamps[0] > 3_600_000) stamps.shift(); return Math.max(0, FREE_AI_PER_HOUR - stamps.length); }

/** For tests: forgets the questions counted so far. */
export const resetFreeAiBudget = () => { stamps.length = 0; };

export class FreeAiError extends Error {}

/** One question to the free AI. Throws FreeAiError with a sentence a person can read. */
/** After a "budget reached" notice the service is left alone for a while. */
const PAUSE_MS = 30 * 60_000;
let pausedUntil = 0;
export const resetFreeAiPause = () => { pausedUntil = 0; };
const NOTICE = /(budget|raise the key|top.?up|payment|insufficient|credits?\b|pollen|upgrade your|quota|billing|subscribe)/i;
/** The same rule as at the PC: payment words with zero output tokens (or a very short text) are a notice, not an answer. */
export function looksLikePaymentNotice(text: string, completionTokens: number): boolean {
  if (!NOTICE.test(text)) return false;
  return completionTokens === 0 || text.length < 400;
}

/** The anonymous service answers one question every ~45 seconds per address (HTTP 402/429 "FREE_LIMIT" with Retry-After): a short wait is waited out once. */
const MAX_WAIT_MS = 30_000;
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(new FreeAiError("Abgebrochen.")); }, { once: true });
});

export async function askFreeAi(question: string, opts: { history?: Turn[]; fetcher?: typeof fetch; signal?: AbortSignal; timeoutMs?: number; now?: number; onWait?: (seconds: number) => void } = {}): Promise<{ text: string; model: string }> {
  if (freeAiConsent() !== "yes") throw new FreeAiError("Die freie KI ohne PC ist auf diesem Gerät nicht erlaubt.");
  if (pausedUntil > (opts.now ?? Date.now())) throw new FreeAiError("Der kostenlose Dienst ohne Konto ist gerade aufgebraucht – ich frage ihn eine Weile nicht mehr. Bitte später noch einmal oder den PC verbinden.");
  if (freeAiBudget(opts.now) <= 0) throw new FreeAiError(`Du hast in der letzten Stunde schon ${FREE_AI_PER_HOUR} Fragen an die freie KI gestellt – bitte später noch einmal oder den PC verbinden.`);
  stamps.push(opts.now ?? Date.now());
  const messages = buildMessages(question, opts.history);
  let effort = true, waited = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 25_000);
    opts.signal?.addEventListener("abort", () => ctl.abort(), { once: true });
    let res: Response;
    try {
      // "openai-fast" with little thinking: short factual answers arrive in a few seconds.
      res = await (opts.fetcher ?? fetch)(FREE_AI_URL, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "openai-fast", messages, max_tokens: 400, ...(effort ? { reasoning_effort: "low" } : {}) }), signal: ctl.signal, referrerPolicy: "no-referrer", credentials: "omit" });
    } catch (e) {
      if (opts.signal?.aborted) throw new FreeAiError("Abgebrochen.");
      throw new FreeAiError(ctl.signal.aborted ? "Die freie KI hat zu lange gebraucht – bitte noch einmal versuchen." : "Die freie KI ist gerade nicht erreichbar (Internet?).");
    } finally { clearTimeout(timer); }
    if (res.status === 400 && effort) { effort = false; continue; }                      // the thinking setting was refused: ask plainly
    if (res.status === 402 || res.status === 429) {
      const retry = Number(res.headers.get("retry-after"));
      const wait = (Number.isFinite(retry) && retry > 0 ? retry : 20) * 1000;
      if (!waited && wait <= MAX_WAIT_MS) { waited = true; opts.onWait?.(Math.ceil(wait / 1000)); await sleep(wait + 300, opts.signal); continue; }
      throw new FreeAiError(`Der kostenlose Dienst erlaubt nur etwa eine Antwort alle 45 Sekunden – bitte in ${Math.ceil(wait / 1000)} Sekunden noch einmal fragen (oder den PC verbinden).`);
    }
    if (!res.ok) throw new FreeAiError(`Die freie KI hat nicht geantwortet (Fehler ${res.status}).`);
    let data: { choices?: { message?: { content?: unknown } }[]; model?: unknown };
    try { data = await res.json(); } catch { throw new FreeAiError("Unerwartete Antwort der freien KI."); }
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? cleanAnswer(content) : "";
    // "The API key has reached its budget – please top up" comes with status 200 when the anonymous access is used up: that is a payment request, never an answer.
    const used = (data as { usage?: { completion_tokens?: unknown } }).usage?.completion_tokens;
    if (looksLikePaymentNotice(text, typeof used === "number" ? used : -1)) { pausedUntil = (opts.now ?? Date.now()) + PAUSE_MS; throw new FreeAiError("Der kostenlose Dienst ohne Konto ist gerade aufgebraucht (er meldet „Budget erreicht“) – es wird nichts bezahlt. Bitte später noch einmal oder den PC verbinden."); }
    if (!text) throw new FreeAiError("Die freie KI hat eine leere Antwort geschickt – bitte noch einmal versuchen.");
    return { text, model: typeof data.model === "string" ? data.model.slice(0, 40) : "" };
  }
  throw new FreeAiError("Die freie KI hat nicht geantwortet – bitte noch einmal versuchen.");
}

/** Opens the connection to the service ahead of the first question (saves the handshake) – only for a device that said yes. */
export function warmUpFreeAi() {
  if (typeof document === "undefined" || freeAiConsent() !== "yes" || document.querySelector("link[data-pgl-freeai]")) return;
  const l = document.createElement("link");
  l.rel = "preconnect"; l.href = new URL(FREE_AI_URL).origin; l.setAttribute("data-pgl-freeai", "1");
  document.head.appendChild(l);
}

/** Said to the person before the first use. */
export const FREE_AI_NOTICE = "Ohne PC kann ich allgemeine Fragen mit einer freien KI beantworten (Pollinations, ohne Konto). Gesendet wird nur deine Frage mit den letzten Nachrichten dieses Chats – kein Schlüssel, keine Daten deines PCs. Die Antwort kann falsch sein.";
