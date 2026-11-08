// Where the person lives belongs to the account (pgl.homePlace) – on the phone it is already set before the PC is
// connected. The PC keeps its own copy for weather questions, so it is set there by itself as soon as the connection
// is there; nobody has to say "Ich wohne in …" a second time.
import { homePlace } from "./weather";
import { client } from "./rpc";
import type { AccountRpc } from "./memory-sync";
import { t } from "./i18n";
import { toast } from "./hooks";

const norm = (p: string) => p.trim().replace(/\s+/g, " ").toLowerCase();

/** Same place, or not? ("adendorf" = "Adendorf ", but "Bad Homburg" ≠ "Homburg"). */
export const sameHomePlace = (a: string, b: string) => norm(a) === norm(b);

let applied = "";   // what was already put on the PC in this session
let running = false;

/** Forgets what was applied (tests). */
export function resetHomePlaceSync() { applied = ""; running = false; }

export interface ApplyHomeOptions {
  /** Put it on the PC even when it already matches. */
  force?: boolean;
  /** No toast on success. */
  quiet?: boolean;
}

/** Puts the account's place on the PC. Returns whether it changed something there. */
export async function applyHomePlaceToPc(rpc: AccountRpc = client, opts: ApplyHomeOptions = {}, place: string | null = homePlace()): Promise<boolean> {
  if (running) return false;
  const want = place?.trim();
  if (!want) return false;                                        // no place in the account yet
  const s = rpc.status;
  if (s.phase !== "online" || s.auth !== "ok" || rpc.demo || !s.me?.isLocal || !rpc.can("admin")) return false;
  if (!opts.force && applied === norm(want)) return false;
  running = true;
  try {
    const pc = await rpc.call<{ homePlace?: string | null }>("assistant.status");
    if (!("homePlace" in pc)) return false;                        // older companion – nothing to set
    if (!opts.force && sameHomePlace(want, pc.homePlace ?? "")) { applied = norm(want); return false; }
    await rpc.call("assistant.homePlace", { place: want });
    applied = norm(want);
    if (!opts.quiet) toast(t("Wetter-Ort auf dem PC eingerichtet"), "success");
    return true;
  } catch {
    return false;                                                  // PC not ready – the next connection tries again
  } finally { running = false; }
}
