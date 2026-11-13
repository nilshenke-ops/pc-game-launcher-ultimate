// JARVIS 3.0 control centre on the website (3.59): the PC builds the plan (fixed rules, the person's own data), this side
// shows it, lets the person switch steps off or change them, confirms, follows the live status and keeps the history in view.
// Nothing here decides what runs – every step is checked again on the PC against this device's own permissions.
import { client } from "./rpc";

export type AgentTier = "read" | "prepare" | "execute" | "critical";
export type AgentStepStatus = "planned" | "skipped" | "running" | "done" | "failed" | "cancelled" | "refused";
export interface AgentOption { ref: string; label: string }
export interface AgentStep {
  id: string; kind: string; title: string; detail?: string; tier: AgentTier; permission: string; ref?: string;
  options?: AgentOption[]; selected: boolean; status: AgentStepStatus; result?: string; ok?: boolean; ms?: number;
}
export interface AgentFinding { severity: "problem" | "warn" | "info" | "ok"; title: string; evidence: string; source: string; advice?: string; page?: string }
export interface AgentTask {
  id: string; kind: "prepare" | "diagnose" | "workflow"; topic?: string; request?: string; page?: string; by: string;
  createdAt: string; startedAt?: string; endedAt?: string; model: string; costUsd: number;
  state: "planned" | "running" | "done" | "failed" | "cancelled"; summary: string;
  steps: AgentStep[]; findings: AgentFinding[]; problemsBefore?: number; problemsAfter?: number;
}
export interface AgentHistory { tasks: AgentTask[]; keep: boolean; keepRequests: boolean; total: number }

const fold = (s: string) => " " + s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim() + " ";

/**
 * Worth asking the PC for a plan? A cheap first look (the PC decides for real): preparing a session, "wenn ich X starte …",
 * or a technical problem. Ordinary questions go straight to the chat without the extra round trip.
 */
export function maybeAgentRequest(text: string): boolean {
  const f = fold(text);
  return / wenn ich .+ starte /.test(f)
    || / (bereite|bereit machen|vorbereit|startklar|klar machen|gaming session|zock ?session|session vor|runde vor|fuer eine runde) /.test(f)
    || / (diagnose|pruef|check|untersuche|warum|wieso|weshalb|funktioniert|geht nicht|klappt nicht|kaputt|problem|fehler|hoert mich|hoeren mich|ruckel|laggt|lagt|stottert|langsam|absturz|abgestuerzt|stuerzt|crash) /.test(f);
}

// ---------------------------------------------------------------- where the person is (context for "warum geht das nicht?")
let lastPage: string | null = null;
const pathOf = () => (typeof location === "undefined" ? "/" : (location.hash.replace(/^#/, "") || "/").split("?")[0]);

/** The page the person looked at last, other than JARVIS' own page (the island always sits on the page itself). */
export function currentPage(): string | null {
  const p = pathOf();
  return p.startsWith("/assistant") ? lastPage : p;
}
export function trackPages() {
  if (typeof window === "undefined") return () => undefined;
  const note = () => { const p = pathOf(); if (!p.startsWith("/assistant")) lastPage = p; };
  note();
  window.addEventListener("hashchange", note);
  return () => window.removeEventListener("hashchange", note);
}

// ---------------------------------------------------------------- calls
export async function planTask(text: string, page: string | null): Promise<AgentTask | null> {
  const r = await client.call<{ task?: AgentTask }>("jarvis.plan", { text, ...(page ? { page } : {}) });
  return r.task ?? null;
}
export const executeTask = (taskId: string, steps: string[], refs: Record<string, string>, confirmCritical: boolean) =>
  client.call<AgentTask>("jarvis.execute", { taskId, steps, refs, confirmCritical }); // up to 3 minutes (see rpc.ts)
export const cancelTask = (taskId: string) => client.call<{ cancelled: boolean }>("jarvis.cancelTask", { taskId });
export const stopAll = () => client.call<{ stopped: number }>("jarvis.stop", {});

// ---------------------------------------------------------------- words
export const TIER_LABEL: Record<AgentTier, string> = { read: "Nur ansehen", prepare: "Vorbereiten", execute: "Ausführen", critical: "Kritisch" };
export const STATUS_LABEL: Record<AgentStepStatus, string> = {
  planned: "geplant", skipped: "übersprungen", running: "läuft …", done: "erledigt", failed: "fehlgeschlagen", cancelled: "abgebrochen", refused: "nicht erlaubt",
};
export const KIND_LABEL: Record<AgentTask["kind"], string> = { prepare: "Vorbereitung", diagnose: "Diagnose", workflow: "Ablauf" };
export const TOPIC_LABEL: Record<string, string> = { audio: "Audio", network: "Netzwerk", performance: "Leistung", updates: "Updates", crashes: "Abstürze", general: "Gesamt" };
export const PERM_LABEL: Record<string, string> = { view: "Ansehen", launch: "Starten", manage: "Verwalten" };

/** Which steps would run when "Ausführen" is tapped now. */
export const chosenSteps = (t: AgentTask, picked: Record<string, boolean>) => t.steps.filter((s) => s.kind !== "verify" && (picked[s.id] ?? s.selected)).map((s) => s.id)
  .concat(t.steps.filter((s) => s.kind === "verify" && (picked[s.id] ?? s.selected)).map((s) => s.id));

/** A critical step is among the chosen ones – then a separate confirmation is needed. */
export const needsCritical = (t: AgentTask, ids: string[]) => t.steps.some((s) => s.tier === "critical" && ids.includes(s.id));

export const durationText = (t: AgentTask) => {
  if (!t.startedAt || !t.endedAt) return null;
  const ms = Date.parse(t.endedAt) - Date.parse(t.startedAt);
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s`;
};
