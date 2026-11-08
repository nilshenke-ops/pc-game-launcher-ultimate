// Which free AI answers first and how they work together. That is not a key, so it may travel with the account – a new
// PC or a fresh install then keeps the choice instead of starting from the default order.
import { readJson, writeJson } from "./rpc";

export const AI_CHOICE_KEY = "pgl.aiChoice";
export type AiStrategy = "fallback" | "race" | "single";
export interface AiChoice { order: string[]; strategy: AiStrategy; single?: string | null; savedAt?: number }

const STRATEGIES: AiStrategy[] = ["fallback", "race", "single"];
export const isAiStrategy = (v: unknown): v is AiStrategy => typeof v === "string" && (STRATEGIES as string[]).includes(v);

/** The account's AI choice, or null when nothing was remembered yet. */
export function aiChoice(): AiChoice | null {
  const raw = readJson<Partial<AiChoice>>(AI_CHOICE_KEY);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.order)) return null;
  const order = raw.order.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 12);
  if (!order.length) return null;
  return {
    order,
    strategy: isAiStrategy(raw.strategy) ? raw.strategy : "fallback",
    single: typeof raw.single === "string" && raw.single ? raw.single : null,
    ...(typeof raw.savedAt === "number" && raw.savedAt > 0 ? { savedAt: raw.savedAt } : {}),
  };
}

export function setAiChoice(choice: AiChoice | null) {
  writeJson(AI_CHOICE_KEY, choice ? { ...choice, savedAt: Date.now() } : null);
}

/** The choice as the PC has it right now (what "ai.status" reports). */
export function choiceFrom(o: { providers?: { id: string }[]; strategy?: string | null; auto?: boolean; single?: string | null }): AiChoice | null {
  const order = (o.providers ?? []).map((p) => p.id).filter((id) => !!id);
  if (!order.length) return null;
  const strategy: AiStrategy = isAiStrategy(o.strategy) ? o.strategy : o.auto ? "fallback" : "single";
  return { order, strategy, single: strategy === "single" ? o.single ?? null : null };
}
