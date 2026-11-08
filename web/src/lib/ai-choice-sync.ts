// The AI choice from the account is put on the PC by itself as soon as it is connected – like the memory folder and the
// weather place. Only the PC itself does it (it is the place where the AIs answer), and only with admin rights.
import { client } from "./rpc";
import { aiChoice, choiceFrom, setAiChoice, type AiChoice, type AiStrategy } from "./ai-choice";
import type { AccountRpc } from "./memory-sync";
import { t } from "./i18n";
import { toast } from "./hooks";

/** The part of "ai.status" this needs. */
export interface PcAi { providers: { id: string }[]; strategy?: AiStrategy | null; auto?: boolean; single?: string | null }

const strategyOf = (pc: PcAi): AiStrategy => pc.strategy ?? (pc.auto ? "fallback" : "single");

/** The account's order limited to the providers this PC knows; AIs it does not mention keep their place at the end. */
export function orderFor(choice: AiChoice, pcIds: string[]): string[] {
  const wanted = choice.order.filter((id) => pcIds.includes(id));
  return [...wanted, ...pcIds.filter((id) => !wanted.includes(id))];
}

/** Does the PC already answer the way the account wants it to? */
export function sameAiChoice(choice: AiChoice, pc: PcAi): boolean {
  const ids = pc.providers.map((p) => p.id);
  if (choice.strategy !== strategyOf(pc)) return false;
  if (choice.strategy === "single" && (choice.single ?? null) !== (pc.single ?? null)) return false;
  return orderFor(choice, ids).join("|") === ids.join("|");
}

let applied = "";   // what was already put on the PC in this session
let running = false;

/** Forgets what was applied (tests). */
export function resetAiChoiceSync() { applied = ""; running = false; }

export interface ApplyAiOptions {
  /** Put it on the PC even when it already matches. */
  force?: boolean;
  /** No toast on success. */
  quiet?: boolean;
}

/** Puts the account's AI choice on the PC. Returns whether something changed there. */
export async function applyAiChoiceToPc(rpc: AccountRpc = client, opts: ApplyAiOptions = {}, choice: AiChoice | null = aiChoice()): Promise<boolean> {
  if (running || !choice) return false;
  const s = rpc.status;
  if (s.phase !== "online" || s.auth !== "ok" || rpc.demo || !s.me?.isLocal || !rpc.can("admin")) return false;
  const tag = JSON.stringify(choice);
  if (!opts.force && applied === tag) return false;
  running = true;
  try {
    const pc = await rpc.call<PcAi>("ai.status");
    if (!pc?.providers?.length) return false;               // older companion or nothing to choose
    const ids = pc.providers.map((p) => p.id);
    if (!opts.force && sameAiChoice(choice, pc)) { applied = tag; return false; }
    const order = orderFor(choice, ids);
    if (order.join("|") !== ids.join("|")) await rpc.call("ai.order", { order });
    const strategy = strategyOf(pc);
    if (choice.strategy !== strategy || (choice.strategy === "single" && (choice.single ?? null) !== (pc.single ?? null)))
      await rpc.call("ai.strategy", { strategy: choice.strategy, ...(choice.strategy === "single" && choice.single ? { single: choice.single } : {}) });
    applied = tag;
    if (!opts.quiet) toast(t("KI-Auswahl auf dem PC übernommen"), "success");
    return true;
  } catch {
    return false;                                          // PC not ready – the next connection tries again
  } finally { running = false; }
}

/**
 * Writes what the PC has right now into the account, so the order and the provider travel to the next PC.
 * Saving the account itself is the caller's business (it needs the design auto-save, which pulls in the theme).
 */
export async function rememberAiChoice(rpc: AccountRpc = client): Promise<AiChoice | null> {
  const pc = await rpc.call<PcAi>("ai.status");
  const choice = choiceFrom(pc);
  if (!choice) return null;
  setAiChoice(choice);
  return choice;
}
