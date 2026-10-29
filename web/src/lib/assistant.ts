// Types and small helpers for the assistant page (unit-tested in assistant.test.ts).

import { t } from "./i18n";

export interface AssistantAction { kind: string; label: string; method?: string | null; params?: Record<string, unknown>; path?: string | null; confirm?: boolean; /** JARVIS may run it now (decided on the PC). */ auto?: boolean; target?: string | null }
export interface AssistantReply { text: string; actions: AssistantAction[]; sources: string[]; suggestions: string[]; mode: "local" | "ollama" | "claude" | "gemini" | "router" | "offline" | "device"; model?: string | null; costUsd?: number | null; /** Researched answer: numbered sources (only pages really found). */ cites?: import("./research-chat").Cite[]; /** How it was researched – or that no search ran. */ research?: import("./research-chat").ResearchInfo; /** Stopped by the user. */ cancelled?: boolean; /** Could not be done – JARVIS stops further steps. */ failed?: boolean; /** No good answer known – JARVIS may look it up. */ unsure?: boolean }
export interface ChatState { conversationId: string | null; turns: { role: "user" | "bot"; text?: string; reply?: AssistantReply; bingoId?: string; /** Settings before a JARVIS change of this website – for "Rückgängig". */ undo?: unknown }[] }

export const CHAT_KEY = "pgl.assistant.chat";

/** Example questions for the help mode without a PC (kept here so the page does not load the help texts just for these). */
export const offlineExamples = () => [t("Mach das Design hell"), t("Pack den Backlog in die Leiste"), t("Zeig die Uhr auf Home"), t("Wie richte ich Discord mit dem Soundboard ein?"), t("Öffne das Deck"), t("Was soll ich als Nächstes spielen?"), t("Wie verbinde ich mein Handy?"), t("Erstelle ein 4×4-Bingo für Minecraft auf mittel")];
/** Set-up requests that work everywhere (answered on this device, also with the PC connected). */
export const setupChips = () => [t("Mach das Design hell"), t("Pack den Backlog in die Leiste")];
/** What JARVIS can be told (from the brief – each one really works). */
export const jarvisChips = () => [t("Starte mein zuletzt gespieltes Spiel"), t("Warum ruckelt mein Spiel?"), t("Erstelle eine neue Dashboard-Anordnung für Minecraft"), t("Ordne mein Dashboard übersichtlicher an"), t("Zeige mir, welche meiner Spiele zu zweit spielbar sind"), t("Erstelle ein Gaming-Bingo für Minecraft")];
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
