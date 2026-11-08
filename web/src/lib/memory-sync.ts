// The memory folder and its rules belong to the account. As soon as the PC is connected they are put on it by
// themselves – no button needed. Only the PC itself may do that (the folder is accepted nowhere else) and only with
// admin rights; everything else simply waits for the next connection.
import { memorySettings, setMemorySettings, type MemorySettingField, type MemorySettings } from "./memory-config";
import { client } from "./rpc";
import { t } from "./i18n";
import { toast } from "./hooks";

/** What the PC reports about its memory (the fields of memory.status this needs). */
export interface PcMemory { path?: string | null; enabled: boolean; writeEnabled: boolean; deleteEnabled: boolean; auto: MemorySettings["auto"] }

/** The part of the connection this needs, so it can be tested without a PC. */
export interface AccountRpc {
  demo?: boolean;
  status: { phase: string; auth: string; me?: { isLocal?: boolean } | null };
  can(permission: string): boolean;
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
}

/** Old name, kept so existing code and tests read the same. */
export type MemoryRpc = AccountRpc;

export type MemoryField = MemorySettingField;

const norm = (p: string) => p.trim().replace(/\//g, "\\").replace(/[\\\s]+$/, "").toLowerCase();

/** Windows paths differ in case and trailing slash – the same folder stays the same folder. */
export const sameMemoryPath = (a: string, b: string) => norm(a) === norm(b);

/** What the PC does not have like the account yet (empty = nothing to do). */
export function memoryMismatch(want: MemorySettings, pc: PcMemory): MemoryField[] {
  const out: MemoryField[] = [];
  if (want.path && !sameMemoryPath(want.path, pc.path ?? "")) out.push("path");
  if (want.enabled !== pc.enabled) out.push("enabled");
  if (want.writeEnabled !== pc.writeEnabled) out.push("writeEnabled");
  if (want.deleteEnabled !== pc.deleteEnabled) out.push("deleteEnabled");
  if (want.auto !== pc.auto) out.push("auto");
  return out;
}

const tag = (m: MemorySettings) => [m.path, m.enabled, m.writeEnabled, m.deleteEnabled, m.auto].join("|");

let applied = "";   // what was already put on the PC in this session
let running = false;

/** What the last connection did with the account's memory settings (null = not tried yet). */
export interface MemoryApplyResult { at: number; state: "applied" | "same" | "failed"; fields: MemoryField[] }
let last: MemoryApplyResult | null = null;
export const lastMemoryApply = () => last;

/** Forgets what was applied (tests). */
export function resetMemorySync() { applied = ""; running = false; last = null; }

function announce() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new Event("pgl-memory"));
}

/** Keeps the outcome for the card ("what did the last connection take over?") and tells the views about it. */
function record(state: MemoryApplyResult["state"], fields: MemoryField[] = []) {
  last = { at: Date.now(), state, fields };
  announce();
}

export interface ApplyMemoryOptions {
  /** Put it on the PC even when it already matches (the card's button). */
  force?: boolean;
  /** No toast on success. */
  quiet?: boolean;
}

/**
 * Puts the account's memory settings on the PC. Returns whether something changed there.
 * Runs without asking: at start, after every new sign-in to the PC and after switching the account.
 */
export async function applyMemoryToPc(rpc: MemoryRpc = client, opts: ApplyMemoryOptions = {}, want: MemorySettings = memorySettings()): Promise<boolean> {
  if (running) return false;
  if (!want.path) return false;                                    // nothing set up in the account yet
  const s = rpc.status;
  if (s.phase !== "online" || s.auth !== "ok" || rpc.demo || !s.me?.isLocal || !rpc.can("admin")) return false;
  const now = tag(want);
  if (!opts.force && applied === now) return false;
  running = true;
  try {
    const pc = await rpc.call<PcMemory>("memory.status");
    const missing = memoryMismatch(want, pc);
    if (!opts.force && missing.length === 0) { applied = now; record("same"); return false; }
    await rpc.call("memory.configure", { path: want.path, enabled: want.enabled, writeEnabled: want.writeEnabled, deleteEnabled: want.deleteEnabled, auto: want.auto });
    applied = now;
    // Into the account as well: on the phone the card can then say what the PC took over.
    if (missing.length) setMemorySettings({ appliedAt: Date.now(), appliedFields: missing });
    record("applied", missing);
    if (!opts.quiet) toast(t("Gedächtnis auf dem PC eingerichtet"), "success");
    return true;
  } catch {
    record("failed");
    return false;                                                  // PC not ready – the next connection tries again
  } finally { running = false; }
}

