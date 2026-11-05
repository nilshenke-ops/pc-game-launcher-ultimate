// The free AI without the PC as a chat answer: asked once per device ("Darf ich?"), then it answers general questions.
import { t } from "./i18n";
import type { AssistantReply } from "./assistant";
import { askFreeAi, FREE_AI_NAME, FREE_AI_NOTICE, freeAiConsent, FreeAiError, type Turn } from "./free-ai";

const base = (text: string, more: Partial<AssistantReply> = {}): AssistantReply => ({ text, actions: [], sources: [], suggestions: [], mode: "device", ...more });

/** "Darf ich die freie KI fragen?" – the question travels with the buttons, "Ja" asks it again. */
export function freeAiOffer(question: string, lead?: string): AssistantReply {
  return base(`${lead ? lead + "\n\n" : ""}${t(FREE_AI_NOTICE)}`, { actions: [
    { kind: "freeAiChoice", label: t("Ja, freie KI nutzen"), params: { question, ok: true } },
    { kind: "freeAiChoice", label: t("Nein"), params: { question, ok: false } },
  ] });
}

/**
 * The answer for a general question without the PC. With this device's yes: the free AI answers (marked, with its name);
 * not asked yet: the offer; "no": the built-in answer stays as it is.
 */
export async function freeAiAnswer(question: string, history: Turn[], fallback: AssistantReply, onWait?: (seconds: number) => void): Promise<AssistantReply> {
  const c = freeAiConsent();
  if (c === "no") return fallback;
  if (c === "ask") return freeAiOffer(question, fallback.text);
  try {
    const r = await askFreeAi(question, { history, onWait });
    return base(r.text, { mode: "free", model: r.model || null, costUsd: 0, sources: [FREE_AI_NAME], research: undefined });
  } catch (e) {
    return base(`${e instanceof FreeAiError ? e.message : t("Die freie KI hat nicht geantwortet.")}\n\n${fallback.text}`, { failed: false });
  }
}
