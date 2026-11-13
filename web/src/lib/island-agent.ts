// AI Activity Island (3.60): what JARVIS does right now – shown in the island on the PC screen. The PC sends a short state of the
// newest task (no findings, no request text); the island shows it in the bar and offers the decision right there. Steps that
// change Windows ("kritisch") are never run from the island – they need the full plan on the JARVIS page.
import { useSyncExternalStore } from "react";
import { t } from "./i18n";

export interface AgentBrief {
  id: string; kind: "prepare" | "diagnose" | "workflow"; topic?: string; state: "planned" | "running" | "done" | "failed" | "cancelled";
  summary: string; by: string; done: number; total: number; current?: string; error?: string; critical: boolean; steps: number;
}
export type AgentPhase = "decide" | "working" | "done" | "error" | null;

/** How long a finished task stays visible in the bar. */
export const AGENT_DONE_MS = 8000;

let brief: (AgentBrief & { at: number }) | null = null;
const listeners = new Set<() => void>();
export function setAgentBrief(b: AgentBrief | null, now = Date.now()) {
  brief = b ? { ...b, at: now } : null;
  listeners.forEach((l) => l());
}
export const useAgentBrief = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => brief);

/** What the island shows for a task: a decision, work in progress, the result for a few seconds, or nothing. */
export function agentPhase(b: (AgentBrief & { at: number }) | null, now = Date.now()): AgentPhase {
  if (!b) return null;
  if (b.state === "planned") return b.steps > 0 ? "decide" : null;
  if (b.state === "running") return "working";
  if (now - b.at > AGENT_DONE_MS) return null;
  return b.state === "done" ? "done" : b.state === "failed" ? "error" : null;
}

/** The line in the bar (status words from the brief: wartet / arbeitet / Entscheidung / fertig / Fehler). */
export function agentLine(b: AgentBrief, phase: AgentPhase): string {
  switch (phase) {
    case "decide": return t("JARVIS braucht eine Entscheidung: {s}", { s: b.summary });
    case "working": return b.current ? t("JARVIS arbeitet ({d}/{n}): {c}", { d: b.done + 1, n: Math.max(b.total, 1), c: b.current }) : t("JARVIS arbeitet …");
    case "done": return t("JARVIS ist fertig: {s}", { s: b.summary });
    case "error": return t("JARVIS hat einen Fehler erkannt: {e}", { e: b.error ?? b.summary });
    default: return "";
  }
}

export const agentProgress = (b: AgentBrief) => (b.total > 0 ? Math.min(1, b.done / b.total) : 0);
