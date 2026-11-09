// Cloud account through our own small API on Cloudflare Workers + D1 (cloud-account-worker/).
// The browser sends only the login key it derives from the password (never the password) and an AES-GCM ciphertext
// it alone can open; the server keeps a PBKDF2 hash of that login key. No third-party account, no e-mail needed.
import { t } from "./i18n";

const PENDING_KEY = "pgl.cloudAccount.pending";
const TIMEOUT_MS = 20000;
export const MAX_BLOB = 900_000;

// Session (name + login key) survives a reload – that is the "stay signed in"; the password is never stored.
const memory = new Map<string, string>();
function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
function get(key: string): string | null {
  const s = storage();
  if (!s) return memory.get(key) ?? null;
  try { return s.getItem(key); } catch { return null; }
}
function set(key: string, value: string | null) {
  const s = storage();
  if (!s) { if (value === null) memory.delete(key); else memory.set(key, value); return; }
  try { if (value === null) s.removeItem(key); else s.setItem(key, value); } catch { /* quota / private mode */ }
}

/** Address of the cloud API of this build; null when this build has no cloud (then the account lives on the PC). */
/** Public address of the cloud service this project ships with (not a secret); `VITE_CLOUD_API` overrides it. */
const DEFAULT_API = import.meta.env.PROD ? "https://site-76a134eb24cf4cf69195c678bc381d2b.freebuff.page" : "";

/** Public Cloudflare-hosted web app for the cloud page; the API endpoint itself is cloudApi(). */
export const CLOUD_WEB = "https://site-cdc5204c9fe2498682e17155d0a01ac5.freebuff.page/#/cloud";

export function cloudApi(): string | null {
  const raw = (String(import.meta.env.VITE_CLOUD_API ?? "").trim() || DEFAULT_API).replace(/\/+$/, "");
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  // Encrypted data only over https – plain http only for a local development stack.
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  return url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, ""));
}

export const cloudAccountConfigured = () => cloudApi() !== null;

export interface CloudHealth { ok: boolean; message: string; checkedAt: number }

/** Whether the service answers right now – the public health route, no account data and no login needed. */
export async function cloudHealth(): Promise<CloudHealth> {
  const checkedAt = Date.now();
  const base = cloudApi();
  if (!base) return { ok: false, message: t("Cloud ist für diese App noch nicht eingerichtet."), checkedAt };
  if (typeof fetch !== "function") return { ok: false, message: t("Dieser Browser kann keine Verbindung zur Cloud aufbauen."), checkedAt };
  let signal: AbortSignal | undefined;
  try { signal = AbortSignal.timeout(8000); } catch { signal = undefined; }
  try {
    const res = await fetch(`${base}/api/account/health`, { method: "GET", headers: { Accept: "application/json" }, signal });
    const text = await res.text().catch(() => "");
    let data: Answer = {};
    if (text) { try { data = JSON.parse(text) as Answer; } catch { data = {}; } }
    if (!res.ok) return { ok: false, message: t("Der Cloud-Dienst meldet einen Fehler – bitte später erneut prüfen."), checkedAt };
    return data.ok === true
      ? { ok: true, message: t("Der Cloud-Dienst ist erreichbar."), checkedAt }
      : { ok: false, message: t("Der Cloud-Dienst antwortet unerwartet – bitte später erneut prüfen."), checkedAt };
  } catch {
    return { ok: false, message: t("Der Cloud-Dienst antwortet nicht – bitte Internetverbindung prüfen."), checkedAt };
  }
}

export function cloudSignOut() { set(PENDING_KEY, null); }

/** The encrypted blob of a change that could not be sent yet; sent on the next opportunity. */
export function pendingBlob(): string | null {
  const raw = get(PENDING_KEY);
  if (!raw) return null;
  try { return (JSON.parse(raw) as { blob?: string }).blob ?? null; } catch { return null; }
}
export function setPendingBlob(blob: string | null) {
  set(PENDING_KEY, blob ? JSON.stringify({ blob, at: Date.now() }) : null);
}

interface Answer { ok?: boolean; error?: string; message?: string; blob?: string; updatedAt?: string }

function fail(message: string): never { throw new Error(message); }

/** Clear German words for the answers the API gives; the server's own text is the detail. */
function answerError(a: Answer, status: number): string {
  switch (a.error) {
    case "unauthorized": return t("Benutzername oder Passwort falsch.");
    case "conflict": return t("Diesen Benutzernamen gibt es schon – bitte anmelden.");
    case "rate-limited": return t("Zu viele Versuche – bitte in 15 Minuten wieder probieren.");
    case "invalid-params": return a.message || t("Die Cloud hat die Anfrage abgelehnt.");
    default:
      if (status >= 500) return t("Der Cloud-Dienst hatte einen Fehler – bitte später erneut probieren.");
      return t("Die Cloud hat die Anfrage abgelehnt: {m}", { m: a.message || t("unbekannter Fehler") });
  }
}

async function post(action: "register" | "login" | "load" | "save" | "delete", body: Record<string, unknown>): Promise<Answer> {
  const base = cloudApi();
  if (!base) fail(t("Cloud ist für diese App noch nicht eingerichtet."));
  if (typeof fetch !== "function") fail(t("Dieser Browser kann keine Verbindung zur Cloud aufbauen."));
  let signal: AbortSignal | undefined;
  try { signal = AbortSignal.timeout(TIMEOUT_MS); } catch { signal = undefined; }
  let res: Response;
  try {
    res = await fetch(`${base}/api/account/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body), signal,
    });
  } catch { fail(t("Der Cloud-Dienst antwortet nicht – bitte Internetverbindung prüfen.")); }
  const text = await res.text().catch(() => "");
  let data: Answer = {};
  if (text) { try { data = JSON.parse(text) as Answer; } catch { data = {}; } }
  if (res.status >= 400 || data.ok === false) fail(answerError(data, res.status));
  return data;
}

export async function cloudRegister(user: string, key: string, blob: string) {
  if (blob.length > MAX_BLOB) fail(t("Die Kontodaten sind zu groß für die Cloud (Hintergrundbild verkleinern)."));
  await post("register", { user, key, blob });
}

export async function cloudLogin(user: string, key: string) {
  await post("login", { user, key });
}

/** The encrypted data of the account; null when it has not saved anything yet. */
export async function cloudLoad(user: string, key: string): Promise<{ blob: string; updatedAt: string } | null> {
  const a = await post("load", { user, key });
  return typeof a.blob === "string" && a.blob ? { blob: a.blob, updatedAt: a.updatedAt ?? "" } : null;
}

export async function cloudSave(user: string, key: string, blob: string) {
  if (blob.length > MAX_BLOB) fail(t("Die Kontodaten sind zu groß für die Cloud (Hintergrundbild verkleinern)."));
  await post("save", { user, key, blob });
}

export async function cloudDelete(user: string, key: string) {
  await post("delete", { user, key });
}
