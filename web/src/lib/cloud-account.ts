// Cloud account through Supabase: sign-up/sign-in by e-mail + password (Auth) and one encrypted row per user
// (PostgREST). Called with plain fetch so the app needs no extra package and stays small for offline use.
// Only the public project URL and the anon key reach the browser – never a service key.
import { t } from "./i18n";

export interface CloudConfig { url: string; anonKey: string }
export interface CloudAccount { email: string; userId: string; access: string; refresh: string; expiresAt: number; savedAt?: number }

const SESSION_KEY = "pgl.cloudAccount";
const PENDING_KEY = "pgl.cloudAccount.pending";
const TIMEOUT_MS = 20000;
export const CLOUD_EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_BLOB = 1_000_000;

// The session survives a reload (that is the "stay signed in") but holds no password: only the refresh token and the
// data key, both on this device. A blocked localStorage falls back to memory, so the app still works in private mode.
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

/** Public Supabase configuration of this build; null when this build has no cloud (then the account lives on the PC). */
export function cloudConfig(): CloudConfig | null {
  const rawUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (!rawUrl || !anonKey) return null;
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  // Encrypted data only over https – plain http only for a local development stack.
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  return { url: url.origin, anonKey };
}

export const cloudAccountConfigured = () => cloudConfig() !== null;

export const cloudEmail = (email: string) => email.trim().toLowerCase();

export const cloudSession = () => {
  const raw = get(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as CloudAccount; } catch { return null; }
};

export function cloudSignOut() { set(SESSION_KEY, null); set(PENDING_KEY, null); }

/** The encrypted blob of a change that could not be sent yet (PC or network off); sent on the next opportunity. */
export function pendingBlob(): string | null {
  const raw = get(PENDING_KEY);
  if (!raw) return null;
  try { return (JSON.parse(raw) as { blob?: string }).blob ?? null; } catch { return null; }
}
export function setPendingBlob(blob: string | null) {
  set(PENDING_KEY, blob ? JSON.stringify({ blob, at: Date.now() }) : null);
}

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string } | null;
  error_description?: string; msg?: string; message?: string; error?: string; error_code?: string;
}

function fail(message: string): never { throw new Error(message); }

function errorText(data: unknown, fallback: string): string {
  const d = data as Record<string, unknown> | null;
  const m = d && (d.error_description ?? d.msg ?? d.message ?? d.error);
  return typeof m === "string" && m.trim() ? m.trim() : fallback;
}

/** Clear German words for the answers the cloud gives; the service's own text stays the detail. */
function authError(status: number, data: unknown, kind: "login" | "signup"): string {
  const text = errorText(data, "").toLowerCase();
  if (text.includes("invalid login") || text.includes("invalid_grant") || status === 400 && kind === "login") return t("E-Mail oder Passwort falsch.");
  if (text.includes("already registered") || text.includes("already been registered") || text.includes("user already exists")) return t("Diese E-Mail ist schon registriert – bitte anmelden.");
  if (status === 429 || text.includes("rate limit") || text.includes("too many")) return t("Zu viele Versuche – bitte kurz warten und erneut probieren.");
  if (text.includes("password") && (text.includes("least") || text.includes("short") || text.includes("weak"))) return t("Das Passwort ist zu kurz oder zu schwach.");
  if (text.includes("email") && (text.includes("invalid") || text.includes("valid"))) return t("Bitte gib eine gültige E-Mail-Adresse an.");
  const detail = errorText(data, t("unbekannter Fehler"));
  return kind === "signup" ? t("Registrierung fehlgeschlagen: {m}", { m: detail }) : t("Anmeldung fehlgeschlagen: {m}", { m: detail });
}

async function api(path: string, init: { method?: string; body?: unknown; token?: string; prefer?: string } = {}): Promise<{ status: number; data: unknown }> {
  const cfg = cloudConfig();
  if (!cfg) fail(t("Cloud ist für diese App noch nicht eingerichtet."));
  if (typeof fetch !== "function") fail(t("Dieser Browser kann keine Verbindung zur Cloud aufbauen."));
  const headers: Record<string, string> = { apikey: cfg.anonKey, "Content-Type": "application/json", Accept: "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.prefer) headers.Prefer = init.prefer;
  let signal: AbortSignal | undefined;
  try { signal = AbortSignal.timeout(TIMEOUT_MS); } catch { signal = undefined; }
  let res: Response;
  try {
    res = await fetch(cfg.url + path, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal });
  } catch { fail(t("Der Cloud-Dienst antwortet nicht – bitte Internetverbindung prüfen.")); }
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { status: res.status, data };
}

function storeAuth(r: AuthResponse, email: string): CloudAccount {
  const userId = r.user?.id;
  if (!r.access_token || !r.refresh_token || !userId) fail(t("Der Cloud-Dienst hat keine gültige Anmeldung zurückgegeben."));
  const acc: CloudAccount = {
    email: cloudEmail(r.user?.email || email),
    userId,
    access: r.access_token,
    refresh: r.refresh_token,
    expiresAt: Date.now() + Math.max(60, r.expires_in ?? 3600) * 1000,
    savedAt: Date.now(),
  };
  set(SESSION_KEY, JSON.stringify(acc));
  return acc;
}

/** Signs up by e-mail. When the project asks for an e-mail confirmation, the user is not signed in yet – said plainly. */
export async function cloudSignUp(email: string, password: string): Promise<CloudAccount> {
  const mail = cloudEmail(email);
  if (!CLOUD_EMAIL_RX.test(mail)) fail(t("Bitte gib eine gültige E-Mail-Adresse an."));
  const r = await api("/auth/v1/signup", { method: "POST", body: { email: mail, password } });
  if (r.status >= 400) fail(authError(r.status, r.data, "signup"));
  const d = (r.data ?? {}) as AuthResponse;
  if (!d.access_token) fail(t("Konto angelegt – bitte bestätige zuerst die E-Mail über den Link, den du bekommen hast, und melde dich dann an."));
  return storeAuth(d, mail);
}

export async function cloudSignIn(email: string, password: string): Promise<CloudAccount> {
  const mail = cloudEmail(email);
  if (!CLOUD_EMAIL_RX.test(mail)) fail(t("Bitte gib eine gültige E-Mail-Adresse an."));
  const r = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email: mail, password } });
  if (r.status !== 200) fail(authError(r.status, r.data, "login"));
  return storeAuth(r.data as AuthResponse, mail);
}

/** A fresh access token; a stored session is refreshed instead of asking for the password again. */
async function access(): Promise<{ token: string; userId: string }> {
  let acc = cloudSession();
  if (!acc) fail(t("Nicht angemeldet."));
  if (acc.expiresAt - 60_000 <= Date.now()) {
    const r = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: acc.refresh } });
    if (r.status !== 200) { cloudSignOut(); fail(t("Die Anmeldung ist abgelaufen – bitte neu anmelden.")); }
    acc = storeAuth(r.data as AuthResponse, acc.email);
  }
  return { token: acc.access, userId: acc.userId };
}

/** The encrypted design of the signed-in account; null when the account has not saved one yet. */
export async function cloudLoad(): Promise<{ blob: string; updatedAt: string } | null> {
  const { token, userId } = await access();
  // The row is chosen by the id from the verified token, never by anything the caller passes in.
  const r = await api(`/rest/v1/account_blobs?select=blob,updated_at&user_id=eq.${encodeURIComponent(userId)}`, { token });
  if (r.status !== 200) fail(t("Kontodaten konnten nicht geladen werden: {m}", { m: errorText(r.data, t("unbekannter Fehler")) }));
  const rows = Array.isArray(r.data) ? (r.data as { blob?: unknown; updated_at?: unknown }[]) : [];
  const row = rows[0];
  return row && typeof row.blob === "string" ? { blob: row.blob, updatedAt: typeof row.updated_at === "string" ? row.updated_at : "" } : null;
}

export async function cloudSave(blob: string): Promise<void> {
  if (blob.length > MAX_BLOB) fail(t("Die Kontodaten sind zu groß für die Cloud (Hintergrundbild verkleinern)."));
  const { token, userId } = await access();
  const r = await api("/rest/v1/account_blobs?on_conflict=user_id", {
    method: "POST", token, prefer: "resolution=merge-duplicates,return=minimal",
    body: [{ user_id: userId, blob, updated_at: new Date().toISOString() }],
  });
  if (r.status >= 300) fail(t("Kontodaten konnten nicht gespeichert werden: {m}", { m: errorText(r.data, t("unbekannter Fehler")) }));
}

export async function cloudDelete(): Promise<void> {
  const { token, userId } = await access();
  const r = await api(`/rest/v1/account_blobs?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE", token, prefer: "return=minimal" });
  if (r.status >= 300) fail(t("Konto konnte nicht gelöscht werden: {m}", { m: errorText(r.data, t("unbekannter Fehler")) }));
}
