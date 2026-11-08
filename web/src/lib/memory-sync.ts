// The memory folder and its rules belong to the account. As soon as the PC is connected they are put on it by
// themselves – no button needed. Only the PC itself may do that (the folder is accepted nowhere else) and only with
// admin rights; everything else simply waits for the next connection.
import { memorySettings, type MemorySettings } from "./memory-config";
import { client } from "./rpc";
import { t } from "./i18n";
import { toast } from "./hooks";

/** What the PC reports about its memory (the fields of memory.status this needs). */
export interface PcMemory { path?: string | null; enabled: boolean; writeEnabled: boolean; deleteEnabled: boolean; auto: MemorySettings["auto"] }

/** The part of the connection this needs, so it can be tested without a PC. */
export interface MemoryRpc {
  demo?: boolean;
  status: { phase: string; auth: string; me?: { isLocal?: boolean } | null };
  can(permission: string): boolean;
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
}

export type MemoryField = keyof MemorySettings;

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

/** Forgets what was applied (tests). */
export function resetMemorySync() { applied = ""; running = false; }

function announce() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new Event("pgl-memory"));
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
    if (!opts.force && memoryMismatch(want, pc).length === 0) { applied = now; return false; }
    await rpc.call("memory.configure", { path: want.path, enabled: want.enabled, writeEnabled: want.writeEnabled, deleteEnabled: want.deleteEnabled, auto: want.auto });
    applied = now;
    announce();
    if (!opts.quiet) toast(t("Gedächtnis auf dem PC eingerichtet"), "success");
    return true;
  } catch {
    return false;                                                  // PC not ready – the next connection tries again
  } finally { running = false; }
}

/** Runs once at start and then after every new sign-in to the PC and every account switch. */
export function startMemoryAutoApply() {
  const run = () => { void applyMemoryToPc(); };
  if (client.status.auth === "ok") run();
  const off = client.on("authenticated", run);
  window.addEventListener("online", run);
  window.addEventListener("pgl-account", run);
  return () => {
    off();
    window.removeEventListener("online", run);
    window.removeEventListener("pgl-account", run);
  };
}
