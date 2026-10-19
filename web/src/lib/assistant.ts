// Types and small helpers for the assistant page (unit-tested in assistant.test.ts).

export interface AssistantAction { kind: string; label: string; method?: string | null; params?: Record<string, unknown>; path?: string | null; confirm?: boolean }
export interface AssistantReply { text: string; actions: AssistantAction[]; sources: string[]; suggestions: string[]; mode: "local" | "claude"; model?: string | null; costUsd?: number | null }
export interface ChatState { conversationId: string | null; turns: { role: "user" | "bot"; text?: string; reply?: AssistantReply }[] }

export const CHAT_KEY = "pgl.assistant.chat";
export const emptyChat = (): ChatState => ({ conversationId: null, turns: [] });

/** The chat of this tab (sessionStorage – gone when the tab closes; the PC keeps the conversation at most 3 hours). */
export function readChat(): ChatState {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? "null") as ChatState | null;
    if (v && Array.isArray(v.turns)) return { conversationId: typeof v.conversationId === "string" ? v.conversationId : null, turns: v.turns.slice(-60) };
  } catch { /* ignore */ }
  return emptyChat();
}

/** Cost in US dollars: "< 0,01 $" for tiny amounts, otherwise two decimals. */
export function formatCost(usd: number): string {
  if (usd <= 0) return "0 $";
  if (usd < 0.01) return "< 0,01 $";
  return `${usd.toFixed(2).replace(".", ",")} $`;
}
